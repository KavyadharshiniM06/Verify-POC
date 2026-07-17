"""
IBM Verify SaaS HTTP client.
Handles token acquisition (client_credentials) and IBM Verify API calls.
Access tokens are never logged.
"""
import base64
import logging
from typing import Any, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class VerifyClient:
    def __init__(self):
        self._client = httpx.AsyncClient(timeout=30.0)
        # client_credentials token cache
        self._token_cache: dict[str, str] = {}
        self._token_expires_at = 0.0
        # ROPC admin token cache (used for factor APIs)
        self._admin_token_cache: dict[str, str] = {}
        self._admin_token_expires_at = 0.0

    async def _get_access_token(self) -> str:
        """Client credentials token — for user/directory API calls."""
        import time
        if self._token_cache and time.time() < self._token_expires_at:
            return self._token_cache["access_token"]

        api_client_id = settings.verify_api_client_id or settings.verify_client_id
        api_client_secret = settings.verify_api_client_secret or settings.verify_client_secret
        credentials = f"{api_client_id}:{api_client_secret}"
        encoded = base64.b64encode(credentials.encode()).decode()
        response = await self._client.post(
            settings.verify_oidc_token_url,
            data={
                "grant_type": "client_credentials",
                "scope": "manageAuthFactors authenticatorConfig manageUsers readUsers manageUserStandardGroups readUserGroups",
            },
            headers={
                "Authorization": f"Basic {encoded}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        response.raise_for_status()
        token_data = response.json()
        self._token_cache = token_data
        self._token_expires_at = time.time() + 2700
        logger.debug("Acquired IBM Verify service token (cached for 45m)")
        return token_data["access_token"]

    async def _get_admin_token(self) -> str:
        """
        ROPC token using admin credentials — required for /v2.0/factors/* APIs.
        Falls back to client_credentials token if admin creds not configured.
        """
        import time
        if self._admin_token_cache and time.time() < self._admin_token_expires_at:
            return self._admin_token_cache["access_token"]

        if not settings.verify_admin_username or not settings.verify_admin_password:
            logger.debug("No admin credentials — falling back to client_credentials token")
            return await self._get_access_token()

        # ROPC must use the OIDC application client (which has ROPC grant enabled)
        credentials = f"{settings.verify_client_id}:{settings.verify_client_secret}"
        encoded = base64.b64encode(credentials.encode()).decode()
        response = await self._client.post(
            settings.verify_oidc_token_url,
            data={
                "grant_type": "password",
                "username": settings.verify_admin_username,
                "password": settings.verify_admin_password,
                "scope": "manageAuthFactors authenticatorConfig manageUsers readUsers manageUserStandardGroups readUserGroups openid",
            },
            headers={
                "Authorization": f"Basic {encoded}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        if not response.is_success:
            logger.error("Admin ROPC token failed %s: %s", response.status_code, response.text)
            response.raise_for_status()
        token_data = response.json()
        self._admin_token_cache = token_data
        self._admin_token_expires_at = time.time() + 2700
        logger.debug("Acquired IBM Verify admin token via ROPC (cached for 45m)")
        return token_data["access_token"]

    async def _headers(self) -> dict[str, str]:
        token = await self._get_access_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def _admin_headers(self) -> dict[str, str]:
        """Headers using admin ROPC token — for factor enrollment/verification APIs."""
        token = await self._get_admin_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def _user_headers(self) -> dict[str, str]:
        headers = await self._headers()
        headers["Content-Type"] = "application/scim+json"
        return headers

    # ── FIDO2/WebAuthn ────────────────────────────────────────────────────

    async def fido2_register_begin(self, user_id: str, username: str, display_name: str) -> dict:
        headers = await self._admin_headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/fido2/relyingparties/{settings.fido2_rp_id}/attestation/options"
        body = {
            "userId": user_id,
            "username": username,
            "displayName": display_name,
        }
        resp = await self._client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def fido2_register_complete(self, user_id: str, attestation_response: dict) -> dict:
        headers = await self._admin_headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/fido2/relyingparties/{settings.fido2_rp_id}/attestation/result"
        body = {"userId": user_id, **attestation_response}
        resp = await self._client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def fido2_login_begin(self, user_id: str) -> dict:
        headers = await self._admin_headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/fido2/relyingparties/{settings.fido2_rp_id}/assertion/options"
        body = {"userId": user_id}
        resp = await self._client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def fido2_login_complete(self, assertion_response: dict) -> dict:
        headers = await self._admin_headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/fido2/relyingparties/{settings.fido2_rp_id}/assertion/result"
        resp = await self._client.post(url, json=assertion_response, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def get_user_by_id(self, verify_user_id: str) -> dict:
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users/{verify_user_id}"
        resp = await self._client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def find_user_by_email(self, email: str) -> Optional[dict]:
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users"
        resp = await self._client.get(url, params={"filter": f'email eq "{email}"'}, headers=headers)
        resp.raise_for_status()
        resources = resp.json().get("Resources", [])
        return resources[0] if resources else None

    async def create_user(self, email: str, name: str, role: str, active: bool = True) -> dict:
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users"
        body = {
            "schemas": [
                "urn:ietf:params:scim:schemas:core:2.0:User",
                "urn:ietf:params:scim:schemas:extension:ibm:2.0:User",
            ],
            "userName": email,
            "name": {"formatted": name},
            "emails": [{"value": email, "primary": True}],
            "active": active,
            # IBM Verify SCIM extension for group/role membership
            "urn:ietf:params:scim:schemas:extension:ibm:2.0:User": {
                "groups": [{"value": role, "type": "direct"}],
            },
        }
        resp = await self._client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def update_user(self, verify_user_id: str, email: str, name: str, role: str) -> dict:
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users/{verify_user_id}"
        body = {
            "schemas": [
                "urn:ietf:params:scim:schemas:core:2.0:User",
                "urn:ietf:params:scim:schemas:extension:ibm:2.0:User",
            ],
            "userName": email,
            "name": {"formatted": name},
            "emails": [{"value": email, "primary": True}],
            "urn:ietf:params:scim:schemas:extension:ibm:2.0:User": {
                "groups": [{"value": role, "type": "direct"}],
            },
        }
        resp = await self._client.put(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def set_user_active(self, verify_user_id: str, active: bool) -> dict:
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users/{verify_user_id}"
        body = {"active": active}
        resp = await self._client.patch(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json() if resp.content else {"id": verify_user_id, "active": active}

    async def delete_user(self, verify_user_id: str) -> None:
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users/{verify_user_id}"
        resp = await self._client.delete(url, headers=headers)
        resp.raise_for_status()

    async def get_enrolled_factors(self, verify_user_id: str) -> dict:
        """
        Return the authentication factors enrolled by a user from IBM Verify.
        Queries FIDO2, TOTP, and push registrations for the given user.
        Returns a dict with keys: fido2, totp, push — each True/False.
        """
        headers = await self._admin_headers()
        results = {"fido2": False, "totp": False, "push": False}

        try:
            fido2_url = (
                f"{settings.verify_tenant_url}/v2.0/factors/fido2/relyingparties"
                f"/{settings.fido2_rp_id}/registrations"
            )
            r = await self._client.get(fido2_url, params={"userId": verify_user_id}, headers=headers)
            if r.status_code == 200:
                fido2_data = r.json()
                results["fido2"] = len(fido2_data.get("fido2", fido2_data.get("registrations", []))) > 0
        except Exception:
            logger.debug("FIDO2 registration query failed for user %s", verify_user_id)

        try:
            totp_url = f"{settings.verify_tenant_url}/v2.0/factors/totp/registrations"
            r = await self._client.get(totp_url, params={"userId": verify_user_id}, headers=headers)
            if r.status_code == 200:
                totp_data = r.json()
                results["totp"] = len(totp_data.get("totpRegistrations", totp_data.get("registrations", []))) > 0
        except Exception:
            logger.debug("TOTP registration query failed for user %s", verify_user_id)

        try:
            push_url = f"{settings.verify_tenant_url}/v2.0/factors/push/registrations"
            r = await self._client.get(push_url, params={"userId": verify_user_id}, headers=headers)
            if r.status_code == 200:
                push_data = r.json()
                results["push"] = len(push_data.get("pushRegistrations", push_data.get("registrations", []))) > 0
        except Exception:
            logger.debug("Push registration query failed for user %s", verify_user_id)

        return results

    # ── TOTP ──────────────────────────────────────────────────────────────

    async def totp_enroll(self, user_id: str) -> dict:
        """
        Enroll TOTP for a user. Returns transaction_id + otpauth URI.
        Uses /v2.0/factors/totp/verifications (POST) with app-level client token.
        """
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/totp/verifications"
        body = {"userId": user_id}
        resp = await self._client.post(url, json=body, headers=headers)
        if not resp.is_success:
            logger.error("TOTP enroll error %s: %s", resp.status_code, resp.text)
        resp.raise_for_status()
        return resp.json()

    async def totp_verify(self, transaction_id: str, otp_code: str) -> dict:
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/totp/verifications/{transaction_id}"
        body = {"otp": otp_code}
        resp = await self._client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    # ── Push Notifications ────────────────────────────────────────────────

    async def push_initiate(self, user_id: str) -> dict:
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/push/verifications"
        body = {
            "userId": user_id,
            "pushNotification": {
                "message": "MockBank login request — tap Approve if this was you.",
                "title": "MockBank Login",
                "sound": "default",
            },
        }
        resp = await self._client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def push_poll(self, transaction_id: str) -> dict:
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/push/verifications/{transaction_id}"
        resp = await self._client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.json()

    # ── Email OTP ─────────────────────────────────────────────────────────

    async def email_otp_enroll(self, user_id: str, email: str) -> dict:
        """Create an Email OTP enrollment for a user (if not already enrolled)."""
        headers = await self._headers()
        # Check existing enrollments first
        url_list = f"{settings.verify_tenant_url}/v2.0/factors/emailotp"
        resp = await self._client.get(url_list, params={"userId": user_id}, headers=headers)
        if resp.is_success:
            existing = resp.json().get("emailotp", [])
            enabled = [e for e in existing if e.get("enabled")]
            if enabled:
                return enabled[0]  # Already enrolled
        # Create new enrollment
        url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp"
        body = {"userId": user_id, "emailAddress": email}
        resp = await self._client.post(url, json=body, headers=headers)
        if resp.is_success:
            enrollment = resp.json()
            # Enable it
            eid = enrollment.get("id")
            if eid:
                await self._client.put(
                    f"{settings.verify_tenant_url}/v2.0/factors/emailotp/{eid}",
                    json={**enrollment, "enabled": True, "validated": True},
                    headers=headers,
                )
        if not resp.is_success:
            logger.error("Email OTP enroll error %s: %s", resp.status_code, resp.text)
        resp.raise_for_status()
        return resp.json()

    async def email_otp_send(self, user_id: str, email: str) -> dict:
        """Send OTP to user's enrolled email. Enrolls first if needed."""
        headers = await self._headers()
        # Ensure enrollment exists and is enabled
        await self.email_otp_enroll(user_id, email)
        # Send OTP via PUT
        url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp/verifications"
        body = {"userId": user_id}
        resp = await self._client.put(url, json=body, headers=headers)
        if not resp.is_success:
            logger.error("Email OTP send error %s: %s", resp.status_code, resp.text)
        resp.raise_for_status()
        return resp.json()

    async def email_otp_verify(self, transaction_id: str, otp_code: str) -> dict:
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp/verifications/{transaction_id}"
        body = {"otp": otp_code}
        resp = await self._client.put(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    # ── OIDC / SSO ────────────────────────────────────────────────────────

    async def oidc_token_exchange(self, code: str, redirect_uri: str, code_verifier: str = "") -> dict:
        credentials = f"{settings.verify_client_id}:{settings.verify_client_secret}"
        encoded = base64.b64encode(credentials.encode()).decode()
        body: dict[str, str] = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        }
        if code_verifier:
            body["code_verifier"] = code_verifier
        resp = await self._client.post(
            settings.verify_oidc_token_url,
            data=body,
            headers={
                "Authorization": f"Basic {encoded}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        if not resp.is_success:
            logger.error(
                "IBM Verify token endpoint error %s: %s",
                resp.status_code,
                resp.text,
            )
        resp.raise_for_status()
        return resp.json()

    async def get_oidc_jwks(self) -> dict[str, Any]:
        resp = await self._client.get(settings.verify_oidc_jwks_url)
        resp.raise_for_status()
        return resp.json()

    async def close(self):
        await self._client.aclose()


verify_client = VerifyClient()
