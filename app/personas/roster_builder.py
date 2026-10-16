from typing import List, Dict, Any, Optional
from app.personas.state_profiles import (
    STATE_PROFILES,
    DEFAULT_COUNCIL_STATES,
    DEFAULT_NEUTRAL_PROFILE,
    get_profile,
)


def build_agent_roster(
    states: Optional[List[str]] = None,
    profiles: Optional[Dict[str, Dict[str, str]]] = None,
    options: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    state_list = states if isinstance(states, list) else DEFAULT_COUNCIL_STATES
    opts = options or {}
    suffix = opts.get("nameSuffix", "Council")

    roster = []
    for state in state_list:
        if profiles and isinstance(profiles, dict) and state in profiles:
            prof = profiles[state]
        else:
            prof = get_profile(state)

        merged = dict(DEFAULT_NEUTRAL_PROFILE)
        merged.update(prof or {})

        roster.append(
            {
                "name": f"{state} {suffix}",
                "state": state,
                "party": merged.get("party", "Independent"),
                "ideology": merged.get("ideology", "Balanced"),
                "focus": merged.get("focus", "General development"),
                "stance": merged.get("stance", "Neutral observer"),
            }
        )
    return roster
