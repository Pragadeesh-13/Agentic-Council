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
    res = client.get("/api/config")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "provider" in data
    assert "model" in data


def test_models_endpoint():
    res = client.get("/api/models?provider=openrouter")
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
