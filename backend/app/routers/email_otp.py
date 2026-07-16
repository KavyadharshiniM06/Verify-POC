"""
Email OTP authentication endpoints.

Flow:
  1. POST /auth/email-otp/send   → IBM Verify emails a code to the user
                                 → returns transaction_id (code is never echoed)
  2. POST /auth/email-otp/verify → user submits code + transaction_id
                                 → JWT issued on success

Security: OTP codes are never logged. EmailStr validates email format server-side.
"""
import logging

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import create_session_token
from app.database import get_db
from app.models import User
from app.services.verify_client import verify_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/email-otp", tags=["email-otp"])


class EmailOTPSendRequest(BaseModel):
    verify_user_id: str
    email: EmailStr


class EmailOTPVerifyRequest(BaseModel):
    verify_user_id: str
    transaction_id: str
    otp_code: str
    email: EmailStr
    name: str = "MockBank User"


@router.post("/send")
async def email_otp_send(req: EmailOTPSendRequest):
    """Send OTP email via IBM Verify. Returns transaction_id."""
    try:
        result = await verify_client.email_otp_send(
            user_id=req.verify_user_id,
            email=str(req.email),
        )
        return {
            "transaction_id": result.get("id") or result.get("transactionId"),
            # Do not echo the email back — generic confirmation only
            "message": "A code was sent to your email.",
        }
    except Exception:
        logger.error("Email OTP send failed")
        raise HTTPException(status_code=502, detail="Failed to send email OTP")


@router.post("/verify")
async def email_otp_verify(req: EmailOTPVerifyRequest, db: AsyncSession = Depends(get_db)):
    """
    Verify email OTP code. On success: upsert user and issue JWT.
    Generic error — no distinction between wrong code vs expired.
    """
    try:
        await verify_client.email_otp_verify(req.transaction_id, req.otp_code)
    except Exception:
        logger.error("Email OTP verify failed")
        raise HTTPException(status_code=401, detail="Invalid or expired code")

    db_result = await db.execute(select(User).where(User.verify_user_id == req.verify_user_id))
    user = db_result.scalar_one_or_none()
    if not user:
        from app.seed import seed_user_data

        user = User(
            verify_user_id=req.verify_user_id,
            email=str(req.email),
            name=req.name,
        )
        db.add(user)
        await db.flush()
        await seed_user_data(db, user.id, req.verify_user_id)
        await db.commit()

    token = create_session_token(user.verify_user_id, user.email, user.name)
    return {"token": token, "user": {"name": user.name, "email": user.email}}
