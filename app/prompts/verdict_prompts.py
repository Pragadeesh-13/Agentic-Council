from typing import List, Dict, Any, Tuple
from app.personas.state_profiles import DEFAULT_COUNCIL_STATES
from app.prompts.council_prompts import format_transcript_entries


def build_round_summary_prompt(
    story: Any,
    round_label: str,
    round_transcript: Any,
) -> Tuple[List[Dict[str, str]], int]:
    title = story.get("title", "Policy Debate") if isinstance(story, dict) else str(story or "Policy Debate")
    transcript = format_transcript_entries(round_transcript)

    messages = [
        {
            "role": "system",
            "content": (
                "You are Round Summary Agent. Provide a concise, factual summary of the round in 1-3 short sentences. "
                "Synthesize the main arguments. Sentence 1: main point or outcome. Sentence 2: the most important supporting contrast or implication. "
                "Do NOT include <think>/<thought> tags, markdown, bullets, or speaker lists. Return only the summary text."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Story: {title}\nRound: {round_label}\n"
                f"Round transcript:\n{transcript}\n\n"
                "Return only the summary text."
            ),
        },
    ]
    return messages, 4096


def build_council_summary_prompt(
    story: Any,
    transcript: Any,
) -> Tuple[List[Dict[str, str]], int]:
    title = story.get("title", "") if isinstance(story, dict) else str(story or "")
    transcript_text = format_transcript_entries(transcript)

    messages = [
        {
            "role": "system",
            "content": (
                "You are a Strategic Systems Analyst. Produce a concise, objective summary of the council debate "
                "in up to 3 short sentences. No preamble or parliamentary jargon. "
                "Sentence 1: one-line 'Key issue' that the council focused on. "
                "Sentence 2: the primary contrast between the two most opposing states (use the form: 'While [State A] argues X, [State B] counters with Y'). "
                "Sentence 3 (optional): a one-sentence actionable takeaway or implication for policy/stakeholders. Use factual, unambiguous language."
            ),
        },
        {
            "role": "user",
            "content": f"Story: {title}\nDebate transcript:\n{transcript_text}\n\nSummarize:",
        },
    ]
    return messages, 4096


def build_impact_assessment_prompt(
    story: Any,
    transcript: Any,
    states: List[str] = None,
) -> Tuple[List[Dict[str, str]], int]:
    title = story.get("title", "") if isinstance(story, dict) else str(story or "")
    transcript_text = format_transcript_entries(transcript)
    state_list = states if isinstance(states, list) else DEFAULT_COUNCIL_STATES

    messages = [
        {
            "role": "system",
            "content": (
                "You are the Impact Assessment Agent. Based on the debate transcript, return ONLY valid JSON: {\n"
                '  "positive": ["State A", ...],\n'
                '  "negative": ["State B", ...]\n'
                "}. Positive = states that benefit economically; Negative = states that are harmed or at risk. "
                "Use exact state names from the provided list. No explanation."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Story: {title}\nDebate transcript:\n{transcript_text}\n\n"
                f"States: {', '.join(state_list)}\n"
                "Categorize positive and negative states JSON arrays. Return JSON only:"
            ),
        },
    ]
    return messages, 4096


def build_verdict_prompt(
    story: Any,
    transcript: Any,
    states: List[str] = None,
) -> Tuple[List[Dict[str, str]], int]:
    title = story.get("title", "") if isinstance(story, dict) else str(story or "")
    transcript_text = format_transcript_entries(transcript)
    state_list = states if isinstance(states, list) else DEFAULT_COUNCIL_STATES

    messages = [
        {
            "role": "system",
            "content": (
                "You are the Council Moderator. Return ONLY valid JSON, no markdown, no explanation: "
                '{"winner":"StateName","loser":"StateName"}. '
                "Winner = state that benefits MOST economically. Loser = state that suffers MOST. "
                "Use exact state names."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Story: {title}\n"
                f"Debate:\n{transcript_text}\n\n"
                f"States: {', '.join(state_list)}\n"
                "Return JSON only:"
            ),
        },
    ]
    return messages, 4096
