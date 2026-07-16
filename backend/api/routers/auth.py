import os
import pyotp
import base64
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from backend.core.fusion_head import ThreatRanker
from backend.utils.secret_store import get_user_totp_secret
from backend.utils.totp_db import get_user_totp_secret_db
from backend.pqc.kem import get_kem

router = APIRouter()

# Demo fallback code (development only). Controlled via env.
DEMO_TOTP_CODE = os.getenv('DEMO_TOTP_CODE', '123456')
DEMO_MODE = os.getenv('NODE_ENV', 'development') == 'development'

class AccessRequest(BaseModel):
    user_id: str
    password: str
    totp_code: Optional[str] = None

@router.post("/request-access")
async def request_access(req: AccessRequest, request: Request):
    """
    Identity Gateway endpoint with Risk-Based Authentication (RBA).
    Queries the mocked latest fused_score for the user.
    """
    feature_cache = request.app.state.feature_cache
    cached_score = await feature_cache.get(f"user:{req.user_id.lower()}:fused_score")
    
    if cached_score is not None:
        try:
            score = float(cached_score)
        except (ValueError, TypeError):
            score = 0.20
    else:
        # Strict Redis connection: No mock string matching allowed.
        # If cache misses, default to baseline low trust, or optionally fetch from a DB.
        score = 0.20  # Default LOW
        
    tier = ThreatRanker.score_to_tier(score)
    
    if tier == "CRITICAL":
        raise HTTPException(
            status_code=403, 
            detail="Access Denied: CRITICAL risk tier detected. Automated containment initiated."
        )
        
    if tier in ["HIGH", "MEDIUM"]:
        if not req.totp_code:
            raise HTTPException(
                status_code=401, 
                detail="MFA Required: Anomalous behavior detected. Please provide TOTP code."
            )
        
        # Verify TOTP using a per-user secret fetched from the secure secret store.
        # In production this secret should be unique per user and stored encrypted.
        # Prefer DB-backed per-user secret when available
        try:
            user_secret = await get_user_totp_secret_db(req.user_id)
        except Exception:
            user_secret = None

        # Fall back to file-backed secret store if DB doesn't have it
        if not user_secret:
            try:
                user_secret = await get_user_totp_secret(req.user_id)
            except FileNotFoundError:
                user_secret = None

        if user_secret:
            totp = pyotp.TOTP(user_secret)
            if not totp.verify(req.totp_code):
                raise HTTPException(status_code=401, detail="Invalid MFA token")
        else:
            # Fallback: only accept the demo code when in development mode
            if not DEMO_MODE or req.totp_code != DEMO_TOTP_CODE:
                raise HTTPException(status_code=401, detail="Invalid MFA token")
            
    return {
        "status": "success", 
        "message": "Access Granted", 
        "risk_tier": tier, 
        "fused_score": score
    }

class PQCHandshakeRequest(BaseModel):
    user_id: str
    client_public_key_b64: str

class PQCHandshakeResponse(BaseModel):
    status: str
    ciphertext_b64: str
    message: str = "PQC Handshake successful"

@router.post("/pqc-handshake", response_model=PQCHandshakeResponse)
async def pqc_handshake(req: PQCHandshakeRequest, request: Request):
    """
    Enforces true privileged access by cryptographically encapsulating
    a secure session token using the client's ML-KEM-1024 public key.
    """
    try:
        pk_bytes = base64.b64decode(req.client_public_key_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Base64 public key")
        
    kem = get_kem()
    try:
        # PQC runtime executes ML-KEM encapsulation natively via liboqs
        result = kem.encapsulate(pk_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"KEM Encapsulation failed: {e}")
        
    # Store shared secret in Redis for 10 minutes (600s) to lock the session
    feature_cache = request.app.state.feature_cache
    if feature_cache.redis:
        ss_b64 = base64.b64encode(result.shared_secret).decode('utf-8')
        # Binding the PQC shared secret securely to the privileged user session
        await feature_cache.redis.setex(f"user:{req.user_id.lower()}:pqc_session_key", 600, ss_b64)
    else:
        raise HTTPException(status_code=500, detail="Redis connection unavailable for session binding")
        
    return {
        "status": "success",
        "ciphertext_b64": base64.b64encode(result.ciphertext).decode('utf-8')
    }
