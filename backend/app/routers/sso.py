import base64
import hashlib
import json
import logging
import secrets
import time
from pathlib import Path
from typing import Dict, Union
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request
from jose import JWTError
from jose import jwt as jose_jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import create_session_token, get_current_user
from app.config import settings
from app.database import get_db
from app.models import User
from app.seed import seed_user_data
from app.services.verify_client import verify_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/sso", tags=["sso"])

STATE_TTL_SECONDS = 300
ROLE_PRIORITY = {"Admin": 3, "Manager": 2, "Customer": 1}

# File-backed state store so PKCE state survives uvicorn --reload restarts
_STATE_FILE = Path(__file__).resolve().parents[3] / ".oidc_states.json"


def _load_states() -> Dict[str, Dict[str, Union[float, str]]]:
    if _STATE_FILE.exists():
        try:
            return json.loads(_STATE_FILE.read_text())
        except Exception:
            pass
    return {}


def _save_states(states: Dict[str, Dict[str, Union[float, str]]]) -> None:
    # Purge expired entries before saving
    now = time.time()
    states = {k: v for k, v in states.items() if float(v.get("expires", 0)) > now}
    try:
        _STATE_FILE.write_text(json.dumps(states))
    except Exception as exc:
        logger.warning("Could not persist OIDC states: %s", exc)


def _state_pop(state_key: str) -> Union[Dict[str, Union[float, str]], None]:
    states = _load_states()
    entry = states.pop(state_key, None)
    if entry is not None:
        _save_states(states)
    return entry


def _state_put(state_key: str, value: Dict[str, Union[float, str]]) -> None:
    states = _load_states()
    states[state_key] = value
    _save_states(states)


def _pkce_pair() -> "tuple[str, str]":
    """Generate a PKCE code_verifier and its S256 code_challenge (RFC 7636)."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def _build_authorize_url(
    state: str, nonce: str, code_challenge: str,
    acr_values: str = "", login_hint: str = ""
) -> str:
    params: dict = {
        "response_type": "code",
        "response_mode": "query",
        "client_id": settings.verify_client_id,
        "redirect_uri": settings.oidc_redirect_uri,
        "scope": "openid profile email",
        "state": state,
        "nonce": nonce,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "prompt": "login",   # force re-authentication every time
    }
    if acr_values:
        params["acr_values"] = acr_values
    if login_hint:
        params["login_hint"] = login_hint
    return f"{settings.verify_oidc_authorize_url}?{urlencode(params)}"


def _map_role(claims: dict) -> str:
    groups = claims.get(settings.verify_group_claim, [])
    if isinstance(groups, str):
        groups = [groups]
    matched_roles = [group for group in groups if group in ROLE_PRIORITY]
    if not matched_roles:
        return "Customer"
    return max(matched_roles, key=lambda role: ROLE_PRIORITY[role])


@router.get("/login")
async def sso_login(acr_values: str = "", login_hint: str = ""):
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    code_verifier, code_challenge = _pkce_pair()
    _state_put(state, {
        "nonce": nonce,
        "code_verifier": code_verifier,
        "expires": time.time() + STATE_TTL_SECONDS,
    })
    return {"authorization_url": _build_authorize_url(state, nonce, code_challenge, acr_values, login_hint)}


class CallbackRequest(BaseModel):
    code: str
    state: str


@router.post("/callback")
async def sso_callback(
    req: CallbackRequest,
    db: AsyncSession = Depends(get_db),
):
    pending = _state_pop(req.state)
    if not pending:
        raise HTTPException(status_code=400, detail="Invalid state parameter")
    if time.time() > float(pending["expires"]):
        raise HTTPException(status_code=400, detail="State expired")

    try:
        token_response = await verify_client.oidc_token_exchange(
            code=req.code,
            redirect_uri=settings.oidc_redirect_uri,
            code_verifier=str(pending["code_verifier"]),
        )
    except Exception as exc:
        logger.error("OIDC token exchange failed — IBM Verify response: %s", str(exc), exc_info=True)
        raise HTTPException(status_code=502, detail=f"SSO token exchange failed: {exc}")

    id_token = token_response.get("id_token")
    if not id_token:
        raise HTTPException(status_code=502, detail=f"No ID token in response. Keys: {list(token_response.keys())}")

    access_token = token_response.get("access_token", "")

    try:
        jwks = await verify_client.get_oidc_jwks()
        claims = jose_jwt.decode(
            id_token,
            jwks,
            algorithms=["RS256"],
            audience=settings.verify_client_id,
            issuer=settings.verify_oidc_issuer,
            options={"verify_at_hash": False},  # skip at_hash — python-jose computes it incorrectly for some token shapes
        )
    except JWTError as exc:
        logger.error("ID token validation failed: %s", str(exc), exc_info=True)
        raise HTTPException(status_code=401, detail=f"ID token validation failed: {exc}")

    if claims.get("nonce") != pending["nonce"]:
        raise HTTPException(status_code=401, detail="Nonce mismatch")

    verify_user_id = claims["sub"]
    email = claims.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email claim missing from ID token")
    name = claims.get("name") or claims.get("preferred_username") or email
    role = _map_role(claims)

    result = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
    user = result.scalar_one_or_none()
    if not user:
        user = User(
            verify_user_id=verify_user_id,
            email=email,
            name=name,
            role=role,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        await seed_user_data(db, user.id, verify_user_id)
    else:
        user.email = email
        user.name = name
        user.role = role
        user.is_active = True

    await db.commit()
    await db.refresh(user)

    token = create_session_token(user.verify_user_id, user.email, user.name, user.role)
    return {
        "token": token,
        "user": {
            "name": user.name,
            "email": user.email,
            "role": user.role,
        },
    }


@router.get("/me")
async def get_session_user(current_user: User = Depends(get_current_user)):
    return {
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
    }


@router.get("/logout")
async def sso_logout():
    if not settings.verify_oidc_logout_url:
        return {"logout_url": settings.post_logout_redirect_uri}

    params = urlencode(
        {
            "client_id": settings.verify_client_id,
            "post_logout_redirect_uri": settings.post_logout_redirect_uri,
        }
    )
    return {"logout_url": f"{settings.verify_oidc_logout_url}?{params}"}
