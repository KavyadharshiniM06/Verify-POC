"""
Debug / diagnostics endpoints — admin-only, read-only.

GET /debug/verify-activity
    Probes the IBM Verify audit events API.

GET /debug/enrolled-factors?user_id=<verify_user_id>
    Calls each IBM Verify factor API for the given user and returns the raw
    HTTP status + full response body for every endpoint.  Use this to
    diagnose why enrolled_factors shows False for a user.
"""
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.auth.jwt_handler import get_current_user
from app.config import settings
from app.models import User
from app.services.verify_client import verify_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/debug", tags=["debug"])


def _require_admin(current_user: User) -> None:
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin role required")


async def _probe_factors(target_id: str) -> dict:
    """Shared implementation — call every IBM Verify factor API and return raw results."""

    # Use admin token (same as get_enrolled_factors)
    try:
        token = await verify_client._get_admin_token()
        token_type = "admin_ropc"
    except Exception:
        token = await verify_client._get_access_token()
        token_type = "client_credentials"

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }

    results: dict = {"user_id": target_id, "token_type": token_type}

    async with httpx.AsyncClient(timeout=20.0) as client:
        # ── FIDO2 ──
        try:
            r = await client.get(
                f"{settings.verify_tenant_url}/v2.0/factors/fido2/registrations",
                params={"search": f'userId = "{target_id}"'},
                headers=headers,
            )
            body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text
            results["fido2"] = {"status": r.status_code, "body": body}
        except Exception as exc:
            results["fido2"] = {"status": "error", "body": str(exc)}

        # ── TOTP ──
        try:
            r = await client.get(
                f"{settings.verify_tenant_url}/v2.0/factors/totp/registrations",
                params={"userId": target_id},
                headers=headers,
            )
            body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text
            results["totp"] = {"status": r.status_code, "body": body}
        except Exception as exc:
            results["totp"] = {"status": "error", "body": str(exc)}

        # ── Push ──
        try:
            r = await client.get(
                f"{settings.verify_tenant_url}/v1.0/authenticators",
                params={"userId": target_id},
                headers=headers,
            )
            body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text
            results["push"] = {"status": r.status_code, "body": body}
        except Exception as exc:
            results["push"] = {"status": "error", "body": str(exc)}

        # ── Email OTP ──
        try:
            r = await client.get(
                f"{settings.verify_tenant_url}/v2.0/factors/emailotp",
                params={"search": f'userId = "{target_id}"'},
                headers=headers,
            )
            body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text
            results["email_otp"] = {"status": r.status_code, "body": body}
        except Exception as exc:
            results["email_otp"] = {"status": "error", "body": str(exc)}

    return results


@router.get("/enrolled-factors")
async def debug_enrolled_factors(
    user_id: str,
    current_user: User = Depends(get_current_user),
):
    """Auth-required version — pass ?user_id=<verify_user_id>."""
    return await _probe_factors(user_id.strip() or current_user.verify_user_id)


@router.get("/factors-raw")
async def debug_factors_raw(user_id: str):
    """
    No-auth version for quick browser testing.
    GET /debug/factors-raw?user_id=<verify_user_id>
    """
    if not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id query param is required")
    return await _probe_factors(user_id.strip())


@router.get("/verify-activity")
async def probe_verify_activity(
    size: int = 5,
    current_user: User = Depends(get_current_user),
):
    """
    Probe the IBM Verify audit events API and return the raw response.

    Query params:
      size  — number of events to request (default 5, max 20)

    Returns a JSON object with:
      scope_status   — "ok" | "forbidden" | "unauthorized" | "not_found" | "error"
      http_status    — the raw HTTP status code from IBM Verify
      body_preview   — first 800 chars of the IBM Verify response body
      endpoint       — the URL that was called
      diagnosis      — human-readable explanation of the result
    """
    _require_admin(current_user)

    size = min(max(1, size), 20)
    url = f"{settings.verify_tenant_url}/v1.0/events/auditevents"

    try:
        token = await verify_client._get_access_token()
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params={"size": size}, headers=headers)
    except Exception as exc:
        logger.error("debug/verify-activity: request failed: %s", exc)
        return {
            "scope_status": "error",
            "http_status": None,
            "body_preview": str(exc)[:800],
            "endpoint": url,
            "diagnosis": "Network or configuration error — check VERIFY_TENANT_URL in .env",
        }

    status = resp.status_code
    body = resp.text[:800]

    if status == 200:
        scope_status = "ok"
        diagnosis = "readActivity scope is active. Wire real data into the UI."
    elif status == 403:
        scope_status = "forbidden"
        diagnosis = (
            "readActivity scope NOT granted. "
            "In IBM Verify: Applications → API Access → your API client → Permissions → "
            "enable 'Read event data' (readActivity), then save and retry."
        )
    elif status == 401:
        scope_status = "unauthorized"
        diagnosis = "Token rejected — verify VERIFY_API_CLIENT_ID / VERIFY_API_CLIENT_SECRET in .env."
    elif status == 404:
        scope_status = "not_found"
        diagnosis = "Endpoint not found — confirm VERIFY_TENANT_URL is correct and v1.0 events are available on your plan."
    else:
        scope_status = "error"
        diagnosis = f"Unexpected HTTP {status} from IBM Verify."

    logger.info("debug/verify-activity probe: status=%s scope_status=%s", status, scope_status)
    return {
        "scope_status": scope_status,
        "http_status": status,
        "body_preview": body,
        "endpoint": url,
        "diagnosis": diagnosis,
    }
