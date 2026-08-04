import logging
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import _is_stepup_valid, decode_session_token, get_current_user
from app.database import get_db
from app.models import AuditLog, LifecycleAction, User
from app.config import settings
from app.services.verify_client import verify_client

logger = logging.getLogger(__name__)

router  = APIRouter(prefix="/users", tags=["users"])
_bearer = HTTPBearer()

# Three user types for the CIAM admin portal:
#   Manager           — general workforce user, no Salesforce access
#   SalesforceManager — Salesforce-entitled user, sees Salesforce in launchpad
#   Admin             — overall administrator, manages all identities in the portal
VALID_ROLES = {
    "Manager",
    "SalesforceManager",
    "Admin",
}

# Roles that grant Salesforce entitlement via IBM Verify group membership
SALESFORCE_ROLES = {"SalesforceManager"}


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

    enrolled_factors shape:
      Each factor key (fido2, totp, push) is either:
        - False  — not enrolled
        - list[{id, name, created_at}]  — one entry per registered device
      email_otp and sso are always True (cannot be removed).
    """
    try:
        factors = await verify_client.get_enrolled_factors(current_user.verify_user_id)
    except Exception as exc:
        logger.warning("get_enrolled_factors failed for %s: %s", current_user.verify_user_id, exc)
        factors = {"fido2": False, "totp": False, "push": False, "email_otp": False}

    # Fetch phone and last_login from IBM Verify SCIM record
    phone: Optional[str] = None
    last_login: Optional[str] = None
    try:
        ibv_user = await verify_client.get_user_by_id(current_user.verify_user_id)
        phones = ibv_user.get("phoneNumbers", [])
        if phones:
            phone = phones[0].get("value")
        ext = ibv_user.get("urn:ietf:params:scim:schemas:extension:ibm:2.0:User", {})
        last_login = ext.get("lastLogin")
    except Exception:
        pass

    return {
        "id": current_user.verify_user_id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "phone": phone,
        "last_login": last_login,
        "enrolled_factors": {
            "fido2": factors["fido2"],
            "totp": factors["totp"],
            "push": factors["push"],
            "email_otp": factors["email_otp"],
            "sso": True,
        },
    }


# ── Current user's own IBM Verify auth activity ─────────────────────────────

@router.get("/me/activity")
async def get_my_activity(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
):
    """
    Return recent authentication events from IBM Verify for the current user.
    Used by the Engage tab to show authentication history and security status.
    Falls back to empty list gracefully.
    """
    try:
        events = await verify_client.get_user_activity(current_user.verify_user_id, limit=limit)
        return {"events": events, "source": "ibm_verify"}
    except Exception as exc:
        logger.warning("get_my_activity failed for %s: %s", current_user.verify_user_id, exc)
        return {"events": [], "source": "ibm_verify", "error": "Activity log unavailable"}


class SelfUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None


@router.put("/me")
async def update_me(
    req: SelfUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Self-service: update own name and/or email.
    Syncs the change to IBM Verify then updates the local DB record.
    """
    new_name = req.name or current_user.name
    new_email = req.email or current_user.email

    # Only call IBM Verify if something actually changed
    if new_name != current_user.name or new_email != current_user.email:
        try:
            await verify_client.update_user(
                current_user.verify_user_id, new_email, new_name, current_user.role
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"IBM Verify update failed: {exc}") from exc

    # Update phone in IBM Verify if provided
    if req.phone is not None:
        try:
            await verify_client.update_user_phone(current_user.verify_user_id, req.phone)
        except Exception as exc:
            logger.warning("Phone update in IBM Verify failed for %s: %s", current_user.verify_user_id, exc)

    current_user.name = new_name
    current_user.email = new_email
    await db.commit()
    await db.refresh(current_user)

    return {
        "id": current_user.verify_user_id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
    }


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Self-service: permanently delete own account from IBM Verify and local DB.
    Requires a valid step-up token (enforced on the frontend via /stepup).
    """
    verify_user_id = current_user.verify_user_id

    await verify_client.delete_user(verify_user_id)

    await db.execute(delete(User).where(User.verify_user_id == verify_user_id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


_UNENROLLABLE_FACTORS = {"fido2", "totp", "push"}


@router.delete("/me/factors/{factor_type}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_factor(
    factor_type: str,
    current_user: User = Depends(get_current_user),
):
    """
    Self-service: unenroll an MFA factor from IBM Verify.

    Allowed factor_type values: fido2, totp, push.
    Email OTP is always available and cannot be removed.
    A user can only remove their own factors (no IDOR risk).
    Step-up enforcement is handled on the frontend before calling this endpoint.
    """
    if factor_type not in _UNENROLLABLE_FACTORS:
        raise HTTPException(
            status_code=400,
            detail=f"factor_type must be one of {sorted(_UNENROLLABLE_FACTORS)}",
        )
    await verify_client.unenroll_factor(current_user.verify_user_id, factor_type)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Joiner / Mover / Leaver — admin directory ──────────────────────────────

class ManagedUserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    is_active: bool
    created_at: Optional[datetime] = None
    offboarded_at: Optional[datetime] = None
    last_login: Optional[str] = None       # ISO-8601 from IBM Verify SCIM lastLogin
    mfa_enrolled: Optional[bool] = None    # True if twoFactorAuthentication is set
    last_mfa_type: Optional[str] = None    # e.g. "emailotp", "totp", "fido2"

    model_config = {"from_attributes": True}


class ManagedUserListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    users: list[ManagedUserOut]


def _extract_ibm_ext(item: dict) -> dict:
    """Extract the IBM Verify SCIM extension block, tolerating missing key."""
    return item.get("urn:ietf:params:scim:schemas:extension:ibm:2.0:User", {})


def _get_primary_email(item: dict) -> str:
    """Return the primary email from a SCIM user resource, falling back to userName."""
    return next(
        (e.get("value", "") for e in item.get("emails", []) if e.get("value")),
        item.get("userName", ""),
    )


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

    # Build the set of emails to hide (tenant-owner / provisioning accounts).
    _hidden = {e.strip().lower() for e in settings.hidden_emails.split(",") if e.strip()}

    result = await verify_client.list_users(
        search=search,
        start_index=(page - 1) * page_size + 1,
        count=page_size,
    )
    resources = result.get("Resources", [])

    # Strip hidden accounts before any further processing.
    if _hidden:
        resources = [
            item for item in resources
            if _get_primary_email(item).lower() not in _hidden
        ]

    # Build a lookup of local DB records keyed by verify_user_id so we can
    # return the actual stored role, created_at, and offboarded_at.
    verify_ids = [item.get("id") for item in resources if item.get("id")]
    db_result = await db.execute(select(User).where(User.verify_user_id.in_(verify_ids)))
    db_users: dict[str, User] = {u.verify_user_id: u for u in db_result.scalars().all()}

    users = []
    for item in resources:
        ext = _extract_ibm_ext(item)
        # lastMFA is a list of {type, value} dicts; pick the most recent one
        last_mfa_list: list[dict] = ext.get("lastMFA", [])
        # Filter out internal keys (values with '/' are hashed method IDs, not type names)
        clean_mfa = [m for m in last_mfa_list if "/" not in m.get("type", "")]
        last_mfa_type = clean_mfa[0].get("type") if clean_mfa else None

        users.append(ManagedUserOut(
            id=item.get("id", ""),
            email=next(
                (email.get("value", "") for email in item.get("emails", []) if email.get("value")),
                item.get("userName", ""),
            ),
            name=item.get("name", {}).get("formatted") or item.get("userName", ""),
            role=db_users[item["id"]].role if item.get("id") in db_users else "Manager",
            is_active=item.get("active", True),
            created_at=db_users[item["id"]].created_at if item.get("id") in db_users else None,
            offboarded_at=db_users[item["id"]].offboarded_at if item.get("id") in db_users else None,
            last_login=ext.get("lastLogin"),
            mfa_enrolled=bool(ext.get("twoFactorAuthentication", False)) or bool(clean_mfa),
            last_mfa_type=last_mfa_type,
        ))

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
    # Joiner-only fields — used when creating a new user
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None   # preferred username sent verbatim to IBM Verify — no domain added


class ManagedUserUpdateRequest(BaseModel):
    email: EmailStr
    name: str
    role: str
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

    email_str = str(req.email)

    # ── Step 1: Clean up any stale local row from a previous failed attempt ──
    existing_by_email = (
        await db.execute(select(User).where(User.email == email_str))
    ).scalar_one_or_none()
    if existing_by_email:
        ibv_still_exists = False
        try:
            await verify_client.get_user_by_id(existing_by_email.verify_user_id)
            ibv_still_exists = True
        except Exception:
            pass  # 404 → IBM Verify account is gone; row is stale
        if ibv_still_exists:
            raise HTTPException(
                status_code=409,
                detail=f"A user with email {email_str} already exists.",
            )
        logger.warning(
            "create_managed_user: removing stale local DB row for %s (IBM Verify account gone)",
            email_str,
        )
        await db.delete(existing_by_email)
        await db.flush()

    # ── Step 2: Create in IBM Verify — reclaim if account already exists ─────
    # IBM Verify may still hold the account under the same userName when a
    # previous rollback DELETE was delayed or partially indexed (CSIAI0047E 409).
    # In that case, look up the existing account by email and reuse its id
    # instead of failing — the account is effectively orphaned and re-claimable.
    try:
        verify_user = await verify_client.create_user(
            email_str, req.name, req.role,
            first_name=req.first_name,
            last_name=req.last_name,
            username=req.username,
        )
    except httpx.HTTPStatusError as exc:
        if exc.response is not None and exc.response.status_code == 409:
            # IBM Verify still has the account (stale after a failed rollback).
            # Find it by email and reclaim it rather than blocking the admin.
            logger.warning(
                "create_managed_user: IBM Verify 409 for %s — reclaiming existing account",
                email_str,
            )
            existing_ibv = await verify_client.find_user_by_email(email_str)
            if not existing_ibv:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"A user with email {email_str} already exists in IBM Verify "
                        f"but could not be located. Please delete the account manually "
                        f"in the IBM Verify admin console and retry."
                    ),
                ) from exc
            verify_user = existing_ibv
        else:
            raise HTTPException(
                status_code=exc.response.status_code if exc.response is not None else 502,
                detail=exc.response.text[:500] if exc.response is not None else str(exc),
            ) from exc

    verify_user_id = verify_user["id"]

    # Sync the role into IBM Verify group membership so it flows into OIDC tokens.
    # Raise on failure so the admin sees the error rather than a silent no-op.
    try:
        await verify_client.sync_user_role_group(verify_user_id, req.role)
    except Exception as exc:
        # The IBM Verify user was created — delete it to avoid a half-provisioned
        # orphan, then surface the error clearly.
        logger.error(
            "create_managed_user: group sync failed for %s (role=%s), rolling back: %s",
            verify_user_id, req.role, exc,
        )
        try:
            await verify_client.delete_user(verify_user_id)
        except Exception as del_exc:
            logger.error("create_managed_user: rollback delete also failed for %s: %s", verify_user_id, del_exc)
        raise HTTPException(
            status_code=502,
            detail=(
                f"User was created in IBM Verify but could not be added to the '{req.role}' group. "
                f"The account has been rolled back. Please ensure the group exists in IBM Verify "
                f"and that the API client has 'manageUserStandardGroups' scope, then retry. "
                f"Error: {exc}"
            ),
        ) from exc

    user = User(
        verify_user_id=verify_user_id,
        email=email_str,
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
        target_email=email_str,
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
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update role/email/name/status — the 'Mover' event (e.g. promotion, transfer, dept change).

    Security gate
    ─────────────
    Any role change (Mover) by an Admin requires a valid IBM Verify 2FA step-up in the JWT.
    This ensures every identity lifecycle change has a verified admin action behind it.
    """
    _require_admin(current_user)
    _validate_role(req.role)

    # ── 2FA gate: every Mover (role change) requires a fresh step-up ─────────
    # This ensures no identity lifecycle event can be performed without MFA.
    # Profile-only edits (same role) are allowed without step-up.
    # We peek at the existing role to decide: if the role will change, enforce.
    existing_check = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
    existing_user  = existing_check.scalar_one_or_none()
    will_change_role = (existing_user is None) or (existing_user.role != req.role)

    if will_change_role:
        payload = decode_session_token(credentials.credentials)
        if not _is_stepup_valid(payload):
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "STEP_UP_REQUIRED",
                    "step_up_reason": "MOVER_ROLE_CHANGE",
                    "message": (
                        "Changing a user's role (Mover event) requires a fresh "
                        "IBM Verify MFA verification. Please complete 2FA and retry."
                    ),
                },
            )

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
            role=req.role,
            is_active=verify_user.get("active", True),
        )
        db.add(user)
        await db.flush()

    old_role = user.role
    role_changed = user.role != req.role

    try:
        await verify_client.update_user(verify_user_id, req.email, req.name, req.role)
        await verify_client.set_user_active(verify_user_id, req.is_active)
        # Sync role → IBM Verify group so OIDC token claims stay correct.
        # Pass old_role only when it actually changed so the old group is removed.
        if role_changed:
            await verify_client.sync_user_role_group(verify_user_id, req.role, old_role)
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500] if exc.response is not None else "IBM Verify update failed"
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Re-fetch the confirmed email from IBM Verify after the update so the local
    # DB always holds exactly what IBM Verify has — never the stale request value.
    confirmed_email = await verify_client.get_live_email(verify_user_id, fallback=req.email)

    user.email = confirmed_email
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
            target_email=confirmed_email,
            action=LifecycleAction.mover,
            actor=current_user,
            details=f"role {old_role} → {req.role}",
        )
    await db.commit()

    return {
        "id": user.verify_user_id,
        "email": confirmed_email,
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
    """Suspend access without deleting the identity — reversible via /reinstate.

    Also removes the user from their role group in IBM Verify so that
    linked application provisioning (e.g. Salesforce) picks up the
    suspension and marks the account as Suspended rather than Active.
    """
    _require_admin(current_user)

    result = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Disable the IBM Verify account first
    await verify_client.set_user_active(verify_user_id, False)

    # Remove from role group — this triggers IBM Verify provisioning to
    # suspend the linked Salesforce (or other app) account.
    try:
        group_id = await verify_client._resolve_group_id(user.role)
        if group_id:
            await verify_client._remove_user_from_group(verify_user_id, group_id, user.role)
    except Exception as exc:
        logger.warning(
            "disable_managed_user: could not remove %s from group '%s': %s",
            verify_user_id, user.role, exc,
        )

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
    """Re-enable a previously disabled identity — e.g. returning from leave, rehire.

    Re-adds the user to their role group in IBM Verify so that linked
    application provisioning (e.g. Salesforce) restores the account
    from Suspended back to Active.
    """
    _require_admin(current_user)

    result = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Re-enable the IBM Verify account
    await verify_client.set_user_active(verify_user_id, True)

    # Re-add to role group — this triggers IBM Verify provisioning to
    # restore the linked Salesforce (or other app) account from Suspended.
    try:
        await verify_client.sync_user_role_group(verify_user_id, user.role)
    except Exception as exc:
        logger.warning(
            "reinstate_managed_user: could not re-add %s to group '%s': %s",
            verify_user_id, user.role, exc,
        )

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


# ── MFA reset (admin) ────────────────────────────────────────────────────────

_ALL_FACTORS = {"fido2", "totp", "push", "email_otp"}


@router.delete("/{verify_user_id}/factors", status_code=status.HTTP_204_NO_CONTENT)
async def reset_user_mfa(
    verify_user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin: remove every enrolled MFA factor (FIDO2, TOTP, push, email OTP) for a
    user so they are forced to re-enrol on their next login.
    """
    _require_admin(current_user)

    result = await db.execute(select(User).where(User.verify_user_id == verify_user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    errors = []
    for factor in _ALL_FACTORS:
        try:
            await verify_client.unenroll_factor(verify_user_id, factor)
        except Exception as exc:
            # Log but continue — one failing factor type shouldn't block the others
            logger.warning("MFA reset: failed to unenroll %s for %s: %s", factor, verify_user_id, exc)
            errors.append(factor)

    if errors:
        logger.error("MFA reset for %s: could not unenroll factor(s): %s", verify_user_id, errors)

    # IBM Verify caches enrolled factors in the active SSO session.
    # Disabling then immediately re-enabling the account terminates all live
    # sessions so the user's next login re-reads enrollments from scratch.
    try:
        await verify_client.set_user_active(verify_user_id, False)
        await verify_client.set_user_active(verify_user_id, True)
    except Exception as exc:
        logger.warning("MFA reset: session flush (disable/re-enable) failed for %s: %s", verify_user_id, exc)

    await _log(
        db,
        target_verify_user_id=verify_user_id,
        target_email=user.email,
        action=LifecycleAction.mover,
        actor=current_user,
        details="All MFA factors removed — user must re-enrol",
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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


# ── Aggregate audit log (Security Center) ───────────────────────────────────

@router.get("/audit/recent")
async def get_recent_audit_log(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the most recent JML lifecycle events across all identities.
    Admin-only. Used by the Security Center audit log table.
    """
    _require_admin(current_user)
    result = await db.execute(
        select(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(min(limit, 200))
    )
    entries = result.scalars().all()
    return [
        {
            "action": e.action,
            "actor_name": e.actor_name,
            "target_email": e.target_email,
            "details": e.details,
            "created_at": e.created_at,
        }
        for e in entries
    ]


# ── IBM Verify Activity Log ───────────────────────────────────────────────────

@router.get("/audit/ibm-activity")
async def get_ibm_activity_log(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
):
    """
    Return recent IBM Verify platform activity events.
    Aggregates events from IBM Verify's activity/reporting API.
    Admin-only.
    """
    _require_admin(current_user)
    try:
        events = await verify_client.get_activity_log(limit=limit)
        return {"events": events, "source": "ibm_verify"}
    except Exception as exc:
        logger.warning("IBM activity log fetch failed: %s", exc)
        return {"events": [], "source": "ibm_verify", "error": "IBM Verify activity log unavailable"}
