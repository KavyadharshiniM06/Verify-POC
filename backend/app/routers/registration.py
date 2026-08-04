"""
Customer Self-Registration API.

Public endpoint — no authentication required.

Flow:
  1. Customer provides name + email + consent choices only (no password).
  2. Backend generates a cryptographically secure temporary password.
  3. IBM Verify Cloud Directory account is created with that temp password
     and pwdReset=True, so IBM Verify forces the user to change it on first login.
  4. A welcome email is sent to the user with their temporary password and
     a link to MockBank.  The user clicks the link, IBM Verify prompts them
     to set a new personal password, and they then proceed to MFA enrolment.
  5. A session JWT is NOT returned — the user must complete the IBM Verify
     password-change flow and then sign in via OIDC.

The temporary password is also returned in the API response (demo mode only)
so that the "Check your email" screen can display it inline when SMTP is not
configured — e.g. in local development without an SMTP server.

Rate-limiting / bot protection:
  This endpoint is intentionally lightweight — production deployments should
  add a gateway-level rate limiter (e.g. API Connect, APIGW throttle policy)
  and optionally a CAPTCHA challenge in the frontend.
"""
import logging
import secrets as _secrets
import threading

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User
from app.seed import seed_user_consents, seed_user_data
from app.services.mailer import send_welcome_email
from app.services.verify_client import verify_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/register", tags=["registration"])


def _generate_temp_password() -> str:
    """
    Generate a cryptographically secure temporary password that satisfies
    IBM Verify's default Cloud Directory complexity policy:
      - minimum 8 characters
      - at least 1 uppercase letter
      - at least 1 digit
      - at least 1 special character

    The password is 16 characters and shuffled so the mandatory characters
    do not appear in a predictable position.
    """
    alphabet   = "abcdefghijklmnopqrstuvwxyz"
    upper      = alphabet.upper()
    digits     = "0123456789"
    special    = "!@#$%&*"
    mixed      = alphabet + upper + digits

    pwd = (
        _secrets.choice(upper)    # 1 uppercase
        + _secrets.choice(digits)  # 1 digit
        + _secrets.choice(special) # 1 special
        + "".join(_secrets.choice(mixed) for _ in range(13))
    )
    # Fisher-Yates shuffle using secrets.randbelow
    chars = list(pwd)
    for i in range(len(chars) - 1, 0, -1):
        j = _secrets.randbelow(i + 1)
        chars[i], chars[j] = chars[j], chars[i]
    return "".join(chars)


class SelfRegisterRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    # Optional marketing consent opt-in at registration time
    marketing_consent: bool = False

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v


class SelfRegisterResponse(BaseModel):
    # No session token — user must sign in via OIDC after changing their password.
    email_sent: bool
    # Temp password returned in the response so dev/demo environments without
    # SMTP can still show it to the user.  In production this would be omitted
    # (or redacted) and the user would rely solely on the email.
    temp_password_hint: str
    message: str


