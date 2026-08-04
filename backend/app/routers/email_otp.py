"""
Email OTP authentication endpoints.

Flow:
  1. POST /auth/email-otp/send   → IBM Verify emails a code to the user
                                 → returns transaction_id (code is never echoed)
  2. POST /auth/email-otp/verify → user submits code + transaction_id
                                 → JWT issued on success

Security: OTP codes are never logged. EmailStr validates email format server-side.

IBM Verify's factor APIs require a user-context token. Both endpoints try to read
ibm_access_token from the session user (enrolled users calling from Settings) and
pass it to IBM Verify. Unauthenticated callers (login flow, first-time enrollment)
get None and fall back to the admin ROPC token.
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import create_session_token, decode_session_token
from app.database import get_db
from app.models import User
from app.services.verify_client import verify_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/email-otp", tags=["email-otp"])

_bearer = HTTPBearer(auto_error=False)


async def _optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """
    Return the authenticated User if a valid Bearer token is present, else None.
    Never raises — used by endpoints that are accessible both authenticated
    (enrollment from an existing session) and unauthenticated (login flow).
    """
    if not credentials:
        return None
    try:
        payload = decode_session_token(credentials.credentials)
        verify_user_id = payload.get("sub")
        if not verify_user_id:
            return None
        result = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
        return result.scalar_one_or_none()
    except Exception:
        return None


class EmailOTPSendRequest(BaseModel):
    verify_user_id: str
    email: EmailStr
    # User's own IBM Verify OIDC access_token — required for factor enrollment.
    # Passed by the frontend from sessionStorage so it's always per-user.
    ibm_access_token: Optional[str] = None


class EmailOTPVerifyRequest(BaseModel):
    verify_user_id: str
    transaction_id: str
    otp_code: str
    email: EmailStr
    name: str = "MockBank User"
    ibm_access_token: Optional[str] = None


@router.post("/send")
async def email_otp_send(
    req: EmailOTPSendRequest,
    current_user: Optional[User] = Depends(_optional_current_user),
):
    """
    Send OTP email via IBM Verify. Returns transaction_id.

    Always fetches the live email from IBM Verify SCIM first so the OTP is
    sent to the address currently on record in IBM Verify, not a potentially
    stale value from the local DB or the request body.
    """
    user_token: Optional[str] = (
        req.ibm_access_token
        or (getattr(current_user, "ibm_access_token", None) if current_user else None)
    )
    # Always resolve the email from IBM Verify — source of truth
    live_email = await verify_client.get_live_email(req.verify_user_id, fallback=str(req.email))
    try:
        result = await verify_client.email_otp_send(
            user_id=req.verify_user_id,
            email=live_email,
            user_access_token=user_token,
        )
        return {
            "transaction_id": result.get("id") or result.get("transactionId"),
            "message": "A code was sent to your email.",
        }
    except Exception:
        logger.error("Email OTP send failed")
        raise HTTPException(status_code=502, detail="Failed to send email OTP")


@router.post("/verify")
async def email_otp_verify(
    req: EmailOTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(_optional_current_user),
):
    """
    Verify email OTP code. On success: upsert user and issue JWT.

    Fetches the live email from IBM Verify before verifying so the local DB
    stays in sync with any email change the admin made in the IBM Verify portal.
    Generic error — no distinction between wrong code vs expired.
    """
    user_token: Optional[str] = (
        req.ibm_access_token
        or (getattr(current_user, "ibm_access_token", None) if current_user else None)
    )
    try:
        await verify_client.email_otp_verify(
            req.transaction_id, req.otp_code, user_access_token=user_token
        )
    except Exception:
        logger.error("Email OTP verify failed")
        raise HTTPException(status_code=401, detail="Invalid or expired code")

    # Fetch the current email from IBM Verify so the local record stays in sync
    live_email = await verify_client.get_live_email(req.verify_user_id, fallback=str(req.email))

    db_result = await db.execute(select(User).where(User.verify_user_id == req.verify_user_id))
    user = db_result.scalar_one_or_none()
    if not user:
        from app.seed import seed_user_data

        user = User(
            verify_user_id=req.verify_user_id,
            email=live_email,
            name=req.name,
        )
        db.add(user)
        await db.flush()
        await seed_user_data(db, user.id, req.verify_user_id)
        await db.commit()
    elif user.email.lower() != live_email.lower():
        # Email was changed in IBM Verify — keep local DB in sync
        logger.info(
            "email_otp_verify: updating local DB email %r → %r for user %s",
            user.email, live_email, req.verify_user_id,
        )
        user.email = live_email
        await db.commit()

    token = create_session_token(user.verify_user_id, user.email, user.name, user.role)
    return {"token": token, "user": {"name": user.name, "email": user.email, "role": user.role}}
