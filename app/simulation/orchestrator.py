import asyncio
import datetime
import logging
import random
import re
from typing import List, Dict, Any, Optional

from app.utils.sanitizer import sanitize_model_output, format_debate_summary
from app.utils.json_extractor import parse_json
from app.utils.thought_buffer import ThoughtBuffer
from app.personas.roster_builder import build_agent_roster
from app.personas.state_profiles import DEFAULT_COUNCIL_STATES
from app.simulation.keyword_analyzer import classify_impact_by_keywords
from app.simulation.state import SimulationState
from app.simulation.round_barrier import RoundBarrier
from app.http.sse_manager import SseManager
from app.providers.base_driver import BaseLlmDriver
import app.prompts as prompts

logger = logging.getLogger("simulation:council")


class CouncilOrchestrator:
    def __init__(
        self,
        config: Any,
        driver: BaseLlmDriver,
        sse_manager: SseManager,
        state: Optional[SimulationState] = None,
        barrier: Optional[RoundBarrier] = None,
        step_delay: float = 0.3,
        speech_delay: float = 0.4,
        verdict_delay: float = 2.0,
        enable_barrier: bool = True,
    ):
        self.config = config
        self.driver = driver
        self.sse = sse_manager
        self.state = state if state is not None else SimulationState()
        self.barrier = (barrier or RoundBarrier()) if enable_barrier else None

        self.step_delay = step_delay
        self.speech_delay = speech_delay
        self.verdict_delay = verdict_delay
        self._run_driver: Optional[BaseLlmDriver] = None

    def is_council_running(self) -> bool:
        return self.state.is_running()

    def get_latest_story(self) -> Optional[Dict[str, Any]]:
        return self.state.get_story()

    def set_story(self, story: Optional[Dict[str, Any]]):
        self.state.set_story(story)

    def mark_round_begun(self, round_num: Any) -> Dict[str, Any]:
        res = self.barrier.mark_round_begun(round_num)
        if res.get("ok"):
            self.sse.notify_status(f"Round {res.get('round')} started.")
        return res

    def _active_driver(self) -> BaseLlmDriver:
        return self._run_driver or self.driver

    async def _complete(self, messages: List[Dict[str, str]], max_tokens: int, driver: Optional[BaseLlmDriver] = None) -> str:
        d = driver or self._active_driver()
        return await d.complete(messages, max_tokens)

    async def summarise_policy(self, query: str, driver: Optional[BaseLlmDriver] = None) -> Optional[Dict[str, Any]]:
        text = (query or "").strip()
        if not text:
            return None

        active = driver or self._active_driver()
        short_title = await self._summarize_policy_title(text, active)
        self.sse.broadcast("topic", {"title": short_title or "Policy"})

        summary = await self._summarize_policy_text(text, active)

        story = {
            "title": short_title or summary or "Policy summary",
            "source": "Agent summary",
            "url": "",
            "publishedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "description": text,
            "summary": summary,
        }
        self.set_story(story)
        self.sse.broadcast("feed", story)
        return story

    async def run_council(self, story: Dict[str, Any], driver: Optional[BaseLlmDriver] = None) -> bool:
        if not self.state.acquire():
            logger.warning("Council run requested while another is in progress; ignoring")
            return False

        if story:
            self.set_story(story)
        if self.barrier:
            self.barrier.reset()
        self._run_driver = driver

        try:
            await self._run_pipeline(story)
            return True
        except Exception as e:
            logger.error(f"Council deliberation encountered an error: {e}", exc_info=True)
            self.sse.broadcast("error", {"message": "Council deliberation encountered an error. Check settings and retry."})
            return False
        finally:
            self._run_driver = None
            self.state.release()

    async def _run_pipeline(self, story: Dict[str, Any]):
        council_states = getattr(self.config, "council_states", None) or DEFAULT_COUNCIL_STATES
        all_agents = build_agent_roster(council_states)
        all_states = [a["state"] for a in all_agents]
        panel_size = getattr(self.config, "panel_size", 5)
        rebuttal_size = getattr(self.config, "rebuttal_size", 3)
        transcript = []

        self.sse.broadcast(
            "council_start",
            {
                "story": {"title": story.get("title", ""), "url": story.get("url", "")},
                "agents": [{"name": a["name"], "state": a["state"]} for a in all_agents],
            },
        )

        # ── Round 0: Impact Declarations ──────────────────────────────────────────
        logger.info("Round 0: impact declarations")
        self.sse.broadcast("round_start", {"round": 0, "label": "Impact Declarations", "count": len(all_agents)})
        self.sse.broadcast(
            "system",
            {
                "round": 0,
                "message": f"Round 0: IMPACT DECLARATIONS\nAll {len(all_agents)} states declare how this policy affects them.",
            },
        )
        await self._wait_for_round(0)

        declarations = []
        for agent in all_agents:
            messages, max_tokens = prompts.build_impact_prompt(agent, story)
            msg = await self._agent_speak(agent, messages, max_tokens, 0, "Declaration")
            entry = {"agent": agent["name"], "state": agent["state"], "message": msg, "round": 0, "label": "Declaration"}
            transcript.append(entry)
            declarations.append(entry)
            if self.step_delay:
                await asyncio.sleep(self.step_delay)

        await self._emit_round_summary(story, 0, "Impact Declarations", declarations)

        # ── Moderator Panel Selection ────────────────────────────────────────────
        logger.info("Selecting panel from declarations")
        self.sse.broadcast(
            "system",
            {
                "round": 0,
                "loading": True,
                "stream": True,
                "message": "Moderator is now analysing all arguments and choosing which states move to round 1...",
            },
        )
        selected_states, benched_states = await self._select_panel(declarations, all_states, panel_size)
        self.sse.broadcast("panel_selected", {"round": 1, "selected": selected_states, "benched": benched_states})

        # ── Round 1: Opening Statements ──────────────────────────────────────────
        panel_agents = [a for a in all_agents if a["state"] in selected_states]
        shuffled_panel = list(panel_agents)
        random.shuffle(shuffled_panel)

        order_states = [a["state"] for a in shuffled_panel]
        self.sse.broadcast("round_start", {"round": 1, "label": "Opening Statements", "count": len(shuffled_panel), "order": order_states})
        self.sse.broadcast(
            "system",
            {
                "round": 1,
                "message": (
                    f"Round 1: OPENING STATEMENTS\n"
                    f"PANEL SELECTED: {', '.join(selected_states)}\n"
                    f"Benched: {', '.join(benched_states)}\n"
                    f"Speaking order: {' → '.join(order_states)}"
                ),
            },
        )
        await self._wait_for_round(1)

        round1_speeches = []
        for agent in shuffled_panel:
            messages, max_tokens = prompts.build_opening_prompt(agent, story, declarations, round1_speeches)
            msg = await self._agent_speak(agent, messages, max_tokens, 1, "Opening")
            entry = {"agent": agent["name"], "state": agent["state"], "message": msg, "round": 1, "label": "Opening"}
            transcript.append(entry)
            round1_speeches.append(entry)
            if self.speech_delay:
                await asyncio.sleep(self.speech_delay)

        await self._emit_round_summary(story, 1, "Opening Statements", round1_speeches)

        # ── Moderator Rebuttal Selection ─────────────────────────────────────────
        logger.info("Round 2: selecting rebuttals")
        self.sse.broadcast(
            "system",
            {
                "round": 1,
                "loading": True,
                "stream": True,
                "message": "Moderator is now analysing all arguments and choosing which states move to round 2...",
            },
        )
        rebuttal_states = await self._select_rebuttal_panel(story, transcript, selected_states, rebuttal_size)
        rebuttal_agents = [a for a in all_agents if a["state"] in rebuttal_states]
        random.shuffle(rebuttal_agents)
        rebuttal_order = [a["state"] for a in rebuttal_agents]

        self.sse.broadcast("rebuttal_selected", {"round": 2, "rebuttal_panel": rebuttal_states})
        self.sse.broadcast("round_start", {"round": 2, "label": "Rebuttals", "count": len(rebuttal_agents), "order": rebuttal_order})
        self.sse.broadcast("system", {"round": 2, "message": f"Round 2: REBUTTALS\n{' → '.join(rebuttal_order)} will debate."})
        await self._wait_for_round(2)

        round2_speeches = []
        for agent in rebuttal_agents:
            messages, max_tokens = prompts.build_rebuttal_prompt(agent, story, transcript, round2_speeches)
            msg = await self._agent_speak(agent, messages, max_tokens, 2, "Rebuttal")
            entry = {"agent": agent["name"], "state": agent["state"], "message": msg, "round": 2, "label": "Rebuttal"}
            transcript.append(entry)
            round2_speeches.append(entry)
            if self.speech_delay:
                await asyncio.sleep(self.speech_delay)

        await self._emit_round_summary(story, 2, "Rebuttals", round2_speeches)

        # ── Round 3: Right of Reply ──────────────────────────────────────────────
        logger.info("Round 3: selecting right of reply")
        self.sse.broadcast(
            "system",
            {
                "round": 2,
                "loading": True,
                "stream": True,
                "message": "Moderator is identifying the most attacked state for Right of Reply...",
            },
        )
        reply_state_name = await self._select_reply_state(story, transcript, rebuttal_states)
        reply_agent = next((a for a in all_agents if a["state"] == reply_state_name), None)

        if reply_agent:
            self.sse.broadcast("reply_selected", {"round": 3, "reply_state": reply_state_name})
            self.sse.broadcast("round_start", {"round": 3, "label": "Right of Reply", "count": 1, "order": [reply_state_name]})
            self.sse.broadcast(
                "system",
                {
                    "round": 3,
                    "message": f"Round 3: RIGHT OF REPLY\nRight of Reply granted to: {reply_state_name}\n{reply_state_name} has the final word.",
                },
            )
            await self._wait_for_round(3)

            messages, max_tokens = prompts.build_reply_prompt(reply_agent, story, transcript)
            msg = await self._agent_speak(reply_agent, messages, max_tokens, 3, "Right of Reply")
            round3_entry = {"agent": reply_agent["name"], "state": reply_agent["state"], "message": msg, "round": 3, "label": "Right of Reply"}
            transcript.append(round3_entry)
            if self.speech_delay:
                await asyncio.sleep(self.speech_delay)
            await self._emit_round_summary(story, 3, "Right of Reply", [round3_entry])

        # ── Round 4: Summary, Verdict & State Map Assessment ─────────────────────
        logger.info("Round 4: summary and verdict")
        self.sse.broadcast("round_start", {"round": 4, "label": "Verdict", "count": 0, "order": []})
        if self.verdict_delay:
            await asyncio.sleep(self.verdict_delay)

        summary = await self._get_council_summary(story, transcript)
        impacts = await self._get_impact_assessment(story, transcript, all_states)

        self.sse.broadcast("council_end", {"round": 4, "summary": summary, "impacts": impacts})
        logger.info(f"Deliberation complete. Positive impacts: {impacts.get('positive')}, Negative: {impacts.get('negative')}")

    async def _agent_speak(self, agent: Dict[str, Any], messages: List[Dict[str, str]], max_tokens: int, round_num: int, label: str) -> str:
        payload_base = {"agent": agent["name"], "state": agent["state"], "round": round_num, "label": label}
        use_stream = getattr(self.config, "llm_stream", True) is not False
        show_reasoning = getattr(self.config, "show_reasoning", False)

        self.sse.broadcast("agent_start", {**payload_base, "show_reasoning": show_reasoning})
        d = self._active_driver()

        if use_stream:
            tb = ThoughtBuffer(
                on_delta=lambda full, chunk: self.sse.broadcast("agent_delta", {**payload_base, "delta": chunk}),
                on_reasoning_delta=lambda full, chunk: (
                    self.sse.broadcast("agent_reasoning_delta", {**payload_base, "delta": chunk})
                    if show_reasoning else None
                ),
            )

            def on_delta(delta: str):
                tb.feed(delta)

            def on_reasoning_delta(r_delta: str):
                tb.feed_reasoning(r_delta)

            try:
                await d.stream(messages, max_tokens, on_delta=on_delta, on_reasoning_delta=on_reasoning_delta)
                tb.flush()
                cleaned = sanitize_model_output(tb.public_buffer)
                full_reasoning = tb.reasoning_buffer.strip()
                self.sse.broadcast("agent", {
                    **payload_base,
                    "message": cleaned,
                    "reasoning": full_reasoning if show_reasoning else "",
                })
                return cleaned
            except Exception as e:
                logger.error(f"Agent streaming failed for {agent['state']}: {e}")
                fallback = "Signal lost. Unable to reach model provider."
                self.sse.broadcast("agent", {**payload_base, "message": fallback})
                return fallback
        else:
            try:
                res = await d.complete(messages, max_tokens)
                cleaned = sanitize_model_output(res)
                thought_match = re.search(r"<(?:thought|think)\b[^>]*>([\s\S]*?)<\/(?:thought|think)>", res, re.IGNORECASE)
                extracted_reasoning = thought_match.group(1).strip() if thought_match else ""
                self.sse.broadcast("agent", {
                    **payload_base,
                    "message": cleaned,
                    "reasoning": extracted_reasoning if show_reasoning else "",
                })
                return cleaned
            except Exception as e:
                logger.error(f"Agent completion failed for {agent['state']}: {e}")
                fallback = "Signal lost. Unable to reach model provider."
                self.sse.broadcast("agent", {**payload_base, "message": fallback})
                return fallback

    async def _select_panel(self, declarations: List[Dict[str, Any]], all_states: List[str], panel_size: int) -> tuple[List[str], List[str]]:
        messages, max_tokens = prompts.build_selection_prompt(declarations, all_states, panel_size)
        try:
            res = await self._complete(messages, max_tokens)
            parsed = parse_json(res)
            if parsed and isinstance(parsed.get("selected"), list):
                valid = [s for s in parsed["selected"] if s in all_states]
                if len(valid) >= 2:
                    selected = valid[:panel_size]
                    benched = [s for s in all_states if s not in selected]
                    return selected, benched
            raise ValueError("Malformed selection JSON")
        except Exception as e:
            logger.warning(f"Panel selection LLM failed; falling back to random: {e}")
            shuffled = list(all_states)
            random.shuffle(shuffled)
            selected = shuffled[:panel_size]
            benched = [s for s in all_states if s not in selected]
            return selected, benched

    async def _select_rebuttal_panel(self, story: Dict[str, Any], transcript: List[Dict[str, Any]], panel_states: List[str], rebuttal_size: int) -> List[str]:
        messages, max_tokens = prompts.build_rebuttal_selection_prompt(story, transcript, panel_states, rebuttal_size)
        try:
            res = await self._complete(messages, max_tokens)
            parsed = parse_json(res)
            if parsed and isinstance(parsed.get("rebuttal_panel"), list):
                valid = [s for s in parsed["rebuttal_panel"] if s in panel_states]
                if len(valid) >= 2:
                    return valid[:rebuttal_size]
            raise ValueError("Malformed rebuttal panel JSON")
        except Exception as e:
            logger.warning(f"Rebuttal selection LLM failed; falling back to shuffle: {e}")
            shuffled = list(panel_states)
            random.shuffle(shuffled)
            return shuffled[:rebuttal_size]

    async def _select_reply_state(self, story: Dict[str, Any], transcript: List[Dict[str, Any]], rebuttal_states: List[str]) -> str:
        messages, max_tokens = prompts.build_reply_selection_prompt(story, transcript, rebuttal_states)
        try:
            res = await self._complete(messages, max_tokens)
            parsed = parse_json(res)
            if parsed and parsed.get("reply_state") in rebuttal_states:
                return parsed["reply_state"]
            raise ValueError("Malformed reply state JSON")
        except Exception as e:
            logger.warning(f"Reply selection LLM failed; using first rebuttal state: {e}")
            return rebuttal_states[0] if rebuttal_states else "Tamil Nadu"

    async def _emit_round_summary(self, story: Dict[str, Any], round_num: int, round_label: str, round_transcript: List[Dict[str, Any]]):
        if not round_transcript:
            return
        messages, max_tokens = prompts.build_round_summary_prompt(story, round_label, round_transcript)
        try:
            res = await self._complete(messages, max_tokens)
            summary = format_debate_summary(res)
            if summary:
                self.sse.broadcast(
                    "round_summary",
                    {
                        "round": round_num,
                        "label": round_label,
                        "agent": "Round Summary Agent",
                        "message": summary,
                    },
                )
        except Exception as e:
            logger.error(f"Round summary failed for {round_label}: {e}")

    async def _get_council_summary(self, story: Dict[str, Any], transcript: List[Dict[str, Any]]) -> str:
        messages, max_tokens = prompts.build_council_summary_prompt(story, transcript)
        try:
            res = await self._complete(messages, max_tokens)
            summary = format_debate_summary(res)
            return summary or "Council reached consensus on regional economic coordination."
        except Exception as e:
            logger.error(f"Council summary failed: {e}")
            return "Council reached no clear consensus."

    async def _get_impact_assessment(self, story: Dict[str, Any], transcript: List[Dict[str, Any]], all_states: List[str]) -> Dict[str, List[str]]:
        messages, max_tokens = prompts.build_impact_assessment_prompt(story, transcript, all_states)
        try:
            res = await self._complete(messages, max_tokens)
            parsed = parse_json(res)
            if parsed and isinstance(parsed.get("positive"), list) and isinstance(parsed.get("negative"), list):
                pos = [s for s in parsed["positive"] if s in all_states]
                neg = [s for s in parsed["negative"] if s in all_states]
                return {"positive": pos, "negative": neg}
            raise ValueError("Malformed impact JSON")
        except Exception as e:
            logger.warning(f"Impact assessment LLM failed; falling back to keyword heuristics: {e}")
            return classify_impact_by_keywords(transcript, all_states)

    async def _summarize_policy_title(self, text: str, driver: BaseLlmDriver) -> str:
        messages, max_tokens = prompts.build_title_prompt(text)
        try:
            res = await driver.complete(messages, max_tokens)
            cleaned = sanitize_model_output(res)
            words = [w for w in re.sub(r"[^\w\s]", " ", cleaned).strip().split() if w]
            if words:
                candidate = " ".join(words[:3])
                if not re.match(r"^policy$", candidate, re.IGNORECASE):
                    return candidate
        except Exception as e:
            logger.error(f"Policy title extraction failed: {e}")
        return self._title_fallback(text)

    def _title_fallback(self, text: str) -> str:
        cleaned = re.sub(r"[#*_>`~\[\]\(\)\{\}\"'\-]", " ", text or "")
        stop_words = {"the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with", "by", "as", "is", "are", "be"}
        words = [w.capitalize() for w in cleaned.split() if w.lower() not in stop_words]
        return " ".join(words[:3]) if words else "Policy Proposal"

    async def _summarize_policy_text(self, text: str, driver: BaseLlmDriver) -> str:
        messages, max_tokens = prompts.build_summary_prompt(text)
        try:
            res = await driver.complete(messages, max_tokens)
            cleaned = sanitize_model_output(res)
            if cleaned and cleaned != "Policy summary unavailable.":
                sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", cleaned) if s.strip()]
                if len(sentences) >= 2:
                    return f"{sentences[0]} {sentences[1]}"
                if sentences:
                    return sentences[0]
        except Exception as e:
            logger.error(f"Policy text summary failed: {e}")

        cleaned_text = (text or "").strip()
        return f"The policy is about {cleaned_text}. It establishes key development and regulatory frameworks across participating state jurisdictions."

    async def _wait_for_round(self, round_num: int):
        if not self.barrier:
            return
        await self.barrier.wait_for_round_begin(
            round_num,
            on_waiting=lambda r: self.sse.notify_status(f"Waiting for user to begin round {r}."),
        )