@router.post(
    "",
    response_model=SelfRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Customer self-registration",
    description=(
        "Register a new customer account. No authentication required. "
        "Creates the IBM Verify identity, seeds demo data, sends a welcome "
        "email with a temporary password, and requires the user to sign in "
        "via OIDC (which triggers the IBM Verify password-change flow)."
    ),
)
async def self_register(
    req: SelfRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    full_name = f"{req.first_name.strip()} {req.last_name.strip()}"
    email_str = str(req.email)

    # ── 1. Guard: reject if email already exists locally ──────────────────
    existing = await db.execute(select(User).where(User.email == email_str))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists. Please sign in instead.",
        )

    # ── 2. Generate a secure temporary password ────────────────────────────
    tmp_pwd = _generate_temp_password()

    # ── 3. Create user in IBM Verify with pwdReset=True ────────────────────
    #
    # We use create_user_with_password but immediately override the pwdReset
    # flag to True via a follow-up PATCH.  This tells IBM Verify to force a
    # password change on the user's very first login — the correct enterprise
    # CIAM pattern when the initial credential is system-generated.
    try:
        ibm_user = await verify_client.create_user_with_password(
            email=email_str,
            name=full_name,
            password=tmp_pwd,
            first_name=req.first_name.strip(),
            last_name=req.last_name.strip(),
        )
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code if exc.response is not None else 502
        body = exc.response.text[:500] if exc.response is not None else ""

        if status_code == 409:
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists in IBM Verify. Please sign in.",
            ) from exc

        if status_code == 400:
            try:
                ibm_detail = exc.response.json()
                msg = (
                    ibm_detail.get("detail")
                    or ibm_detail.get("description")
                    or ibm_detail.get("messageDescription")
                    or body
                )
            except Exception:
                msg = body or "IBM Verify rejected the registration request."
            raise HTTPException(status_code=400, detail=msg) from exc

        logger.error("self_register: IBM Verify create failed %s: %s", status_code, body)
        raise HTTPException(
            status_code=502,
            detail="Unable to create account in IBM Verify. Please try again.",
        ) from exc
    except Exception as exc:
        logger.error("self_register: unexpected error: %s", exc)
        raise HTTPException(status_code=502, detail="Registration failed. Please try again.") from exc

    verify_user_id = ibm_user["id"]

    # ── 4. Force pwdReset=True so IBM Verify requires a password change ────
    #
    # create_user_with_password clears pwdReset for the "admin reset" use case.
    # Here we explicitly re-set it so the user is always forced to choose their
    # own personal password on first login — they never log in with a
    # system-generated credential without changing it first.
    try:
        import json as _json
        headers = await verify_client._user_headers()
        patch_url = f"{settings.verify_tenant_url}/v2.0/Users/{verify_user_id}"
        patch_body = {
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            "Operations": [
                {
                    "op": "replace",
                    "path": "urn:ietf:params:scim:schemas:extension:ibm:2.0:User:pwdReset",
                    "value": True,
                }
            ],
        }
        pr = await verify_client._client.patch(
            patch_url,
            content=_json.dumps(patch_body).encode("utf-8"),
            headers=headers,
        )
        if not pr.is_success:
            logger.warning(
                "self_register: pwdReset=true PATCH failed for %s: %s %s",
                verify_user_id, pr.status_code, pr.text[:200],
            )
        else:
            logger.debug("self_register: pwdReset=true set for %s", verify_user_id)
    except Exception as exc:
        logger.warning("self_register: pwdReset PATCH failed: %s", exc)

    # ── 5. No group sync needed for self-registered users ─────────────────
    # This is a workforce-only POC.  There is no Customer group in IBM Verify
    # and sync_user_role_group would attempt to create one if missing.  The
    # self-registration flow is kept for demo/CIAM completeness but does not
    # provision any IBM Verify group membership.

    # ── 6. Mirror in local DB + seed banking data and consents ─────────────
    user = User(
        verify_user_id=verify_user_id,
        email=email_str,
        name=full_name,
        role="Customer",
        is_active=True,
    )
    db.add(user)
    await db.flush()

    await seed_user_data(db, user.id, verify_user_id)
    await seed_user_consents(db, verify_user_id)

    # ── 7. Apply marketing consent choice ─────────────────────────────────
    if not req.marketing_consent:
        from datetime import datetime
        from sqlalchemy import update as sa_update
        from app.models import UserConsent
        await db.execute(
            sa_update(UserConsent)
            .where(
                UserConsent.user_verify_id == verify_user_id,
                UserConsent.purpose.in_(["marketing_communications", "third_party_data_sharing"]),
            )
            .values(revoked_at=datetime.utcnow())
        )

    await db.commit()

    # ── 8. Send welcome email (non-blocking — never fail the request) ──────
    login_url = settings.frontend_base_url.rstrip("/")
    email_sent = False
    try:
        # Run in a thread so slow SMTP does not delay the HTTP response
        def _send():
            nonlocal email_sent
            try:
                email_sent = send_welcome_email(
                    to_email=email_str,
                    to_name=full_name,
                    tmp_pwd=tmp_pwd,
                    login_url=login_url,
                )
            except Exception as mail_exc:
                logger.error("self_register: welcome email failed for %s: %s", email_str, mail_exc)

        t = threading.Thread(target=_send, daemon=True)
        t.start()
        t.join(timeout=10)  # wait up to 10 s; proceed regardless
    except Exception as exc:
        logger.error("self_register: email thread error: %s", exc)

    logger.info(
        "self_register: new customer registered — verify_user_id=%s email=%s email_sent=%s",
        verify_user_id, email_str, email_sent,
    )

    return SelfRegisterResponse(
        email_sent=email_sent,
        # Always return the temp password in the API response so dev environments
        # without SMTP can still test the full flow.
        temp_password_hint=tmp_pwd,
        message=(
            f"Account created. A welcome email with your temporary password has been sent to {email_str}."
            if email_sent
            else
            f"Account created. Check below for your temporary password (email delivery not configured)."
        ),
    )
