from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["status"] == "healthy"
    assert data["version"] == "3.0.0"


def test_config_endpoint():
    res = client.get("/api/config", headers={"Authorization": "Bearer test_token"})
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "provider" in data
    assert "model" in data


def test_models_endpoint():
    res = client.get("/api/models?provider=openrouter", headers={"Authorization": "Bearer test_token"})
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert isinstance(data["models"], list)


def test_firebase_config_endpoint():
    res = client.get("/api/auth/firebase-config")
    assert res.status_code == 200
    data = res.json()
    assert "apiKey" in data
    assert "projectId" in data


def test_auth_signup_validation():
    # Incomplete body should return 400
    res = client.post("/api/auth/signup", json={"fullName": "Test"})
    assert res.status_code == 400

    # Successful signup
    res_ok = client.post(
        "/api/auth/signup",
        json={
            "fullName": "Alice Smith",
            "email": "alice@example.com",
            "username": "alice",
            "password": "secretpassword",
            "confirmPassword": "secretpassword",
        },
    )
    assert res_ok.status_code == 201


def test_auth_login():
    res = client.post("/api/auth/login", json={"username": "alice", "password": "secretpassword"})
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["user"]["username"] == "alice"


def test_static_index_serving():
    res = client.get("/")
    assert res.status_code == 200
    assert "AGENTIC COUNCIL" in res.text
    assert "india-map" in res.text


def test_auth_required_redirect():
    from app.config import settings
    orig_mode = settings.auth_mode
    try:
        settings.auth_mode = "required"
        fresh_client = TestClient(app)
        # Unauthenticated request to / should redirect to /login.html
        res = fresh_client.get("/", follow_redirects=False)
        assert res.status_code == 302
        assert res.headers["location"] == "/login.html"

        # Login page itself should be accessible without redirect loop
        res_login = fresh_client.get("/login.html", follow_redirects=False)
        assert res_login.status_code == 200

        # Authenticated request with cookie should serve index.html
        res_auth = fresh_client.get("/", cookies={"__session": "token_alice"}, follow_redirects=False)
        assert res_auth.status_code == 200
        assert "AGENTIC COUNCIL" in res_auth.text
    finally:
        settings.auth_mode = orig_mode
