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
from typing import Optional

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

# Factor preference order for inline step-up challenges.
# fido2 is excluded here — the inline modal has no WebAuthn browser API
# integration and fido2_login_begin 403s when FIDO2_RP_ID is "localhost"
# (the RP ID must match the actual origin serving the page).
# fido2 step-up goes through the full OIDC redirect flow (/stepup/initiate),
# not the inline /begin+complete flow.
_FACTOR_PREFERENCE = ["push", "totp", "email_otp"]

# ── In-process stores for factor context ─────────────────────────────────────
import time as _time

# Email OTP: tx_id → (winning_token, enrollment_id, expires_at)
_EMAIL_OTP_STORE: dict[str, tuple[str, str, float]] = {}
_EMAIL_OTP_TTL = 600  # 10 minutes

def _store_otp_ctx(tx_id: str, token: str, enrollment_id: str) -> None:
    _EMAIL_OTP_STORE[tx_id] = (token, enrollment_id, _time.monotonic() + _EMAIL_OTP_TTL)
    expired = [k for k, (_, _, exp) in _EMAIL_OTP_STORE.items() if _time.monotonic() > exp]
    for k in expired:
        _EMAIL_OTP_STORE.pop(k, None)

def _pop_otp_ctx(tx_id: str) -> tuple[Optional[str], Optional[str]]:
    """Return (winning_token, enrollment_id) or (None, None) if missing/expired."""
    entry = _EMAIL_OTP_STORE.pop(tx_id, None)
    if entry is None:
        return None, None
    token, eid, expires_at = entry
    if _time.monotonic() > expires_at:
        return None, None
    return token, eid

# Push: tx_id → (authenticator_id, expires_at)
# The v1.0 poll URL requires the authenticator_id — stored here at begin time.
_PUSH_STORE: dict[str, tuple[str, float]] = {}
_PUSH_TTL = 180  # 3 minutes

def _store_push_ctx(tx_id: str, authenticator_id: str) -> None:
    _PUSH_STORE[tx_id] = (authenticator_id, _time.monotonic() + _PUSH_TTL)
    expired = [k for k, (_, exp) in _PUSH_STORE.items() if _time.monotonic() > exp]
    for k in expired:
        _PUSH_STORE.pop(k, None)

def _get_push_auth_id(tx_id: str) -> str:
    """Return the authenticator_id for this transaction, or '' if expired/missing."""
    entry = _PUSH_STORE.get(tx_id)
    if entry is None:
        return ""
    auth_id, expires_at = entry
    return auth_id if _time.monotonic() < expires_at else ""


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
    preferred_method: Optional[str] = None  # optional override; defaults to auto-select


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

    last_exc: Optional[Exception] = None

    for method in candidates:
        try:
            if method == "push":
                result = await verify_client.push_initiate(current_user.verify_user_id)
                transaction_id = result.get("id") or result.get("transactionId")
                auth_id = result.get("_authenticator_id", result.get("authenticatorId", ""))
                # Store authenticator_id so poll and complete can build the correct URL
                if transaction_id and auth_id:
                    _store_push_ctx(transaction_id, auth_id)
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
                    current_user.verify_user_id, current_user.email,
                    user_access_token=current_user.ibm_access_token,
                )
                transaction_id = result.get("id") or result.get("transactionId")
                # IBM Verify's send response includes a "correlation" field.
                # This is the leading portion of the OTP shown in the email
                # (e.g. email shows "abc12-yyyyy"; correlation = "abc12").
                # We surface it as otp_hint so the frontend can display it as a
                # visual confirmation that the email arrived — the user still
                # types the FULL code from the email (including the prefix part).
                otp_hint: str = result.get("correlation") or ""
                logger.info(
                    "email_otp begin: tx=%s hint=%r send_keys=%s",
                    transaction_id, otp_hint, list(result.keys()),
                )
                # Store the winning token + enrollment_id so complete can use
                # the exact same auth context and correct verify URL.
                if transaction_id and result.get("_auth_token") and result.get("_enrollment_id"):
                    _store_otp_ctx(transaction_id, result["_auth_token"], result["_enrollment_id"])
                return {
                    "method": "email_otp",
                    "transaction_id": transaction_id,
                    "otp_hint": otp_hint,
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
        auth_id = _get_push_auth_id(transaction_id)
        result = await verify_client.push_poll(transaction_id, authenticator_id=auth_id)
        raw = result.get("state") or result.get("status") or "PENDING"
        normalized = raw.upper()
        # IBM Verify v1.0/authenticators returns VERIFY_SUCCESS on approval
        if normalized in ("APPROVED", "VERIFY_SUCCESS", "SUCCESS"):
            status = "approved"
        elif normalized in ("DENIED", "TIMEOUT", "FAILED", "EXPIRED", "VERIFY_FAILED"):
            status = "denied"
        else:
            status = "pending"
        return {"status": status}
    except Exception:
        raise HTTPException(status_code=502, detail="Unable to check push status")


# ── Complete: verify the factor response and issue a step-up JWT ───────────────

class StepUpCompleteRequest(BaseModel):
    method: str
    transaction_id: Optional[str] = None
    otp_code: Optional[str] = None          # for totp and email_otp
    assertion_response: Optional[dict] = None  # for fido2


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
            auth_id = _get_push_auth_id(req.transaction_id)
            result = await verify_client.push_poll(req.transaction_id, authenticator_id=auth_id)
            raw = (result.get("state") or result.get("status") or "PENDING").upper()
            # IBM Verify v1.0/authenticators returns VERIFY_SUCCESS on approval
            if raw not in ("APPROVED", "VERIFY_SUCCESS", "SUCCESS"):
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
            # Strip all whitespace and hyphens from whatever the user typed.
            # IBM Verify emails the code as a plain digit string; the user may
            # copy-paste it with a space or hyphen that we must remove.
            clean_otp = req.otp_code.replace("-", "").replace(" ", "").strip()
            logger.info(
                "email_otp complete: tx=%s raw_otp=%r clean_otp=%r",
                req.transaction_id, req.otp_code, clean_otp,
            )
            # Pop the stored context — winning token + enrollment_id — both required.
            winning_token, enrollment_id = _pop_otp_ctx(req.transaction_id)
            logger.info(
                "email_otp complete: enrollment_id=%s winning_token_present=%s",
                enrollment_id, bool(winning_token),
            )
            await verify_client.email_otp_verify(
                req.transaction_id, clean_otp,
                user_access_token=current_user.ibm_access_token,
                winning_token=winning_token,
                enrollment_id=enrollment_id,
            )
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
