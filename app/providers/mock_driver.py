import asyncio
import json
from typing import List, Dict, Any, Callable, Optional
from app.providers.base_driver import BaseLlmDriver


class MockDriver(BaseLlmDriver):
    def __init__(self, **options: Any):
        super().__init__(provider="mock", **options)

    def _determine_response(self, messages: List[Dict[str, str]]) -> str:
        prompt_text = " ".join(m.get("content", "") for m in messages).lower()

        if "output only a 2-3 word title" in prompt_text or "title:" in prompt_text:
            return "Clean Energy Mandate"

        if "summarize the policy in 1-2 clear sentences" in prompt_text or "first sentence must begin with 'the policy is about'" in prompt_text:
            return "The policy is about accelerating transition to renewable power across all regional grids. It mandates federal standards and phased decommissioning of legacy coal facilities."

        if "impact declaration" in prompt_text:
            return "Energy sector will benefit from renewable modernization and federal infrastructure funding."

        if "select the top" in prompt_text and "most strongly affected" in prompt_text:
            return json.dumps({
                "selected": ["Tamil Nadu", "Maharashtra", "Gujarat", "Delhi", "Karnataka"],
                "benched": ["Kerala", "Assam", "Punjab", "Uttar Pradesh", "West Bengal"],
            })

        if "rebuttal round" in prompt_text and "rebuttal_panel" in prompt_text:
            return json.dumps({
                "rebuttal_panel": ["Tamil Nadu", "Delhi", "Maharashtra"],
            })

        if "right of reply" in prompt_text and "reply_state" in prompt_text:
            return json.dumps({
                "reply_state": "Tamil Nadu",
            })

        if "impact assessment agent" in prompt_text or '"positive":' in prompt_text:
            return json.dumps({
                "positive": ["Tamil Nadu", "Maharashtra", "Gujarat", "Karnataka"],
                "negative": ["Punjab", "Assam", "West Bengal"],
            })

        if "council moderator" in prompt_text and '"winner":' in prompt_text:
            return json.dumps({
                "winner": "Tamil Nadu",
                "loser": "Punjab",
            })

        if "round summary agent" in prompt_text:
            return "The council examined regional energy priorities. Industrial states welcomed infrastructure investments while agricultural states sought tariff protections."

        if "strategic systems analyst" in prompt_text:
            return "The council focused on national grid decarbonization and regional fiscal burden sharing. While coastal states emphasized industrial exports, inland states prioritized subsidized power tariffs. Continued inter-state dialogue is critical."

        # Agent opening / rebuttal / reply
        return "<thought>Evaluating stakeholder priorities.</thought>Our state supports balanced development with full protection for local economic autonomy and worker welfare."

    async def complete(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 250,
        **options: Any,
    ) -> str:
        return self._determine_response(messages)

    async def stream(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 250,
        on_delta: Optional[Callable[[str], None]] = None,
        **options: Any,
    ) -> str:
        response = self._determine_response(messages)
        # Emit in small token chunks
        words = response.split(" ")
        for i, word in enumerate(words):
            chunk = word if i == 0 else " " + word
            if on_delta:
                on_delta(chunk)
        return response

    async def fetch_models(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        return {"ok": True, "models": ["mock-gpt-4o", "mock-claude-3.5-sonnet"]}
