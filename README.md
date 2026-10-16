# Policy Sim v3 — Federal Council AI Deliberation Platform

Recreation of `policy-sim-v2` in high-performance **Python (FastAPI + AsyncIO + Uvicorn)** preserving the exact UI design, styles, and multi-agent deliberation simulation.

---

## 🏛️ System Overview

Policy Sim v3 simulates a multi-agent Indian federal council debating national policies across 5 sequential rounds:
1. **Round 0: Impact Declarations**: All 10 council states assess immediate economic/political impacts.
2. **Round 1: Opening Statements**: Top 5 most impacted states deliver speeches with strategic reasoning (`<thought>` tags filtered from public stream).
3. **Round 2: Rebuttals**: Top 3 opposing states directly confront and quote opposing state delegates.
4. **Round 3: Right of Reply**: The most targeted/attacked state delivers their final defense.
5. **Round 4: Summary & Economic Verdict**: Strategic summary, winners/losers categorization, and state-by-state economic sentiment scoring.

---

## ⚙️ Architecture

```
policy-sim-v3/
├── app/
│   ├── auth/           # AES-256-GCM encryption, KeyVault, SessionGuard
│   ├── http/           # SseManager (broadcast, client registry, throttling)
│   ├── personas/       # 10 State Profiles, Political Alliances, Rosters
│   ├── prompts/        # Council, Selection, Verdict, and Policy Prompts
│   ├── providers/      # OpenRouter, OpenAI, Anthropic, Groq, Mock Drivers
│   ├── simulation/     # Orchestrator, RoundBarrier, KeywordAnalyzer, State
│   ├── utils/          # ThoughtBuffer, Sanitizer, JsonExtractor
│   ├── config.py       # Pydantic Settings & environment variables
│   └── main.py         # FastAPI application with REST & SSE endpoints
├── public/             # Byte-for-byte identical HTML, CSS, JS, and GeoJSON assets
├── tests/              # Pytest test suite (38 unit & integration tests)
├── run.py              # Server launcher
├── requirements.txt    # Python dependencies
└── .env.example        # Environment variables template
```

---

## 🚀 Getting Started

### 1. Requirements
- Python 3.11+ (tested on Python 3.14)

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Key settings:
- `PORT=3000`
- `AUTH_MODE=guest` (or `firebase`)
- `LLM_PROVIDER=openrouter` (or `openai`, `anthropic`, `groq`, `mock`)
- `LLM_API_KEY=your_key_here`
- `LLM_MODEL=anthropic/claude-3.5-haiku`

### 4. Run the Server
```bash
python run.py
```
Or with Uvicorn directly:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 3000
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing

Run the full automated test suite:
```bash
python -m pytest tests/ -v
```
All 38 unit and integration tests execute in < 2 seconds, covering:
- Thought buffer token streaming & tag filtering
- Resilient JSON extraction and code fence parsing
- Persona roster building & alliance resolution
- Round barrier synchronization & step gating
- Sentiment scoring & keyword analysis
- REST endpoints (`/health`, `/api/config`, `/api/models`, `/api/auth/*`)
- End-to-end multi-agent council deliberation pipeline
