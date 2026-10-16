import os
from typing import List
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

DEFAULT_COUNCIL_STATES = [
    "Tamil Nadu",
    "Delhi",
    "Kerala",
    "Assam",
    "Punjab",
    "Karnataka",
    "Maharashtra",
    "Uttar Pradesh",
    "West Bengal",
    "Gujarat",
]


def parse_council_states() -> List[str]:
    raw = os.getenv("COUNCIL_STATES", "").strip()
    if raw:
        items = [s.strip() for s in raw.split(",") if s.strip()]
        if len(items) >= 2:
            return items
    return list(DEFAULT_COUNCIL_STATES)


def parse_allowed_origins() -> List[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "").strip()
    if not raw:
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


class Settings(BaseModel):
    port: int = Field(default_factory=lambda: int(os.getenv("PORT", "3000")))
    auth_mode: str = Field(default_factory=lambda: os.getenv("AUTH_MODE", "optional").lower())
    lm_provider: str = Field(default_factory=lambda: os.getenv("LM_PROVIDER", "openrouter").lower())
    lm_model: str = Field(default_factory=lambda: os.getenv("LM_MODEL", "openai/gpt-6.1-sol-pro"))
    lm_studio_api_key: str = Field(default_factory=lambda: os.getenv("LMSTUDIO_API_KEY", ""))
    lm_studio_stream: bool = Field(
        default_factory=lambda: os.getenv("LMSTUDIO_STREAM", "true").lower() in ("true", "1", "yes")
    )
    lm_think: str = Field(default_factory=lambda: os.getenv("LM_THINK", "auto"))
    public_url: str = Field(default_factory=lambda: os.getenv("PUBLIC_URL", "http://localhost:3000"))
    trust_proxy_tls: bool = Field(
        default_factory=lambda: os.getenv("TRUST_PROXY_TLS", "false").lower() in ("true", "1", "yes")
    )
    allowed_origins: List[str] = Field(default_factory=parse_allowed_origins)
    panel_size: int = Field(default_factory=lambda: int(os.getenv("PANEL_SIZE", "5")))
    rebuttal_size: int = Field(default_factory=lambda: int(os.getenv("REBUTTAL_SIZE", "3")))
    council_states: List[str] = Field(default_factory=parse_council_states)
    llm_timeout_ms: int = Field(default_factory=lambda: int(os.getenv("LLM_TIMEOUT_MS", "60000")))
    llm_stream_idle_timeout_ms: int = Field(
        default_factory=lambda: int(os.getenv("LLM_STREAM_IDLE_TIMEOUT_MS", "90000"))
    )
    key_encryption_secret: str = Field(default_factory=lambda: os.getenv("KEY_ENCRYPTION_SECRET", ""))
    firebase_project_id: str = Field(default_factory=lambda: os.getenv("FIREBASE_PROJECT_ID", "llm-council-4da2d"))
    firebase_web_api_key: str = Field(
        default_factory=lambda: os.getenv("FIREBASE_WEB_API_KEY", "AIzaSyDIwGeB4nnmpb2Ufhh8AMNvw0OKFYi67gQ")
    )
    log_level: str = Field(default_factory=lambda: os.getenv("LOG_LEVEL", "info"))


settings = Settings()
