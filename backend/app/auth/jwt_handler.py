from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db

STEPUP_TOKEN_EXPIRE_MINUTES = 10  # short-lived step-up token

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

bearer_scheme = HTTPBearer()


def create_session_token(
    verify_user_id: str,
    email: str,
    name: str,
    role: str,
    mfa_verified: bool = False,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": verify_user_id,
        "email": email,
        "name": name,
        "role": role,
        "mfa_verified": mfa_verified,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
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


def require_mfa(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """
    Dependency that ensures the current JWT was issued after a successful MFA challenge.
    Returns the decoded payload on success.
    Raises 403 with a machine-readable code so the frontend can trigger step-up auth.
    """
    payload = decode_session_token(credentials.credentials)
    if not payload.get("mfa_verified"):
        raise HTTPException(
            status_code=403,
            detail={"code": "MFA_REQUIRED", "message": "This action requires MFA verification."},
        )
    return payload


def create_stepup_token(verify_user_id: str, return_to: str = "/transfers") -> str:
    """Short-lived token encoding the user id and where to redirect after step-up."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=STEPUP_TOKEN_EXPIRE_MINUTES)
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
