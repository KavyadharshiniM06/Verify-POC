"""
Push Notification authentication endpoints.

Flow:
  1. POST /auth/push/initiate           → IBM Verify sends push to enrolled device
                                        → returns transaction_id
  2. GET  /auth/push/poll/{id}          → frontend polls every 2s (max 60s)
                                        → returns {status: pending|approved|denied}
  3. POST /auth/push/complete           → called when status == approved
                                        → re-verifies server-side, issues JWT

IBM Verify push statuses → our API:
  APPROVED → "approved"
  DENIED / TIMEOUT / FAILED / EXPIRED → "denied"
  anything else → "pending"
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
router = APIRouter(prefix="/auth/push", tags=["push"])

import time as _time

# Maps transaction_id → (authenticator_id, expires_at) so poll and complete
# can build the correct /v1.0/authenticators/{auth_id}/verifications/{tx_id} URL.
_PUSH_STORE: dict[str, tuple[str, float]] = {}
_PUSH_TTL = 180

def _store_push_ctx(tx_id: str, auth_id: str) -> None:
    _PUSH_STORE[tx_id] = (auth_id, _time.monotonic() + _PUSH_TTL)
    expired = [k for k, (_, exp) in _PUSH_STORE.items() if _time.monotonic() > exp]
    for k in expired:
        _PUSH_STORE.pop(k, None)

def _get_auth_id(tx_id: str) -> str:
    entry = _PUSH_STORE.get(tx_id)
    if not entry:
        return ""
    auth_id, exp = entry
    return auth_id if _time.monotonic() < exp else ""


class PushInitiateRequest(BaseModel):
    verify_user_id: str


class PushCompleteRequest(BaseModel):
    verify_user_id: str
    transaction_id: str


def _map_status(raw: str) -> str:
    normalized = raw.upper()
    # IBM Verify v1.0/authenticators returns VERIFY_SUCCESS on approval
    if normalized in ("APPROVED", "VERIFY_SUCCESS", "SUCCESS"):
        return "approved"
    if normalized in ("DENIED", "TIMEOUT", "FAILED", "EXPIRED", "VERIFY_FAILED"):
        return "denied"
    return "pending"


@router.post("/initiate")
async def push_initiate(req: PushInitiateRequest):
    """Send push notification to enrolled device. Returns transaction_id."""
    try:
        result = await verify_client.push_initiate(user_id=req.verify_user_id)
        transaction_id = result.get("id") or result.get("transactionId")
        auth_id = result.get("_authenticator_id", result.get("authenticatorId", ""))
        if transaction_id and auth_id:
            _store_push_ctx(transaction_id, auth_id)
        return {"transaction_id": transaction_id}
    except Exception:
        logger.error("Push initiate failed")
        raise HTTPException(
            status_code=502,
            detail="Push notification failed. Is your device enrolled?",
        )


@router.get("/poll/{transaction_id}")
async def push_poll(transaction_id: str):
    """
    Poll IBM Verify for push approval status.
    Returns: {"status": "pending" | "approved" | "denied"}
    """
    try:
        auth_id = _get_auth_id(transaction_id)
        result = await verify_client.push_poll(transaction_id=transaction_id, authenticator_id=auth_id)
        raw = result.get("state") or result.get("status") or "PENDING"
        return {"status": _map_status(str(raw))}
    except Exception:
        logger.error("Push poll failed")
        raise HTTPException(status_code=502, detail="Unable to check push status")


@router.post("/complete")
async def push_complete(req: PushCompleteRequest, db: AsyncSession = Depends(get_db)):
    """
    Called after frontend detects approval.
    Re-verifies approval server-side before issuing JWT — cannot be spoofed.
    """
    try:
        auth_id = _get_auth_id(req.transaction_id)
        result = await verify_client.push_poll(transaction_id=req.transaction_id, authenticator_id=auth_id)
        raw = result.get("state") or result.get("status") or "PENDING"
        if _map_status(str(raw)) != "approved":
            raise HTTPException(status_code=401, detail="Push not approved")
    except HTTPException:
        raise
    except Exception:
        logger.error("Push complete: status check failed")
        raise HTTPException(status_code=502, detail="Unable to verify push approval")

    db_result = await db.execute(select(User).where(User.verify_user_id == req.verify_user_id))
    user = db_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found — register first")

    token = create_session_token(user.verify_user_id, user.email, user.name, user.role)
    return {"token": token, "user": {"name": user.name, "email": user.email, "role": user.role}}
