"""
FIDO2/WebAuthn authentication endpoints.

Flow:
  Registration: POST /auth/fido2/register/begin → browser WebAuthn API → POST /auth/fido2/register/complete
  Login:        POST /auth/fido2/login/begin    → browser WebAuthn API → POST /auth/fido2/login/complete
"""
import json as _json_mod
import logging


def _ibv_message(body: str) -> str:
    """Extract IBM Verify messageDescription or return empty string."""
    try:
        return _json_mod.loads(body).get("messageDescription", "")
    except Exception:
        return ""


from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import create_session_token
from app.database import get_db
from app.models import User
from app.seed import seed_user_data
from app.services.verify_client import verify_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/fido2", tags=["fido2"])


class RegisterBeginRequest(BaseModel):
    verify_user_id: str
    username: str
    display_name: str


class RegisterCompleteRequest(BaseModel):
    verify_user_id: str
    email: str
    name: str
    attestation_response: dict  # raw WebAuthn attestation object from browser


class LoginBeginRequest(BaseModel):
    verify_user_id: str


class LoginCompleteRequest(BaseModel):
    verify_user_id: str
    assertion_response: dict  # raw WebAuthn assertion object from browser


@router.post("/register/begin")
async def register_begin(req: RegisterBeginRequest):
    """Return FIDO2 registration challenge options from IBM Verify."""
    try:
        options = await verify_client.fido2_register_begin(
            user_id=req.verify_user_id,
            username=req.username,
            display_name=req.display_name,
        )
        return options
    except Exception as exc:
        import httpx as _httpx
        if isinstance(exc, _httpx.HTTPStatusError):
            body = exc.response.text if exc.response is not None else ""
            status = exc.response.status_code if exc.response is not None else 502
            msg = _ibv_message(body) or f"IBM Verify returned {status}: {body[:200]}"
            logger.error("FIDO2 register/begin IBM Verify error %s: %s", status, body[:400])
            raise HTTPException(status_code=502, detail=msg) from exc
        logger.error("FIDO2 register/begin failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/register/complete")
async def register_complete(req: RegisterCompleteRequest, db: AsyncSession = Depends(get_db)):
    """
    Forward attestation to IBM Verify.
    On success: create/update local User record and issue JWT session.
    """
    try:
        await verify_client.fido2_register_complete(
            user_id=req.verify_user_id,
            attestation_response=req.attestation_response,
        )
    except Exception:
        logger.error("FIDO2 register/complete failed")
        raise HTTPException(status_code=401, detail="Passkey registration failed")

    # Always use the live email from IBM Verify — source of truth
    live_email = await verify_client.get_live_email(req.verify_user_id, fallback=req.email)

    # Upsert user in local DB
    db_result = await db.execute(select(User).where(User.verify_user_id == req.verify_user_id))
    user = db_result.scalar_one_or_none()
    if not user:
        user = User(verify_user_id=req.verify_user_id, email=live_email, name=req.name)
        db.add(user)
        await db.flush()
        await seed_user_data(db, user.id, req.verify_user_id)
    elif user.email.lower() != live_email.lower():
        logger.info(
            "fido2_register_complete: syncing local DB email %r → %r for user %s",
            user.email, live_email, req.verify_user_id,
        )
        user.email = live_email
    await db.commit()

    token = create_session_token(req.verify_user_id, live_email, req.name, user.role)
    return {"token": token, "user": {"name": user.name, "email": user.email, "role": user.role}}


@router.post("/login/begin")
async def login_begin(req: LoginBeginRequest):
    """Return FIDO2 assertion challenge options from IBM Verify."""
    try:
        options = await verify_client.fido2_login_begin(user_id=req.verify_user_id)
        return options
    except Exception:
        logger.error("FIDO2 login/begin failed")
        raise HTTPException(status_code=502, detail="Identity provider error")


@router.post("/login/complete")
async def login_complete(req: LoginCompleteRequest, db: AsyncSession = Depends(get_db)):
    """Verify assertion with IBM Verify. On success: issue JWT session."""
    try:
        await verify_client.fido2_login_complete(assertion_response=req.assertion_response)
    except Exception:
        logger.error("FIDO2 login/complete: assertion verification failed")
        raise HTTPException(status_code=401, detail="Authentication failed")

    # Look up local user
    db_result = await db.execute(select(User).where(User.verify_user_id == req.verify_user_id))
    user = db_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found — register first")

    token = create_session_token(user.verify_user_id, user.email, user.name, user.role)
    return {"token": token, "user": {"name": user.name, "email": user.email, "role": user.role}}
