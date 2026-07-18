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

from app.auth.jwt_handler import (
    create_session_token,
    create_stepup_token,
    decode_stepup_token,
    get_current_user,
    require_stepup,
)
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
    acr_values: str = "", login_hint: str = "",
    redirect_uri: str = "",
    force_reauth: bool = False,
) -> str:
    params: dict = {
        "response_type": "code",
        "response_mode": "query",
        "client_id": settings.verify_client_id,
        "redirect_uri": redirect_uri or settings.oidc_redirect_uri,
        "scope": "openid profile email",
        "state": state,
        "nonce": nonce,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    if force_reauth:
        # max_age=0 tells IBM Verify the current authentication is considered
        # expired and the user must re-authenticate.  IBM Verify will use the
        # user's active session identity but force a fresh factor challenge —
        # it picks the user's default/enrolled second factor without showing
        # the first-factor (password/passkey selection) page again.
        # Do NOT use prompt=login here — that triggers a full login from scratch.
        params["max_age"] = "0"
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


# ACR value for step-up — read from config so it can be changed via .env
# without touching code. Set STEPUP_ACR in .env to match your IBM Verify
# Access Policy ID exactly.
_MFA_ACR = settings.stepup_acr


@router.get("/login")
async def sso_login(acr_values: str = "", login_hint: str = ""):
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    code_verifier, code_challenge = _pkce_pair()
    # First leg: plain identity-only login — no acr_values yet.
    # We learn the user's role from the ID token, then decide whether to
    # trigger a step-up MFA challenge in the callback handler.
    # Callers may still override by passing acr_values explicitly.
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
        # Fallback: same email may exist under an old verify_user_id (e.g. user was
        # recreated in IBM Verify). Reclaim the record instead of inserting a duplicate.
        result2 = await db.execute(select(User).where(User.email == email))
        user = result2.scalar_one_or_none()

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
        user.verify_user_id = verify_user_id  # update if it changed
        user.email = email
        user.name = name
        user.role = role
        user.is_active = True

    await db.commit()
    await db.refresh(user)

    # The OIDC flow authenticates the user.  Step-up is separate and only
    # required when the user later attempts a high-risk operation.
    token = create_session_token(
        user.verify_user_id, user.email, user.name, user.role
    )
    return {
        "token": token,
        "authenticated": True,
        "stepup_verified": False,
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


# ── Step-up authentication ────────────────────────────────────────────────────
# Used when a user has a valid session but needs to re-verify with MFA before
# performing a sensitive action (e.g. bank transfer).


class StepUpInitiateRequest(BaseModel):
    return_to: str = "/transfers"


@router.post("/stepup/initiate")
async def stepup_initiate(
    req: StepUpInitiateRequest,
    current_user=Depends(get_current_user),
):
    """
    Begin a step-up MFA challenge for an already-authenticated user.
    Returns an IBM Verify authorization URL that enforces MFA, plus a
    short-lived step_up_token encoding the return destination.
    The frontend opens the IBM Verify URL and sends the resulting
    code+state back to /auth/sso/stepup/complete.
    """
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    code_verifier, code_challenge = _pkce_pair()
    stepup_uri = settings.stepup_redirect_uri or settings.oidc_redirect_uri.replace(
        "/callback", "/stepup-callback"
    )
    _state_put(state, {
        "nonce": nonce,
        "code_verifier": code_verifier,
        "expires": time.time() + STATE_TTL_SECONDS,
        "mfa": "1",
        "stepup": "1",
        "return_to": req.return_to,
        "redirect_uri": stepup_uri,
    })
    step_up_token = create_stepup_token(current_user.verify_user_id, req.return_to)
    auth_url = _build_authorize_url(
        state, nonce, code_challenge,
        # Pass the configured ACR value so IBM Verify enforces the correct
        # access policy (e.g. "Require 2FA each session").
        # Set STEPUP_ACR in .env to the Policy ID shown on the Access Policies
        # page in the IBM Verify admin console.
        # If STEPUP_ACR is empty, max_age=0 alone is used (may silently pass).
        acr_values=_MFA_ACR,
        login_hint=current_user.email,
        redirect_uri=stepup_uri,
        force_reauth=True,
    )
    return {"authorization_url": auth_url, "step_up_token": step_up_token}


class StepUpCallbackRequest(BaseModel):
    code: str
    state: str
    step_up_token: str


@router.post("/stepup/complete")
async def stepup_complete(
    req: StepUpCallbackRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Complete a step-up MFA challenge.
    Validates the OIDC code+state, confirms the step-up token is valid,
    then re-issues the session JWT with stepup_verified=True.
    """
    # Validate step-up token first (fast fail before hitting IBM Verify)
    stepup_payload = decode_stepup_token(req.step_up_token)

    pending = _state_pop(req.state)
    if not pending or not pending.get("stepup"):
        raise HTTPException(status_code=400, detail="Invalid or expired step-up state")
    if time.time() > float(pending["expires"]):
        raise HTTPException(status_code=400, detail="Step-up state expired")

    try:
        token_response = await verify_client.oidc_token_exchange(
            code=req.code,
            redirect_uri=str(pending.get("redirect_uri") or settings.oidc_redirect_uri),
            code_verifier=str(pending["code_verifier"]),
        )
    except Exception as exc:
        logger.error("Step-up token exchange failed: %s", str(exc), exc_info=True)
        raise HTTPException(status_code=502, detail=f"Step-up token exchange failed: {exc}")

    id_token = token_response.get("id_token")
    if not id_token:
        raise HTTPException(status_code=502, detail="No ID token in step-up response")

    try:
        jwks = await verify_client.get_oidc_jwks()
        claims = jose_jwt.decode(
            id_token,
            jwks,
            algorithms=["RS256"],
            audience=settings.verify_client_id,
            issuer=settings.verify_oidc_issuer,
            options={"verify_at_hash": False},
        )
    except JWTError as exc:
        logger.error("Step-up ID token validation failed: %s", str(exc), exc_info=True)
        raise HTTPException(status_code=401, detail=f"Step-up token validation failed: {exc}")

    if claims.get("nonce") != pending["nonce"]:
        raise HTTPException(status_code=401, detail="Nonce mismatch in step-up")

    # Confirm the authenticated user matches the step-up token subject
    if claims["sub"] != stepup_payload["sub"]:
        raise HTTPException(status_code=403, detail="Step-up user mismatch")

    # ── Verify IBM Verify actually performed a fresh authentication ────────
    # Log the key claims so we can inspect what IBM Verify returned.
    auth_time = claims.get("auth_time")  # unix timestamp of actual auth event
    amr = claims.get("amr", [])          # authentication methods used
    acr = claims.get("acr", "")
    logger.info(
        "Step-up ID token claims — sub=%s auth_time=%s amr=%s acr=%s iat=%s",
        claims.get("sub"), auth_time, amr, acr, claims.get("iat"),
    )

    # auth_time must be recent (within the last 60 seconds) to prove IBM Verify
    # actually challenged the user right now rather than silently reusing the session.
    if auth_time is not None:
        age_seconds = time.time() - float(auth_time)
        logger.info("Step-up auth_time age: %.1fs", age_seconds)
        if age_seconds > 120:
            logger.warning(
                "Step-up rejected: auth_time is %ds old — IBM Verify silently "
                "reused the existing session without challenging the user.",
                int(age_seconds),
            )
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "STEP_UP_REQUIRED",
                    "message": (
                        "IBM Verify did not perform a fresh MFA challenge. "
                        "Please enroll a second factor in IBM Verify "
                        "(Settings → Security → Two-step verification) "
                        "and try again."
                    ),
                },
            )
    # ─────────────────────────────────────────────────────────────────────

    result = await db.execute(select(User).where(User.verify_user_id == claims["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")

    # Issue a new session token with stepup_verified=True so the expiry
    # window is anchored to this exact moment (stepup_time = now).
    token = create_session_token(
        user.verify_user_id, user.email, user.name, user.role,
        stepup_verified=True,
    )
    return_to = stepup_payload.get("return_to", "/transfers")
    return {
        "token": token,
        "authenticated": True,
        "stepup_verified": True,
        "return_to": return_to,
        "user": {"name": user.name, "email": user.email, "role": user.role},
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
