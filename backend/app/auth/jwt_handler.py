from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

bearer_scheme = HTTPBearer()


def create_session_token(
    verify_user_id: str,
    email: str,
    name: str,
    role: str,
    *,
    stepup_verified: bool = False,
) -> str:
    """
    Issue a signed session JWT.

    Fields
    ------
    authenticated  — always True (a token only exists after successful login).
    stepup_verified — True when the user has completed a step-up MFA challenge
                      within the current stepup_duration_minutes window.
    stepup_time    — UTC ISO-8601 timestamp of when step-up was completed,
                     or None if no step-up has occurred.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    stepup_time: str | None = None
    if stepup_verified:
        stepup_time = now.isoformat()

    payload = {
        "sub": verify_user_id,
        "email": email,
        "name": name,
        "role": role,
        "authenticated": True,
        "stepup_verified": stepup_verified,
        "stepup_time": stepup_time,
        "exp": expire,
        "iat": now,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_session_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    from app.models import User  # local import avoids circular dependency at module load

    payload = decode_session_token(credentials.credentials)
    verify_user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _is_stepup_valid(payload: dict) -> bool:
    """
    Return True when the JWT carries a step-up that is still within the
    configurable STEPUP_DURATION_MINUTES window.
    """
    if not payload.get("stepup_verified"):
        return False
    stepup_time_str: str | None = payload.get("stepup_time")
    if not stepup_time_str:
        return False
    try:
        stepup_time = datetime.fromisoformat(stepup_time_str)
        # Ensure timezone-aware comparison
        if stepup_time.tzinfo is None:
            stepup_time = stepup_time.replace(tzinfo=timezone.utc)
        window = timedelta(minutes=settings.stepup_duration_minutes)
        return datetime.now(timezone.utc) - stepup_time <= window
    except (ValueError, TypeError):
        return False


def require_stepup(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """
    FastAPI dependency that requires a valid, unexpired step-up in the JWT.
    Returns the decoded payload on success.
    Raises HTTP 403 with a machine-readable ``STEP_UP_REQUIRED`` code so the
    frontend knows to initiate the step-up flow rather than show a generic error.
    """
    payload = decode_session_token(credentials.credentials)
    if not _is_stepup_valid(payload):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "STEP_UP_REQUIRED",
                "message": "This action requires a fresh MFA verification.",
            },
        )
    return payload


# ── Step-up short-lived token ─────────────────────────────────────────────────

def create_stepup_token(verify_user_id: str, return_to: str = "/transfers") -> str:
    """Short-lived token encoding the user id and where to redirect after step-up."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {
        "sub": verify_user_id,
        "purpose": "stepup",
        "return_to": return_to,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_stepup_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        if payload.get("purpose") != "stepup":
            raise HTTPException(status_code=400, detail="Invalid step-up token")
        return payload
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired step-up token")
