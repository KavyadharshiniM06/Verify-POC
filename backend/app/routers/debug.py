"""
Debug / diagnostics endpoints — admin-only, read-only.

GET /debug/verify-activity
    Probes the IBM Verify audit events API (/v1.0/events/auditevents) with the
    current client_credentials token and returns the raw HTTP status + first 500
    bytes of the response body.  Use this to confirm whether the readActivity
    scope is granted on your API client before wiring real data into the UI.

    Possible outcomes:
      200  — scope is active; body shows the event envelope (look for "events" key)
      403  — readActivity scope not granted; add it in IBM Verify Admin →
             Applications → API Access → your API client → Permissions tab
      401  — token issue (wrong client_id / secret)
      404  — tenant URL mismatch or v1.0 not supported on your plan
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
