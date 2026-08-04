"""
TOTP (Time-based One-Time Password) authentication endpoints.

Flow:
  Enroll:  POST /auth/totp/enroll          → returns otpauth URI + transaction_id
           POST /auth/totp/enroll/confirm  → user enters first code, issues JWT
  Login:   POST /auth/totp/verify          → 6-digit code → JWT

IBM Verify's /v2.0/factors/totp/verifications requires the user's own access_token
(not client_credentials). The enroll and confirm endpoints require authentication
so we can read ibm_access_token from the session user and pass it to IBM Verify.
"""
import json as _json_mod
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import create_session_token, get_current_user
from app.database import get_db
from app.models import User
from app.services.verify_client import verify_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/totp", tags=["totp"])


def _ibv_message(body: str) -> str:
    """Extract IBM Verify messageDescription from an error response body."""
    try:
        return _json_mod.loads(body).get("messageDescription", "")
    except Exception:
        return ""


class TOTPEnrollRequest(BaseModel):
    verify_user_id: str
    # User's own IBM Verify OIDC access_token — required for factor enrollment.
    # IBM Verify's /v2.0/factors/totp/verifications only accepts a token whose
    # sub = the userId being enrolled. Passed by the frontend from sessionStorage.
    ibm_access_token: Optional[str] = None


class TOTPConfirmRequest(BaseModel):
    verify_user_id: str
    transaction_id: str
    otp_code: str
    email: str
    name: str
    ibm_access_token: Optional[str] = None


class TOTPVerifyRequest(BaseModel):
    verify_user_id: str
    transaction_id: str
    otp_code: str


@router.post("/enroll")
async def totp_enroll(
    req: TOTPEnrollRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Start TOTP enrollment. Returns otpauth:// URI and transaction_id.
    Uses ibm_access_token from the request body (the user's own OIDC token),
    falling back to the DB-stored token, then admin ROPC.
    IBM Verify only accepts a token whose sub = the userId being enrolled.
    """
    import httpx as _httpx
    # Priority: request body token (freshest) → DB-stored token → admin ROPC
    user_token: Optional[str] = (
        req.ibm_access_token
        or getattr(current_user, "ibm_access_token", None)
    )
    try:
        result = await verify_client.totp_enroll(
            user_id=req.verify_user_id,
            user_access_token=user_token,
        )
        return {
            "transaction_id": result.get("id") or result.get("transactionId"),
            "otp_uri": result.get("uri") or result.get("totpUri") or result.get("qrCode"),
            "secret": result.get("secret"),
        }
    except _httpx.HTTPStatusError as exc:
        body = exc.response.text if exc.response is not None else ""
        status = exc.response.status_code if exc.response is not None else 502
        logger.error("TOTP enroll IBM Verify error %s: %s", status, body)
        msg = _ibv_message(body) or f"IBM Verify returned {status}"
        raise HTTPException(status_code=502, detail=msg) from exc
    except Exception as exc:
        logger.error("TOTP enroll failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/enroll/confirm")
async def totp_enroll_confirm(
    req: TOTPConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Confirm TOTP enrollment with the user's first code.
    On success: upsert User, seed banking data for new users, issue JWT.
    """
    import httpx as _httpx
    user_token: Optional[str] = (
        req.ibm_access_token
        or getattr(current_user, "ibm_access_token", None)
    )
    try:
        await verify_client.totp_verify(
            req.transaction_id, req.otp_code, user_access_token=user_token
        )
    except _httpx.HTTPStatusError as exc:
        body = exc.response.text if exc.response is not None else ""
        logger.error("TOTP confirm IBM Verify error: %s", body)
        raise HTTPException(status_code=401, detail="Invalid TOTP code") from exc
    except Exception as exc:
        logger.error("TOTP enroll confirm failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid TOTP code") from exc

    # Fetch live email from IBM Verify — source of truth
    live_email = await verify_client.get_live_email(req.verify_user_id, fallback=req.email)

    db_result = await db.execute(select(User).where(User.verify_user_id == req.verify_user_id))
    user = db_result.scalar_one_or_none()
    if not user:
        from app.seed import seed_user_data

        user = User(verify_user_id=req.verify_user_id, email=live_email, name=req.name)
        db.add(user)
        await db.flush()
        await seed_user_data(db, user.id, req.verify_user_id)
        await db.commit()
    elif user.email.lower() != live_email.lower():
        logger.info(
            "totp_enroll_confirm: syncing local DB email %r → %r for user %s",
            user.email, live_email, req.verify_user_id,
        )
        user.email = live_email
        await db.commit()

    token = create_session_token(user.verify_user_id, user.email, user.name, user.role)
    return {"token": token, "user": {"name": user.name, "email": user.email, "role": user.role}}


@router.post("/verify")
async def totp_verify(req: TOTPVerifyRequest, db: AsyncSession = Depends(get_db)):
    """
    Verify TOTP code for login. On success: issue JWT.
    The transaction_id is obtained first via POST /auth/totp/enroll.
    """
    try:
        await verify_client.totp_verify(req.transaction_id, req.otp_code)
    except Exception:
        logger.error("TOTP verify failed")
        raise HTTPException(status_code=401, detail="Invalid or expired TOTP code")

    db_result = await db.execute(select(User).where(User.verify_user_id == req.verify_user_id))
    user = db_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found — register first")

    token = create_session_token(user.verify_user_id, user.email, user.name, user.role)
    return {"token": token, "user": {"name": user.name, "email": user.email, "role": user.role}}
