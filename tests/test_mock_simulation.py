import asyncio
import pytest
from app.config import settings
from app.providers.mock_driver import MockDriver
from app.simulation import SimulationState, RoundBarrier, CouncilOrchestrator
from app.http.sse_manager import SseManager


@pytest.mark.asyncio
async def test_full_council_simulation_pipeline():
    mock_driver = MockDriver()
    sse = SseManager()
    state = SimulationState()
    barrier = RoundBarrier()

    # Pre-sign all rounds so pipeline does not block waiting for user clicks
    for r in range(5):
        barrier.mark_round_begun(r)

    events_received = []

    # Intercept broadcast to verify SSE event sequence
    orig_broadcast = sse.broadcast

    def intercept(event, data):
        events_received.append((event, data))
        orig_broadcast(event, data)

    sse.broadcast = intercept

    orch = CouncilOrchestrator(
        config=settings,
        driver=mock_driver,
        sse_manager=sse,
        state=state,
        enable_barrier=False,
        step_delay=0,
        speech_delay=0,
        verdict_delay=0,
    )

    story = {
        "title": "Clean Energy Transition Mandate",
        "source": "Council Test",
        "url": "",
        "description": "Accelerating transition to zero-carbon energy across Indian states.",
    }

    success = await orch.run_council(story)
    assert success is True

    event_names = [e[0] for e in events_received]

    # Verify key lifecycle SSE events occurred in order
    assert "council_start" in event_names
    assert "round_start" in event_names
    assert "panel_selected" in event_names
    assert "rebuttal_selected" in event_names
    assert "reply_selected" in event_names
    assert "round_summary" in event_names
    assert "council_end" in event_names

    # Check panel selection payload
    panel_event = next(d for e, d in events_received if e == "panel_selected")
    assert len(panel_event["selected"]) == 5
    assert len(panel_event["benched"]) == 5

    # Check rebuttal selection payload
    rebuttal_event = next(d for e, d in events_received if e == "rebuttal_selected")
    assert len(rebuttal_event["rebuttal_panel"]) == 3

    # Check reply selection payload
    reply_event = next(d for e, d in events_received if e == "reply_selected")
    assert bool(reply_event["reply_state"])

    # Check final verdict payload
    end_event = next(d for e, d in events_received if e == "council_end")
    assert "summary" in end_event
    assert "impacts" in end_event
    assert isinstance(end_event["impacts"]["positive"], list)
    assert isinstance(end_event["impacts"]["negative"], list)
