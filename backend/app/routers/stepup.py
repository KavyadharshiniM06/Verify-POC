"""
Step-up MFA router — direct factor challenge.

Instead of redirecting through IBM Verify's OIDC flow, this router challenges
the user's already-enrolled second factor directly using the IBM Verify factor
verification APIs. No password page, no OIDC redirect — just the second factor.

Flow:
  1. POST /auth/stepup/begin
       - Reads the current user's enrolled factors from IBM Verify
       - Picks the best available factor (push > totp > email_otp)
       - Initiates the factor challenge
       - Returns: { method, transaction_id }

  2. Frontend challenges the user inline:
       push      → poll GET /auth/stepup/poll/{tx_id} every 2s
       totp      → user enters 6-digit code
       email_otp → user enters emailed code

  3. POST /auth/stepup/complete
       - Verifies the factor response with IBM Verify
       - Issues a new session JWT with stepup_verified=True
       - Returns: { token, user, stepup_verified }
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import (
    create_session_token,
    decode_session_token,
    get_current_user,
)
from app.database import get_db
from app.models import User
from app.services.verify_client import verify_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/stepup", tags=["stepup"])

_bearer = HTTPBearer()

# Factor preference order — push is least disruptive, totp needs app open,
# email_otp is the universal fallback.
_FACTOR_PREFERENCE = ["push", "totp", "fido2", "email_otp"]


# ── Methods: list what the user has enrolled ──────────────────────────────────

@router.get("/methods")
async def stepup_methods(
    current_user: User = Depends(get_current_user),
):
    """Return the second factors the user has enrolled in IBM Verify."""
    try:
        factors = await verify_client.get_enrolled_factors(current_user.verify_user_id)
    except Exception:
        factors = {"fido2": False, "totp": False, "push": False}

    # email_otp is always available for Cloud Directory users
    factors["email_otp"] = True

    METHOD_META = {
        "fido2":     {"label": "Passkey / Biometric",    "icon": "🔑", "description": "Use Touch ID, Face ID, or a hardware key"},
        "push":      {"label": "IBM Verify Push",         "icon": "📱", "description": "Approve a notification on your enrolled device"},
        "totp":      {"label": "Authenticator App (TOTP)","icon": "🔢", "description": "Enter the 6-digit code from your authenticator app"},
        "email_otp": {"label": "Email One-Time Password", "icon": "📧", "description": f"Receive a code at {current_user.email}"},
    }

    available = [
        {"method": m, **METHOD_META[m]}
        for m in ("fido2", "push", "totp", "email_otp")
        if factors.get(m)
    ]
    return {"methods": available}


# ── Begin: initiate the second-factor challenge ────────────────────────────────

class StepUpBeginRequest(BaseModel):
    return_to: str = "/transfers"
    preferred_method: str | None = None  # optional override; defaults to auto-select


@router.post("/begin")
async def stepup_begin(
    req: StepUpBeginRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Detect the user's enrolled second factor and initiate a challenge directly.
    Tries each factor in preference order and falls back if one fails.
    Returns the method chosen and a transaction_id to complete with.
    """
    # Fetch enrolled factors — failures here are non-fatal, fall back to email_otp
    try:
        factors = await verify_client.get_enrolled_factors(current_user.verify_user_id)
    except Exception:
        factors = {"fido2": False, "totp": False, "push": False}

    # email_otp is always available for Cloud Directory users
    factors["email_otp"] = True

    # Build candidate list — honour explicit preference if that factor is enrolled
    if req.preferred_method and factors.get(req.preferred_method):
        candidates = [req.preferred_method]
    else:
        candidates = [f for f in _FACTOR_PREFERENCE if factors.get(f)]

    if not candidates:
        raise HTTPException(status_code=400, detail="No second factor enrolled")

    last_exc: Exception | None = None

    for method in candidates:
        try:
            if method == "push":
                result = await verify_client.push_initiate(current_user.verify_user_id)
                transaction_id = result.get("id") or result.get("transactionId")
                return {
                    "method": "push",
                    "transaction_id": transaction_id,
                    "message": "Approve the push notification on your enrolled device.",
                }

            if method == "totp":
                # totp_challenge creates a verification transaction for an enrolled user
                result = await verify_client.totp_challenge(current_user.verify_user_id)
                transaction_id = result.get("id") or result.get("transactionId")
                return {
                    "method": "totp",
                    "transaction_id": transaction_id,
                    "message": "Enter the 6-digit code from your authenticator app.",
                }

            if method == "email_otp":
                result = await verify_client.email_otp_send(
                    current_user.verify_user_id, current_user.email
                )
                transaction_id = result.get("id") or result.get("transactionId")
                return {
                    "method": "email_otp",
                    "transaction_id": transaction_id,
                    "message": f"A one-time code has been sent to {current_user.email}.",
                }

            if method == "fido2":
                # Passkey: return assertion options; browser WebAuthn handles the rest
                options = await verify_client.fido2_login_begin(current_user.verify_user_id)
                return {
                    "method": "fido2",
                    "transaction_id": None,
                    "options": options,
                    "message": "Use your passkey (fingerprint / Face ID) to verify.",
                }

        except Exception as exc:
            # This factor failed (not enrolled, ROPC blocked, device offline, etc.)
            # Log and try the next candidate automatically.
            logger.warning("Step-up method %s unavailable: %s — trying next", method, exc)
            last_exc = exc
            continue

    # All candidates exhausted
    logger.error("All step-up methods failed. Last error: %s", last_exc)
    raise HTTPException(
        status_code=502,
        detail="Could not initiate MFA challenge. Please try again or contact support.",
    )


