from app.utils.thought_buffer import ThoughtBuffer


def test_thought_buffer_suppresses_inside_tags():
    deltas = []
    tb = ThoughtBuffer(on_delta=lambda full, chunk: deltas.append(chunk))

    tb.feed("<thought>This is an internal reasoning process.")
    assert len(deltas) == 0

    tb.feed(" We should oppose the policy.</thought>")
    tb.feed(" Fellow council members, Tamil Nadu opposes this.")

    assert len(deltas) > 0
    full_speech = "".join(deltas)
    assert "<thought>" not in full_speech
    assert "Fellow council members, Tamil Nadu opposes this." in full_speech


def test_thought_buffer_emits_directly_when_no_tags():
    deltas = []
    tb = ThoughtBuffer(threshold=20, on_delta=lambda full, chunk: deltas.append(chunk))

    # Feeds text longer than threshold without thought tags
    tb.feed("We strongly support this federal renewable initiative because it benefits our industry.")
    assert len(deltas) > 0
    assert "We strongly support" in "".join(deltas)


def test_thought_buffer_flush_unclosed_thought():
    tb = ThoughtBuffer()
    tb.feed("<thought>Unclosed thinking...")
    flushed = tb.flush()
    # When thought tag was opened but never closed, flush drops internal thought
    assert flushed == ""
