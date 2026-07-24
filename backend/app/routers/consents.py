"""
Consent management endpoints.

Lets authenticated users view the consents they granted at account creation
and revoke (or restore) optional consents at any time.
Required consents (is_required=True) cannot be revoked — doing so would make
the account non-functional.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_user
from app.database import get_db
from app.models import User, UserConsent
from app.seed import _CONSENT_DEFINITIONS, seed_user_consents

router = APIRouter(prefix="/users/me/consents", tags=["consents"])

# Human-readable labels indexed by purpose key (mirrors seed.py definitions)
_PURPOSE_LABELS: dict[str, str] = {
    purpose: label
    for purpose, label, _desc, _cat, _req in _CONSENT_DEFINITIONS
}


def _row_to_dict(c: UserConsent, *, session_terminated: bool = False) -> dict:
    return {
        "id": c.id,
        "purpose": c.purpose,
        "label": _PURPOSE_LABELS.get(c.purpose, c.purpose),
        "description": c.description,
        "category": c.category,
        "is_required": c.is_required,
        "is_active": c.revoked_at is None,
        "granted_at": c.granted_at.isoformat() if c.granted_at else None,
        "revoked_at": c.revoked_at.isoformat() if c.revoked_at else None,
        # True when the revoke action requires the client to terminate its
        # session immediately so the user must re-login to acknowledge the
        # updated consent state. Always False for restore operations.
        "session_terminated": session_terminated,
    }


@router.get("")
async def list_my_consents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all consent records for the authenticated user.

    If no records exist yet (legacy account that logged in before this feature
    was deployed), consents are seeded on-demand so the UI always has data.
    """
    result = await db.execute(
        select(UserConsent)
        .where(UserConsent.user_verify_id == current_user.verify_user_id)
        .order_by(UserConsent.id)
    )
    rows = result.scalars().all()

    # Backfill for existing users who registered before consent seeding was added
    if not rows:
        await seed_user_consents(db, current_user.verify_user_id)
        await db.commit()
        result2 = await db.execute(
            select(UserConsent)
            .where(UserConsent.user_verify_id == current_user.verify_user_id)
            .order_by(UserConsent.id)
        )
        rows = result2.scalars().all()

    return [_row_to_dict(c) for c in rows]


@router.put("/{consent_id}/revoke")
async def revoke_consent(
    consent_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke an optional consent. Required consents cannot be revoked.

    session_terminated is NOT set for optional consents (functional / marketing).
    Revoking marketing emails or analytics should be silent — no logout needed.
    session_terminated is only True for essential/required consents, but those
    are blocked above, so in practice it will always be False here.
    """
    result = await db.execute(
        select(UserConsent).where(
            UserConsent.id == consent_id,
            UserConsent.user_verify_id == current_user.verify_user_id,
        )
    )
    consent = result.scalar_one_or_none()
    if not consent:
        raise HTTPException(status_code=404, detail="Consent not found")
    if consent.is_required:
        raise HTTPException(
            status_code=400,
            detail="This consent is required for the service to function and cannot be revoked.",
        )
    if consent.revoked_at is not None:
        return _row_to_dict(consent, session_terminated=False)  # already revoked — idempotent
    consent.revoked_at = datetime.utcnow()
    await db.commit()
    await db.refresh(consent)
    # Optional consent revoked — no session termination needed.
    # The user can continue using the app; the revoked preference takes effect
    # going forward (e.g. they stop receiving marketing emails).
    return _row_to_dict(consent, session_terminated=False)


@router.put("/{consent_id}/restore")
async def restore_consent(
    consent_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-grant a previously revoked optional consent."""
    result = await db.execute(
        select(UserConsent).where(
            UserConsent.id == consent_id,
            UserConsent.user_verify_id == current_user.verify_user_id,
        )
    )
    consent = result.scalar_one_or_none()
    if not consent:
        raise HTTPException(status_code=404, detail="Consent not found")
    if consent.revoked_at is None:
        return _row_to_dict(consent)  # already active — idempotent
    consent.revoked_at = None
    await db.commit()
    await db.refresh(consent)
    return _row_to_dict(consent)
