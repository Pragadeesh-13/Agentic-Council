import re
from typing import List, Dict, Any

POSITIVE_RE = re.compile(
    r"\b(benefit|gain|opportunity|growth|advantage|positive|win|improve|boost|strengthen)\b",
    re.IGNORECASE,
)
NEGATIVE_RE = re.compile(
    r"\b(risk|threat|harm|loss|negative|damage|suffer|decline|challenge|vulnerable|hurt)\b",
    re.IGNORECASE,
)


def analyze_keywords(transcript: Any, states: List[str] = None) -> Dict[str, Any]:
    resolved_states = list(states) if isinstance(states, list) else []
    if not resolved_states and isinstance(transcript, list):
        from_trans = [e.get("state") or e.get("agent") for e in transcript if isinstance(e, dict)]
        resolved_states = list(dict.fromkeys(s for s in from_trans if s))

    scores: Dict[str, int] = {s: 0 for s in resolved_states}
    entries = []

    if isinstance(transcript, list):
        for e in transcript:
            if not e:
                continue
            if isinstance(e, str):
                matched = next((s for s in resolved_states if s in e), "")
                entries.append({"state": matched, "message": e})
            elif isinstance(e, dict):
                st = e.get("state") or next((s for s in resolved_states if e.get("agent") and s in e["agent"]), "")
                msg = str(e.get("message") or e.get("text") or e.get("content") or "")
                entries.append({"state": st, "message": msg})
    elif isinstance(transcript, str) and transcript.strip():
        raw_text = transcript
        any_matched = False
        for s in resolved_states:
            escaped = re.escape(s)
            matches = [m.group(1).strip() for m in re.finditer(rf"(?:^|[\n.!?])([^\n.!?]*\b{escaped}\b[^\n.!?]*)", raw_text, re.IGNORECASE)]
            if matches:
                any_matched = True
                entries.append({"state": s, "message": " ".join(matches)})
        if not any_matched:
            entries = [{"state": s, "message": raw_text} for s in resolved_states]
    elif isinstance(transcript, dict):
        st = transcript.get("state", "")
        msg = str(transcript.get("message") or transcript.get("text") or transcript.get("content") or "")
        entries = [{"state": st, "message": msg}]

    for entry in entries:
        st = entry.get("state")
        if st not in scores:
            continue
        msg = entry.get("message", "").lower()
        pos_matches = len(POSITIVE_RE.findall(msg))
        neg_matches = len(NEGATIVE_RE.findall(msg))
        scores[st] += pos_matches - neg_matches

    sorted_scores = sorted(scores.items(), key=lambda item: item[1], reverse=True)

    positive = [s for s, v in sorted_scores if v > 0]
    negative = [s for s, v in sorted(scores.items(), key=lambda item: item[1]) if v < 0]

    winner = sorted_scores[0][0] if sorted_scores else (resolved_states[0] if resolved_states else "")
    loser = sorted_scores[-1][0] if sorted_scores else (resolved_states[-1] if resolved_states else "")

    return {
        "positive": positive,
        "negative": negative,
        "winner": winner,
        "loser": loser,
        "scores": scores,
    }


def classify_impact_by_keywords(transcript: Any, states: List[str] = None) -> Dict[str, List[str]]:
    res = analyze_keywords(transcript, states)
    return {"positive": res["positive"], "negative": res["negative"]}
