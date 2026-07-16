import pytest
import os
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from httpx import AsyncClient, ASGITransport
import pyotp
import asyncio

from backend.api.main import app

@pytest.fixture(scope="module")
def event_loop():
    """Create an instance of the default event loop for each test case."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.mark.asyncio
async def test_auth_low_risk():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/auth/request-access", json={
            "user_id": "alice_low",
            "password": "password123"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["risk_tier"] == "LOW"
        assert data["message"] == "Access Granted"

@pytest.mark.asyncio
async def test_auth_medium_risk_missing_mfa():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/auth/request-access", json={
            "user_id": "bob_medium",
            "password": "password123"
        })
        assert response.status_code == 401
        assert "MFA Required" in response.json()["detail"]

@pytest.mark.asyncio
async def test_auth_high_risk_valid_mfa():
    totp = pyotp.TOTP('base32secret3232')
    valid_code = totp.now()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/auth/request-access", json={
            "user_id": "charlie_high",
            "password": "password123",
            "totp_code": valid_code
        })
        assert response.status_code == 200
        assert response.json()["risk_tier"] == "HIGH"

@pytest.mark.asyncio
async def test_auth_high_risk_invalid_mfa():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/auth/request-access", json={
            "user_id": "charlie_high",
            "password": "password123",
            "totp_code": "000000"
        })
        assert response.status_code == 401
        assert "Invalid MFA token" in response.json()["detail"]

@pytest.mark.asyncio
async def test_auth_critical_risk():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/auth/request-access", json={
            "user_id": "dave_critical",
            "password": "password123"
        })
        assert response.status_code == 403
        assert "CRITICAL" in response.json()["detail"]
