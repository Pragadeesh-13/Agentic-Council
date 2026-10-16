import uvicorn
from app.config import settings

if __name__ == "__main__":
    print(f"Starting LLM Council on port {settings.port} (auth_mode: {settings.auth_mode})...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=False)
