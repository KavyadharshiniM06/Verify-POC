from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_user
from app.database import get_db
from app.models import AuditLog, LifecycleAction, User
from app.services.verify_client import verify_client

router = APIRouter(prefix="/users", tags=["users"])

VALID_ROLES = {"Customer", "Manager", "Admin"}


def _require_admin(current_user: User) -> None:
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin role required")


async def _log(
    db: AsyncSession,
    *,
    target_verify_user_id: str,
    target_email: str,
    action: LifecycleAction,
    actor: User,
    details: str = "",
) -> None:
    db.add(
        AuditLog(
            target_verify_user_id=target_verify_user_id,
            target_email=target_email,
            action=action,
            actor_verify_user_id=actor.verify_user_id,
            actor_name=actor.name,
            details=details,
        )
    )
    # caller commits alongside the rest of the transaction


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """
    Return current user profile plus live enrollment status from IBM Verify.
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


# ── Joiner / Mover / Leaver — admin directory ──────────────────────────────

class ManagedUserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    is_active: bool
    created_at: Optional[datetime] = None
    offboarded_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ManagedUserListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    users: list[ManagedUserOut]


@router.get("", response_model=ManagedUserListResponse)
async def list_managed_users(
    search: str = "",
    page: int = 1,
    page_size: int = 20,
    status_filter: Optional[str] = None,  # "active" | "offboarded" | None (all)
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List IBM Verify identities for admin user management."""
    _require_admin(current_user)

    result = await verify_client.list_users(
        search=search,
        start_index=(page - 1) * page_size + 1,
        count=page_size,
    )
    resources = result.get("Resources", [])

    # Build a lookup of local DB records keyed by verify_user_id so we can
    # return the actual stored role, created_at, and offboarded_at.
    verify_ids = [item.get("id") for item in resources if item.get("id")]
    db_result = await db.execute(select(User).where(User.verify_user_id.in_(verify_ids)))
    db_users: dict[str, User] = {u.verify_user_id: u for u in db_result.scalars().all()}

    users = [
        ManagedUserOut(
            id=item.get("id", ""),
            email=next(
                (email.get("value", "") for email in item.get("emails", []) if email.get("value")),
                item.get("userName", ""),
            ),
            name=item.get("name", {}).get("formatted") or item.get("userName", ""),
            role=db_users[item["id"]].role if item.get("id") in db_users else "Customer",
            is_active=item.get("active", True),
            created_at=db_users[item["id"]].created_at if item.get("id") in db_users else None,
            offboarded_at=db_users[item["id"]].offboarded_at if item.get("id") in db_users else None,
        )
        for item in resources
    ]

    if status_filter == "active":
        users = [user for user in users if user.is_active]
    elif status_filter == "offboarded":
        users = [user for user in users if not user.is_active]

    return ManagedUserListResponse(
        total=result.get("totalResults", len(users)),
        page=page,
        page_size=page_size,
        users=users,
    )


