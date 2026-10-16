from app.personas.state_profiles import get_profile, STATE_PROFILES, DEFAULT_COUNCIL_STATES
from app.personas.alliance_resolver import resolve_allies, format_alliance_directive
from app.personas.roster_builder import build_agent_roster


def test_state_profiles_count():
    assert len(STATE_PROFILES) == 10
    assert len(DEFAULT_COUNCIL_STATES) == 10


def test_state_profile_lookup():
    tn = get_profile("Tamil Nadu")
    assert tn["party"] == "DMK"
    assert "Manufacturing" in tn["focus"]

    delhi = get_profile("Delhi")
    assert delhi["party"] == "AAP"

    unknown = get_profile("Goa")
    assert unknown["party"] == "Independent"


def test_alliance_resolution():
    # Delhi and Punjab are both AAP
    delhi_allies = resolve_allies("Delhi")
    assert "Punjab" in delhi_allies
    assert "Delhi" not in delhi_allies

    # Gujarat and Uttar Pradesh are both BJP
    gujarat_allies = resolve_allies("Gujarat")
    assert "Uttar Pradesh" in gujarat_allies
    assert "Assam" in gujarat_allies


def test_format_alliance_directive():
    dir_coord = format_alliance_directive(["Punjab"], "coordinate")
    assert "Allied States: Punjab. Coordinate with them." == dir_coord

    dir_defend = format_alliance_directive(["Punjab"], "defend")
    assert "Allied States: Punjab. Defend them if attacked." == dir_defend

    dir_none = format_alliance_directive([], "coordinate")
    assert "Stand independently" in dir_none


def test_roster_builder():
    roster = build_agent_roster()
    assert len(roster) == 10
    names = [a["name"] for a in roster]
    assert "Tamil Nadu Council" in names
    assert "Gujarat Council" in names
