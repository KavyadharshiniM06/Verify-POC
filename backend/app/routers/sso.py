"""
SSO via OIDC (OpenID Connect) using IBM Verify SaaS as the identity provider.

Flow:
  1. GET  /auth/sso/login    → generate state+nonce, redirect to IBM Verify hosted login
  2. GET  /auth/sso/callback → receive code+state, exchange for tokens, validate ID token, issue JWT

Security:
  - state validated to prevent CSRF (cryptographically random, 5-min TTL)
  - nonce validated to prevent ID token replay attacks
  - ID token RS256 signature validated against IBM Verify JWKS
  - Client secret never appears in any frontend code or URL
"""
import logging
import secrets
import time

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from jose import JWTError
from jose import jwt as jose_jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import create_session_token
from app.config import settings
from app.database import get_db
from app.models import User
from app.services.verify_client import verify_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/sso", tags=["sso"])

# In-memory state store: {state: {nonce, expires}}
# Sufficient for single-instance POC.
_pending_states: dict[str, dict] = {}
STATE_TTL_SECONDS = 300  # 5 minutes


def _build_redirect_uri(request: Request) -> str:
    """Callback URL must match the redirect URI registered in IBM Verify."""
    return f"{settings.fido2_rp_origin}/callback"


@router.get("/login")
async def sso_login(request: Request):
    """
    Generate OIDC authorization URL and 302-redirect to IBM Verify.
    State and nonce are cryptographically random (secrets.token_urlsafe).
    """
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    _pending_states[state] = {"nonce": nonce, "expires": time.time() + STATE_TTL_SECONDS}

    redirect_uri = _build_redirect_uri(request)
    auth_url = (
        f"{settings.verify_tenant_url}/oidc/endpoint/default/authorize"
        f"?response_type=code"
        f"&client_id={settings.verify_client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&scope=openid+profile+email"
        f"&state={state}"
        f"&nonce={nonce}"
    )
    return RedirectResponse(url=auth_url, status_code=302)


class CallbackRequest(BaseModel):
    code: str
    state: str


@router.post("/callback")
async def sso_callback(
    req: CallbackRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle OIDC callback POSTed by the frontend (which extracts code+state from URL).

    Steps:
      1. Validate state (CSRF protection)
      2. Exchange code for tokens with IBM Verify
      3. Validate ID token signature (RS256 via JWKS), iss, aud, exp, nonce
      4. Upsert user + seed banking data for first-time SSO users
      5. Issue local JWT session
    """
    # 1. Validate state
    pending = _pending_states.pop(req.state, None)
    if not pending:
        raise HTTPException(status_code=400, detail="Invalid state parameter")
    if time.time() > pending["expires"]:
        raise HTTPException(status_code=400, detail="State expired — please try again")
    expected_nonce = pending["nonce"]

    redirect_uri = _build_redirect_uri(request)

    # 2. Exchange code for tokens
    try:
        token_response = await verify_client.oidc_token_exchange(
            code=req.code,
            redirect_uri=redirect_uri,
        )
    except Exception:
        logger.error("OIDC token exchange failed")
        raise HTTPException(status_code=502, detail="SSO token exchange failed")

    id_token = token_response.get("id_token")
    if not id_token:
        raise HTTPException(status_code=502, detail="No ID token in response")

    # 3. Validate ID token signature, claims, and nonce
    try:
        jwks = await verify_client.get_oidc_jwks()
        claims = jose_jwt.decode(
            id_token,
            jwks,
            algorithms=["RS256"],
            audience=settings.verify_client_id,
            issuer=settings.verify_oidc_issuer,
        )
    except JWTError:
        logger.error("ID token validation failed")
        raise HTTPException(status_code=401, detail="ID token validation failed")

    if claims.get("nonce") != expected_nonce:
        raise HTTPException(status_code=401, detail="Nonce mismatch — possible replay attack")

    verify_user_id: str = claims["sub"]
    email: str = claims.get("email", f"{verify_user_id}@mockbank.local")
    name: str = claims.get("name") or claims.get("given_name") or "SSO User"

    # 4. Upsert user
    db_result = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
    user = db_result.scalar_one_or_none()
    if not user:
        from app.seed import seed_user_data

        user = User(verify_user_id=verify_user_id, email=email, name=name)
        db.add(user)
        await db.flush()
        await seed_user_data(db, user.id, verify_user_id)
        await db.commit()

    # 5. Issue local JWT
    token = create_session_token(user.verify_user_id, user.email, user.name)
    return {"token": token, "user": {"name": user.name, "email": user.email}}
