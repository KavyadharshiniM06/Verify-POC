from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_user
from app.database import get_db
from app.models import User
from app.services.verify_client import verify_client

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
async def get_me(
    current_user: User = Depends(get_current_user),
):
    """
    Return current user profile plus live enrollment status from IBM Verify.
    Email OTP is always available (no pre-enrollment needed) so it is always True.
    SSO is True if the user has a session (they logged in via OIDC).
    """
    try:
        factors = await verify_client.get_enrolled_factors(current_user.verify_user_id)
    except Exception:
        factors = {"fido2": False, "totp": False, "push": False}

    return {
        "id": current_user.verify_user_id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "enrolled_factors": {
            "fido2": factors["fido2"],
            "totp": factors["totp"],
            "push": factors["push"],
            "email_otp": True,   # always available — no pre-enrollment required
            "sso": True,         # user has a valid session so SSO is linked
        },
    }


class ManagedUserRequest(BaseModel):
    email: EmailStr
    name: str
    role: str


class ManagedUserUpdateRequest(ManagedUserRequest):
    is_active: bool = True


def _require_admin(current_user: User) -> None:
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin role required")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_managed_user(
    req: ManagedUserRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)

    verify_user = await verify_client.create_user(req.email, req.name, req.role)
    verify_user_id = verify_user["id"]

    user = User(
        verify_user_id=verify_user_id,
        email=req.email,
        name=req.name,
        role=req.role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return {
        "id": user.verify_user_id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "is_active": user.is_active,
    }


@router.put("/{verify_user_id}")
async def update_managed_user(
    verify_user_id: str,
    req: ManagedUserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)

    await verify_client.update_user(verify_user_id, req.email, req.name, req.role)
    await verify_client.set_user_active(verify_user_id, req.is_active)

    result = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.email = req.email
    user.name = req.name
    user.role = req.role
    user.is_active = req.is_active
    await db.commit()

    return {
        "id": user.verify_user_id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "is_active": user.is_active,
    }


@router.post("/{verify_user_id}/disable")
async def disable_managed_user(
    verify_user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)

    await verify_client.set_user_active(verify_user_id, False)
    result = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = False
    await db.commit()
    return {"id": verify_user_id, "is_active": False}


@router.delete("/{verify_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_managed_user(
    verify_user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)

    await verify_client.delete_user(verify_user_id)
    await db.execute(delete(User).where(User.verify_user_id == verify_user_id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
