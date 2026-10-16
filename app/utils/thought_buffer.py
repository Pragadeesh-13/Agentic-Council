import re
from typing import Callable, List, Optional


class ThoughtBuffer:
    def __init__(
        self,
        threshold: int = 60,
        on_delta: Optional[Callable[[str, str], None]] = None,
        tag_names: Optional[List[str]] = None,
    ):
        self.threshold = threshold
        self.on_delta = on_delta
        self.tag_names = tag_names or ["thought", "think"]

        self.full_text = ""
        self.thought_closed = False
        self.no_thought_detected = False
        self.public_buffer = ""
        self.last_emitted = ""

    def feed(self, delta: str) -> str:
        if not delta:
            return self.public_buffer

        self.full_text += str(delta)

        if not self.thought_closed and not self.no_thought_detected:
            if len(self.full_text) > self.threshold and not self._has_opening_tag():
                self.no_thought_detected = True

        if self.no_thought_detected:
            self.public_buffer = self.full_text.lstrip()
            self._emit_change()
            return self.public_buffer

        if not self.thought_closed:
            if self._has_closing_tag():
                self.thought_closed = True
                after_thought = self._strip_thought_tags(self.full_text)
                self.public_buffer = after_thought.lstrip()
                if self.public_buffer:
                    self._emit_change()
            return self.public_buffer

        self.public_buffer = self._strip_thought_tags(self.full_text).lstrip()
        self._emit_change()
        return self.public_buffer

    def flush(self) -> str:
        if not self.thought_closed and not self.no_thought_detected:
            if not self._has_opening_tag():
                self.public_buffer = self.full_text.strip()
            else:
                self.public_buffer = ""
        elif self.thought_closed:
            self.public_buffer = self._strip_thought_tags(self.full_text).strip()
        else:
            self.public_buffer = self.full_text.strip()
        return self.public_buffer

    def reset(self):
        self.full_text = ""
        self.thought_closed = False
        self.no_thought_detected = False
        self.public_buffer = ""
        self.last_emitted = ""

    def _has_opening_tag(self) -> bool:
        tags = "|".join(self.tag_names)
        return bool(re.search(rf"<(?:{tags})\b[^>]*>", self.full_text, re.IGNORECASE))

    def _has_closing_tag(self) -> bool:
        tags = "|".join(self.tag_names)
        return bool(re.search(rf"<\/(?:{tags})>", self.full_text, re.IGNORECASE))

    def _strip_thought_tags(self, text: str) -> str:
        tags = "|".join(self.tag_names)
        pattern = rf"<(?:{tags})\b[^>]*>[\s\S]*?<\/(?:{tags})>"
        cleaned = re.sub(pattern, "", text, flags=re.IGNORECASE)
        stray = rf"<\/?(?:{tags})\b[^>]*>"
        return re.sub(stray, "", cleaned, flags=re.IGNORECASE)

    def _emit_change(self):
        if self.public_buffer != self.last_emitted:
            chunk = self.public_buffer[len(self.last_emitted) :]
            self.last_emitted = self.public_buffer
            if self.on_delta:
                self.on_delta(self.public_buffer, chunk)
