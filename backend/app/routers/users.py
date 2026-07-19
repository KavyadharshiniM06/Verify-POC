import httpx

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Literal

from app.auth.jwt_handler import get_current_user, require_stepup
from app.config import settings
from app.database import get_db
from app.models import User
from app.services.verify_client import verify_client

router = APIRouter(prefix="/users", tags=["users"])

ALLOWED_FACTOR_TYPES = {"fido2", "totp", "push", "email_otp"}
ALLOWED_ROLES = {"Admin", "Manager", "Customer"}


# ── Self-service: current user ────────────────────────────────────────────────

class SelfUpdateRequest(BaseModel):
    name: str | None = None
    email: EmailStr | None = None


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
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
            "email_otp": True,
            "sso": True,
        },
    }


@router.put("/me")
async def update_me(
    req: SelfUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Allow the authenticated user to update their own name and/or email."""
    if not req.name and not req.email:
        raise HTTPException(status_code=400, detail="At least one of name or email must be provided")

    new_name = req.name or current_user.name
    new_email = str(req.email) if req.email else current_user.email

    await verify_client.update_user(
        current_user.verify_user_id, new_email, new_name, current_user.role
    )

    current_user.name = new_name
    current_user.email = new_email
    await db.commit()

    return {
        "id": current_user.verify_user_id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "is_active": current_user.is_active,
    }


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete the current user's account from IBM Verify and the local DB."""
    await verify_client.delete_user(current_user.verify_user_id)
    await db.execute(delete(User).where(User.verify_user_id == current_user.verify_user_id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Admin: list users (paginated + searchable) ────────────────────────────────

@router.get("")
async def list_users(
    search: str = "",
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
):
    """
    Return a paginated list of IBM Verify users.
    Optional ?search= filters by name or email.
    Requires Admin role.
    """
    _require_admin(current_user)

    start_index = (page - 1) * page_size + 1
    result = await verify_client.list_users(search=search, start_index=start_index, count=page_size)
    resources = result.get("Resources", [])

    return {
        "total": result.get("totalResults", 0),
        "page": page,
        "page_size": page_size,
        "users": [
            {
                "id": user.get("id", ""),
                "email": next(
                    (
                        email.get("value", "")
                        for email in user.get("emails", [])
                        if email.get("value")
                    ),
                    user.get("userName", ""),
                ),
                "name": user.get("name", {}).get("formatted") or user.get("userName", ""),
                "role": "Admin" if current_user.verify_user_id == user.get("id") and current_user.role == "Admin" else "Customer",
                "is_active": user.get("active", True),
            }
            for user in resources
        ],
    }


# ── Admin: create user ────────────────────────────────────────────────────────

class ManagedUserRequest(BaseModel):
    email: EmailStr
    name: str
    role: str


class ManagedUserUpdateRequest(ManagedUserRequest):
    is_active: bool = True


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_managed_user(
    req: ManagedUserRequest,
    current_user: User = Depends(get_current_user),
    _stepup: dict = Depends(require_stepup),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    if req.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {ALLOWED_ROLES}")

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


# ── Admin: update user ────────────────────────────────────────────────────────

@router.put("/{verify_user_id}")
async def update_managed_user(
    verify_user_id: str,
    req: ManagedUserUpdateRequest,
    current_user: User = Depends(get_current_user),
    _stepup: dict = Depends(require_stepup),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    if req.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {ALLOWED_ROLES}")

    try:
        await verify_client.update_user(verify_user_id, req.email, req.name, req.role)
        await verify_client.set_user_active(verify_user_id, req.is_active)
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500] if exc.response is not None else "IBM Verify update failed"
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc

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


# ── Admin: enable user ────────────────────────────────────────────────────────

@router.post("/{verify_user_id}/enable")
async def enable_managed_user(
    verify_user_id: str,
    current_user: User = Depends(get_current_user),
    _stepup: dict = Depends(require_stepup),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)

    await verify_client.set_user_active(verify_user_id, True)
    result = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = True
    await db.commit()
    return {"id": verify_user_id, "is_active": True}


# ── Admin: disable user ───────────────────────────────────────────────────────

@router.post("/{verify_user_id}/disable")
async def disable_managed_user(
    verify_user_id: str,
    current_user: User = Depends(get_current_user),
    _stepup: dict = Depends(require_stepup),
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


# ── Admin: delete user ────────────────────────────────────────────────────────

@router.delete("/{verify_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_managed_user(
    verify_user_id: str,
    current_user: User = Depends(get_current_user),
    _stepup: dict = Depends(require_stepup),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)

    await verify_client.delete_user(verify_user_id)
    await db.execute(delete(User).where(User.verify_user_id == verify_user_id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Admin + self-service: unenroll a specific MFA factor ─────────────────────

@router.delete("/{verify_user_id}/factors/{factor_type}", status_code=status.HTTP_204_NO_CONTENT)
async def unenroll_factor(
    verify_user_id: str,
    factor_type: str,
    current_user: User = Depends(get_current_user),
    _stepup: dict = Depends(require_stepup),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove all registrations of a given factor type from IBM Verify for a user.
    Admins may unenroll any user's factor.
    Regular users may only unenroll their own factors (self-service).
    """
    if factor_type not in ALLOWED_FACTOR_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"factor_type must be one of: {sorted(ALLOWED_FACTOR_TYPES)}",
        )

    # Authorisation: admin can target anyone; regular users only themselves
    if current_user.role != "Admin" and verify_user_id != current_user.verify_user_id:
        raise HTTPException(status_code=403, detail="Cannot unenroll another user's factor")

    await verify_client.unenroll_factor(verify_user_id, factor_type)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_admin(current_user: User) -> None:
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin role required")


def _stepup_required_response() -> HTTPException:
    return HTTPException(
        status_code=403,
        detail={
            "code": "STEP_UP_REQUIRED",
            "step_up_reason": "ADMIN_OPERATION",
            "message": "Admin operations require a fresh MFA verification.",
        },
    )
