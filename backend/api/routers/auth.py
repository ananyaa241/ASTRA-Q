import pyotp
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from backend.core.fusion_head import ThreatRanker

router = APIRouter()

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
        
        # Verify TOTP using a static demo secret (in prod this would be fetched from DB)
        totp = pyotp.TOTP('base32secret3232')
        if not totp.verify(req.totp_code):
            raise HTTPException(status_code=401, detail="Invalid MFA token")
            
    return {
        "status": "success", 
        "message": "Access Granted", 
        "risk_tier": tier, 
        "fused_score": score
    }