# ── Poll: check push approval status ──────────────────────────────────────────

@router.get("/poll/{transaction_id}")
async def stepup_poll(
    transaction_id: str,
    _current_user: User = Depends(get_current_user),
):
    """Poll IBM Verify for push approval. Returns pending | approved | denied."""
    try:
        result = await verify_client.push_poll(transaction_id)
        raw = result.get("state") or result.get("status") or "PENDING"
        normalized = raw.upper()
        if normalized == "APPROVED":
            status = "approved"
        elif normalized in ("DENIED", "TIMEOUT", "FAILED", "EXPIRED"):
            status = "denied"
        else:
            status = "pending"
        return {"status": status}
    except Exception:
        raise HTTPException(status_code=502, detail="Unable to check push status")


# ── Complete: verify the factor response and issue a step-up JWT ───────────────

class StepUpCompleteRequest(BaseModel):
    method: str
    transaction_id: str | None = None
    otp_code: str | None = None          # for totp and email_otp
    assertion_response: dict | None = None  # for fido2


@router.post("/complete")
async def stepup_complete(
    req: StepUpCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Verify the second-factor response and issue a new JWT with stepup_verified=True.
    """
    verified = False

    try:
        if req.method == "push":
            if not req.transaction_id:
                raise HTTPException(status_code=400, detail="transaction_id required for push")
            result = await verify_client.push_poll(req.transaction_id)
            raw = (result.get("state") or result.get("status") or "PENDING").upper()
            if raw != "APPROVED":
                raise HTTPException(status_code=401, detail="Push not approved")
            verified = True

        elif req.method == "totp":
            if not req.transaction_id or not req.otp_code:
                raise HTTPException(status_code=400, detail="transaction_id and otp_code required for TOTP")
            await verify_client.totp_verify(req.transaction_id, req.otp_code)
            verified = True

        elif req.method == "email_otp":
            if not req.transaction_id or not req.otp_code:
                raise HTTPException(status_code=400, detail="transaction_id and otp_code required for email OTP")
            await verify_client.email_otp_verify(req.transaction_id, req.otp_code)
            verified = True

        elif req.method == "fido2":
            if not req.assertion_response:
                raise HTTPException(status_code=400, detail="assertion_response required for FIDO2")
            await verify_client.fido2_login_complete(req.assertion_response)
            verified = True

        else:
            raise HTTPException(status_code=400, detail=f"Unknown method: {req.method}")

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Step-up complete failed for method %s: %s", req.method, exc)
        raise HTTPException(status_code=401, detail="MFA verification failed")

    if not verified:
        raise HTTPException(status_code=401, detail="MFA verification failed")

    # Re-fetch user to ensure they are still active
    result = await db.execute(select(User).where(User.verify_user_id == current_user.verify_user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Issue a new JWT with stepup_verified=True anchored to now
    token = create_session_token(
        user.verify_user_id, user.email, user.name, user.role,
        stepup_verified=True,
    )
    return {
        "token": token,
        "authenticated": True,
        "stepup_verified": True,
        "user": {"name": user.name, "email": user.email, "role": user.role},
    }
