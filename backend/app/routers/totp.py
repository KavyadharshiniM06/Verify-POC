"""
TOTP (Time-based One-Time Password) authentication endpoints.

Flow:
  Enroll:  POST /auth/totp/enroll          → returns otpauth URI + transaction_id
           POST /auth/totp/enroll/confirm  → user enters first code, issues JWT
  Login:   POST /auth/totp/verify          → 6-digit code → JWT
"""
import logging

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import create_session_token
from app.database import get_db
from app.models import User
from app.services.verify_client import verify_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/totp", tags=["totp"])


class TOTPEnrollRequest(BaseModel):
    verify_user_id: str


class TOTPConfirmRequest(BaseModel):
    verify_user_id: str
    transaction_id: str
    otp_code: str
    email: str
    name: str


class TOTPVerifyRequest(BaseModel):
    verify_user_id: str
    transaction_id: str
    otp_code: str


@router.post("/enroll")
async def totp_enroll(req: TOTPEnrollRequest):
    """
    Start TOTP enrollment. Returns otpauth:// URI and transaction_id.
    Frontend renders the URI as a QR code for scanning.
    """
    try:
        result = await verify_client.totp_enroll(user_id=req.verify_user_id)
        return {
            "transaction_id": result.get("id") or result.get("transactionId"),
            "otp_uri": result.get("uri") or result.get("totpUri") or result.get("qrCode"),
            "secret": result.get("secret"),
        }
    except Exception:
        logger.error("TOTP enroll failed")
        raise HTTPException(status_code=502, detail="TOTP enrollment failed")


@router.post("/enroll/confirm")
async def totp_enroll_confirm(req: TOTPConfirmRequest, db: AsyncSession = Depends(get_db)):
    """
    Confirm TOTP enrollment with the user's first code.
    On success: upsert User, seed banking data for new users, issue JWT.
    """
    try:
        await verify_client.totp_verify(req.transaction_id, req.otp_code)
    except Exception:
        logger.error("TOTP enroll confirm failed")
        raise HTTPException(status_code=401, detail="Invalid TOTP code")

    db_result = await db.execute(select(User).where(User.verify_user_id == req.verify_user_id))
    user = db_result.scalar_one_or_none()
    if not user:
        from app.seed import seed_user_data

        user = User(verify_user_id=req.verify_user_id, email=req.email, name=req.name)
        db.add(user)
        await db.flush()
        await seed_user_data(db, user.id, req.verify_user_id)
        await db.commit()

    token = create_session_token(user.verify_user_id, user.email, user.name)
    return {"token": token, "user": {"name": user.name, "email": user.email}}


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

    token = create_session_token(user.verify_user_id, user.email, user.name)
    return {"token": token, "user": {"name": user.name, "email": user.email}}
