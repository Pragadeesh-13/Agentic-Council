from typing import List, Dict, Any, Tuple
from app.personas.state_profiles import DEFAULT_COUNCIL_STATES
from app.prompts.council_prompts import format_transcript_entries


def build_selection_prompt(
    declarations: Any,
    all_states: List[str] = None,
    panel_size: int = 5,
) -> Tuple[List[Dict[str, str]], int]:
    states = all_states if isinstance(all_states, list) else DEFAULT_COUNCIL_STATES
    decl_text = format_transcript_entries(declarations)

    messages = [
        {
            "role": "system",
            "content": (
                f"You are the Council Moderator. From the statements below, select the top {panel_size} states that are "
                "MOST STRONGLY affected (positive OR negative — intensity matters, not direction). "
                "Return ONLY valid JSON with 'selected' and 'benched' arrays: "
                '{"selected":["State1","State2",...], "benched":["State3",...]}. '
                "Use exact state names from the list. No explanation. No markdown."
            ),
        },
        {
            "role": "user",
            "content": (
                f"All declarations:\n{decl_text}\n\n"
                f"All states: {', '.join(states)}\n"
                f"Select the top {panel_size} most intensely affected. Return JSON only:"
            ),
        },
    ]
    return messages, 200


def build_rebuttal_selection_prompt(
    *args,
    transcript: Any = None,
    panel_states: List[str] = None,
    rebuttal_size: int = 3,
    **kwargs,
) -> Tuple[List[Dict[str, str]], int]:
    # Support both (transcript, panel_states, rebuttal_size) and (story, transcript, panel_states, rebuttal_size)
    if len(args) == 4:
        _, t_arg, p_arg, r_arg = args
        transcript = t_arg
        panel_states = p_arg
        rebuttal_size = r_arg
    elif len(args) == 3:
        if isinstance(args[0], dict) and "title" in args[0] and isinstance(args[1], list):
            _, t_arg, p_arg = args
            transcript = t_arg
            panel_states = p_arg
        else:
            t_arg, p_arg, r_arg = args
            transcript = t_arg
            panel_states = p_arg
            rebuttal_size = r_arg
    elif len(args) == 2:
        t_arg, p_arg = args
        transcript = t_arg
        panel_states = p_arg
    elif len(args) == 1:
        transcript = args[0]

    states = panel_states if isinstance(panel_states, list) else []
    transcript_text = format_transcript_entries(transcript)

    messages = [
        {
            "role": "system",
            "content": (
                f"You are the Council Moderator. From the debate transcript, select exactly {rebuttal_size} states "
                "that should participate in the rebuttal round. Pick states with the MOST OPPOSING viewpoints "
                "and the state that was MOST REFERENCED or ATTACKED by others. "
                'Return ONLY valid JSON: {"rebuttal_panel":["State1","State2","State3"]}. '
                "Use exact state names from the panel list. No explanation. No markdown."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Debate transcript:\n{transcript_text}\n\n"
                f"Active panel: {', '.join(states)}\n"
                f"Select exactly {rebuttal_size} for rebuttal. JSON only:"
            ),
        },
    ]
    return messages, 150


def build_reply_selection_prompt(
    *args,
    transcript: Any = None,
    rebuttal_states: List[str] = None,
    **kwargs,
) -> Tuple[List[Dict[str, str]], int]:
    # Support both (transcript, rebuttal_states) and (story, transcript, rebuttal_states)
    if len(args) == 3:
        _, t_arg, r_arg = args
        transcript = t_arg
        rebuttal_states = r_arg
    elif len(args) == 2:
        if isinstance(args[0], dict) and "title" in args[0]:
            _, t_arg = args
            transcript = t_arg
        else:
            t_arg, r_arg = args
            transcript = t_arg
            rebuttal_states = r_arg
    elif len(args) == 1:
        transcript = args[0]

    states = rebuttal_states if isinstance(rebuttal_states, list) else []
    transcript_text = format_transcript_entries(transcript)

    messages = [
        {
            "role": "system",
            "content": (
                "You are the Council Moderator. From the full debate transcript, identify the ONE state "
                "that was MOST ATTACKED or CRITICIZED during the rebuttal round. "
                "This state gets the Right of Reply. "
                'Return ONLY valid JSON: {"reply_state":"StateName"}. Use exact state name. No markdown.'
            ),
        },
        {
            "role": "user",
            "content": (
                f"Debate transcript:\n{transcript_text}\n\n"
                f"Rebuttal participants: {', '.join(states)}\n"
                "Who was most attacked? JSON only:"
            ),
        },
    ]
    return messages, 100