@router.get("/{verify_user_id}/audit")
async def get_user_audit_trail(
    verify_user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full JML history for a single identity."""
    _require_admin(current_user)
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.target_verify_user_id == verify_user_id)
        .order_by(AuditLog.created_at.desc())
    )
    entries = result.scalars().all()
    return [
        {
            "action": e.action,
            "actor_name": e.actor_name,
            "details": e.details,
            "created_at": e.created_at,
        }
        for e in entries
    ]


class ManagedUserRequest(BaseModel):
    email: EmailStr
    name: str
    role: str


class ManagedUserUpdateRequest(ManagedUserRequest):
    is_active: bool = True


def _validate_role(role: str) -> None:
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of {sorted(VALID_ROLES)}")


# ── Joiner ──────────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_managed_user(
    req: ManagedUserRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Onboard a new identity: create in IBM Verify, mirror locally, seed banking data."""
    _require_admin(current_user)
    _validate_role(req.role)

    verify_user = await verify_client.create_user(req.email, req.name, req.role)
    verify_user_id = verify_user["id"]

    # Sync the role into IBM Verify group membership so it flows into OIDC tokens
    await verify_client.sync_user_role_group(verify_user_id, req.role)

    user = User(
        verify_user_id=verify_user_id,
        email=req.email,
        name=req.name,
        role=req.role,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    from app.seed import seed_user_data
    await seed_user_data(db, user.id, verify_user_id)

    await _log(
        db,
        target_verify_user_id=verify_user_id,
        target_email=req.email,
        action=LifecycleAction.joiner,
        actor=current_user,
        details=f"Onboarded with role {req.role}",
    )
    await db.commit()
    await db.refresh(user)

    return {
        "id": user.verify_user_id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "is_active": user.is_active,
    }


# ── Mover ───────────────────────────────────────────────────────────────────

@router.put("/{verify_user_id}")
async def update_managed_user(
    verify_user_id: str,
    req: ManagedUserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update role/email/name/status — the 'Mover' event (e.g. promotion, transfer, dept change)."""
    _require_admin(current_user)
    _validate_role(req.role)

    result = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
    user = result.scalar_one_or_none()

    if not user:
        verify_user = await verify_client.get_user_by_id(verify_user_id)
        user = User(
            verify_user_id=verify_user_id,
            email=next(
                (
                    email.get("value", "")
                    for email in verify_user.get("emails", [])
                    if email.get("value")
                ),
                verify_user.get("userName", ""),
            ),
            name=verify_user.get("name", {}).get("formatted") or verify_user.get("userName", ""),
            role="Customer",
            is_active=verify_user.get("active", True),
        )
        db.add(user)
        await db.flush()

    old_role = user.role
    role_changed = user.role != req.role

    try:
        await verify_client.update_user(verify_user_id, req.email, req.name, req.role)
        await verify_client.set_user_active(verify_user_id, req.is_active)
        # Sync role → IBM Verify group so OIDC token claims stay correct
        if role_changed:
            await verify_client.sync_user_role_group(verify_user_id, req.role, old_role)
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500] if exc.response is not None else "IBM Verify update failed"
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc

    user.email = req.email
    user.name = req.name
    user.role = req.role
    user.is_active = req.is_active
    user.offboarded_at = None if req.is_active else (user.offboarded_at or datetime.utcnow())

    # Mover event = role/department change only. Name/email/status changes are
    # routine profile updates and do not constitute a lifecycle Mover event.
    if role_changed:
        await _log(
            db,
            target_verify_user_id=verify_user_id,
            target_email=req.email,
            action=LifecycleAction.mover,
            actor=current_user,
            details=f"role {old_role} → {req.role}",
        )
    await db.commit()

    return {
        "id": user.verify_user_id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "is_active": user.is_active,
    }


# ── Leaver (soft: disable) ───────────────────────────────────────────────────

@router.post("/{verify_user_id}/disable")
async def disable_managed_user(
    verify_user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Suspend access without deleting the identity — reversible via /reinstate."""
    _require_admin(current_user)

    await verify_client.set_user_active(verify_user_id, False)
    result = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = False
    user.offboarded_at = datetime.utcnow()

    await _log(
        db,
        target_verify_user_id=verify_user_id,
        target_email=user.email,
        action=LifecycleAction.leaver_disable,
        actor=current_user,
        details="Access suspended",
    )
    await db.commit()
    return {"id": verify_user_id, "is_active": False}


# ── Leaver reversal (Mover back into the org) ───────────────────────────────

@router.post("/{verify_user_id}/reinstate")
async def reinstate_managed_user(
    verify_user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-enable a previously disabled identity — e.g. returning from leave, rehire."""
    _require_admin(current_user)

    await verify_client.set_user_active(verify_user_id, True)
    result = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = True
    user.offboarded_at = None

    await _log(
        db,
        target_verify_user_id=verify_user_id,
        target_email=user.email,
        action=LifecycleAction.leaver_reinstate,
        actor=current_user,
        details="Access reinstated",
    )
    await db.commit()
    return {"id": verify_user_id, "is_active": True}


# ── Password reset ───────────────────────────────────────────────────────────

@router.post("/{verify_user_id}/reset-password")
async def reset_user_password(
    verify_user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Force a password reset for a Cloud Directory user.
    Returns the temporary password the admin must share with the user.
    The user will be required to change it on their next login.
    Federated users are rejected — their password is managed by their IdP.
    """
    _require_admin(current_user)

    result = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        tmp_pwd = await verify_client.reset_password(verify_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500] if exc.response is not None else "IBM Verify reset failed"
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc

    return {"temporary_password": tmp_pwd}


# ── Leaver (hard: delete) ────────────────────────────────────────────────────

@router.delete("/{verify_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_managed_user(
    verify_user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently remove the identity from IBM Verify and local records."""
    _require_admin(current_user)

    result = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await verify_client.delete_user(verify_user_id)

    await _log(
        db,
        target_verify_user_id=verify_user_id,
        target_email=user.email,
        action=LifecycleAction.leaver_delete,
        actor=current_user,
        details="Identity permanently deleted",
    )
    await db.execute(delete(User).where(User.verify_user_id == verify_user_id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)