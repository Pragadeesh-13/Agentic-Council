from typing import List, Dict, Any, Union
from app.personas.state_profiles import STATE_PROFILES, get_profile


def resolve_allies(agent_state: str, profiles: Union[List[Dict[str, Any]], Dict[str, Any]] = None) -> List[str]:
    if not agent_state:
        return []

    if isinstance(profiles, list):
        current = next((a for a in profiles if a.get("state") == agent_state or a.get("name") == agent_state), None)
        party = current.get("party") if current else get_profile(agent_state).get("party")
        if not party:
            return []
        return [other.get("state") for other in profiles if other.get("party") == party and other.get("state") != agent_state and other.get("state")]

    profile_map = profiles if isinstance(profiles, dict) else STATE_PROFILES
    current_party = profile_map.get(agent_state, {}).get("party") or get_profile(agent_state).get("party")
    if not current_party:
        return []

    return [s for s in profile_map if profile_map[s].get("party") == current_party and s != agent_state]


def resolve_dynamic_alliances(roster_or_profiles: Union[List[Dict[str, Any]], Dict[str, Any]]) -> Dict[str, List[str]]:
    alliances: Dict[str, List[str]] = {}
    if isinstance(roster_or_profiles, list):
        for agent in roster_or_profiles:
            st = agent.get("state", "")
            party = agent.get("party", "")
            allies = [other.get("state", "") for other in roster_or_profiles if other.get("party") == party and other.get("state") != st]
            alliances[st] = allies
        return alliances

    profile_map = roster_or_profiles if isinstance(roster_or_profiles, dict) else STATE_PROFILES
    for state in profile_map:
        alliances[state] = resolve_allies(state, profile_map)
    return alliances


def format_alliance_directive(allies: List[str] = None, context: Union[str, int] = "coordinate") -> str:
    has_allies = bool(allies)
    is_defend = context in ("defend", 2, "2", "rebuttal")

    if is_defend:
        if has_allies:
            return f"Allied States: {', '.join(allies)}. Defend them if attacked."
        return "No allies. You're on your own."

    if has_allies:
        return f"Allied States: {', '.join(allies)}. Coordinate with them."
    return "No direct party allies. Stand independently."
