from app.simulation.keyword_analyzer import analyze_keywords, classify_impact_by_keywords


def test_keyword_analyzer_scoring():
    transcript = [
        {"state": "Tamil Nadu", "message": "This policy offers great growth, boost and opportunity for our industry."},
        {"state": "Punjab", "message": "This policy poses severe harm, damage and threat to agrarian workers."},
    ]
    res = analyze_keywords(transcript, ["Tamil Nadu", "Punjab"])
    assert "Tamil Nadu" in res["positive"]
    assert "Punjab" in res["negative"]
    assert res["winner"] == "Tamil Nadu"
    assert res["loser"] == "Punjab"


def test_classify_impact_by_keywords():
    transcript = [
        {"state": "Gujarat", "message": "Massive benefit and advantage for coastal ports."},
        {"state": "Kerala", "message": "Severe risk and decline in welfare."},
    ]
    res = classify_impact_by_keywords(transcript, ["Gujarat", "Kerala"])
    assert res["positive"] == ["Gujarat"]
    assert res["negative"] == ["Kerala"]
