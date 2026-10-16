from typing import List, Dict, Any, Tuple
from app.personas.alliance_resolver import resolve_allies, format_alliance_directive


def format_transcript_entries(entries: Any) -> str:
    if not entries:
        return ""
    if isinstance(entries, str):
        return entries
    if not isinstance(entries, list):
        return str(entries)

    lines = []
    for e in entries:
        if isinstance(e, dict):
            speaker = e.get("agent") or e.get("name") or e.get("state") or "Delegate"
            msg = e.get("message") or e.get("content") or e.get("speech") or ""
            lines.append(f'- {speaker}: "{msg}"')
        else:
            lines.append(f'- {str(e)}')
    return "\n".join(lines)


def build_impact_prompt(agent: Dict[str, Any], story: Dict[str, Any]) -> Tuple[List[Dict[str, str]], int]:
    state = agent.get("state", "State")
    party = agent.get("party", "Independent")
    focus = agent.get("focus", "General development")
    title = story.get("title", "") if story else ""
    desc = (story.get("description") or story.get("summary") or "No summary.") if story else ""

    messages = [
        {
            "role": "system",
            "content": (
                f"You are the {state} representative. Ruling party: {party}. Focus: {focus}. "
                "Give a 1-2 sentence IMPACT DECLARATION only. State the specific sector affected "
                "and whether the impact is POSITIVE, NEGATIVE, or NEUTRAL for your state. "
                "No preamble. No greetings. Just the declaration."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Policy: ${title}\n${desc}\n\n"
                f"How does this policy specifically impact {state}'s economy?"
            ),
        },
    ]
    return messages, 4096


def build_opening_prompt(
    agent: Dict[str, Any],
    story: Dict[str, Any],
    declarations: Any,
    priors: Any = None,
    options: Dict[str, Any] = None,
) -> Tuple[List[Dict[str, str]], int]:
    opts = options or {}
    state = agent.get("state", "State")
    party = agent.get("party", "Independent")
    ideology = agent.get("ideology", "Balanced")
    focus = agent.get("focus", "General development")
    stance = agent.get("stance", "Neutral observer")

    if opts.get("allianceContext"):
        alliance_directive = opts["allianceContext"]
    elif isinstance(opts.get("allies"), list):
        alliance_directive = format_alliance_directive(opts["allies"], "coordinate")
    else:
        allies = resolve_allies(state, opts.get("profiles"))
        alliance_directive = format_alliance_directive(allies, "coordinate")

    profile = f"Ruling party: {party}. Ideology: {ideology}. Economic focus: {focus}."
    chain_of_thought = (
        "INSTRUCTIONS:\n"
        "1. First, write a <thought> block. Analyze: Who is your biggest threat? Who is your ally? What's your angle of attack?\n"
        "2. Then write your public speech (outside the tags). 2-3 sentences. Be sharp and political."
    )

    decl_text = format_transcript_entries(declarations)
    prior_text = ""
    if priors:
        formatted_priors = format_transcript_entries(priors)
        if formatted_priors.strip():
            prior_text = f"Speeches delivered so far in this round:\n{formatted_priors}\n\n"

    title = story.get("title", "") if story else ""
    desc = (story.get("description") or story.get("summary") or "No summary.") if story else ""

    messages = [
        {
            "role": "system",
            "content": (
                f"You are the {state} Council representative. {profile} {alliance_directive} "
                f"Your stance: {stance}.\n{chain_of_thought}"
            ),
        },
        {
            "role": "user",
            "content": (
                f"Policy: {title}\n{desc}\n\n"
                f"Impact declarations from all states:\n{decl_text}\n"
                f"{prior_text}"
                "Deliver your opening statement. Reference at least one other state's declaration."
            ),
        },
    ]
    return messages, 4096


def build_rebuttal_prompt(
    agent: Dict[str, Any],
    story: Dict[str, Any],
    full_transcript: Any,
    current_round_speeches: Any = None,
    options: Dict[str, Any] = None,
) -> Tuple[List[Dict[str, str]], int]:
    opts = options or {}
    state = agent.get("state", "State")
    party = agent.get("party", "Independent")
    ideology = agent.get("ideology", "Balanced")
    focus = agent.get("focus", "General development")
    stance = agent.get("stance", "Neutral observer")

    if opts.get("allianceContext"):
        alliance_directive = opts["allianceContext"]
    elif isinstance(opts.get("allies"), list):
        alliance_directive = format_alliance_directive(opts["allies"], "defend")
    else:
        allies = resolve_allies(state, opts.get("profiles"))
        alliance_directive = format_alliance_directive(allies, "defend")

    profile = f"Ruling party: {party}. Ideology: {ideology}. Economic focus: {focus}."
    chain_of_thought = (
        "INSTRUCTIONS:\n"
        "1. Write a <thought> block first. Identify the specific statement you'll attack. Plan your counter-argument.\n"
        "2. Then write your rebuttal (outside tags). 2-3 sentences. QUOTE the opponent's words and dismantle them."
    )

    opponent_note = f" Rebut the arguments made by {opts['opponent']}." if opts.get("opponent") else ""
    transcript_text = format_transcript_entries(full_transcript)
    current_text = ""
    if current_round_speeches:
        formatted_curr = format_transcript_entries(current_round_speeches)
        if formatted_curr.strip():
            current_text = f"Speeches in this round:\n{formatted_curr}\n"

    title = story.get("title", "") if story else ""

    messages = [
        {
            "role": "system",
            "content": (
                f"You are the {state} Council representative. Party: {party}. {profile} {alliance_directive} "
                f"Stance: {stance}.{opponent_note}\n{chain_of_thought}"
            ),
        },
        {
            "role": "user",
            "content": (
                f"Full transcript so far:\n{transcript_text}\n{current_text}"
                f"Policy: {title}\n\n"
                "Pick ONE opponent from the transcript. Quote their exact words. Explain why they're wrong."
            ),
        },
    ]
    return messages, 4096


def build_reply_prompt(
    agent: Dict[str, Any],
    story: Dict[str, Any],
    transcript: Any,
) -> Tuple[List[Dict[str, str]], int]:
    state = agent.get("state", "State")
    party = agent.get("party", "Independent")
    ideology = agent.get("ideology", "Balanced")
    focus = agent.get("focus", "General development")
    title = story.get("title", "") if story else ""
    transcript_text = format_transcript_entries(transcript)

    profile = f"Ruling party: {party}. Ideology: {ideology}. Economic focus: {focus}."

    messages = [
        {
            "role": "system",
            "content": (
                f"You are the {state} Council representative. {profile} "
                "You were the most attacked state in this debate. You have the RIGHT OF REPLY. "
                "This is your FINAL WORD. Be dignified but devastating. 2-3 sentences. No preamble."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Full debate transcript:\n{transcript_text}\n\n"
                f"Story: {title}\n\n"
                "Deliver your closing defense. Address the strongest attack made against you."
            ),
        },
    ]
    return messages, 4096
