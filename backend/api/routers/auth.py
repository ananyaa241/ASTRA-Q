import os
import pyotp
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from backend.core.fusion_head import ThreatRanker
from backend.utils.secret_store import get_user_totp_secret

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
    # In a production PAM broker, we'd query the Redis feature cache here:
    # feature_cache = request.app.state.feature_cache
    # cached_score = await feature_cache.get(f"user:{req.user_id}:fused_score")
    
    # Mocking real-time risk scores for RBA demonstration
    user_id_lower = req.user_id.lower()
    score = 0.20  # Default LOW
    if "critical" in user_id_lower:
        score = 0.95
    elif "high" in user_id_lower:
        score = 0.75
    elif "medium" in user_id_lower:
        score = 0.55
        
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
        try:
            user_secret = await get_user_totp_secret(req.user_id)
        except FileNotFoundError:
            # No per-user secret provisioned — allow demo-code only in development
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
