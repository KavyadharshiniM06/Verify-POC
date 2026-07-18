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
        # client_credentials token — ROPC is blocked by adaptive access
        headers = await self._headers()
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
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/fido2/relyingparties/{settings.fido2_rp_id}/attestation/result"
        body = {"userId": user_id, **attestation_response}
        resp = await self._client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def fido2_login_begin(self, user_id: str) -> dict:
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/fido2/relyingparties/{settings.fido2_rp_id}/assertion/options"
        body = {"userId": user_id}
        resp = await self._client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def fido2_login_complete(self, assertion_response: dict) -> dict:
        headers = await self._headers()
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

    async def unenroll_factor(self, verify_user_id: str, factor_type: str) -> None:
        """
        Delete all registrations of a given factor type for a user from IBM Verify.
        factor_type is one of: fido2, totp, push, email_otp
        Uses client_credentials token — ROPC is blocked by adaptive access.
        """
        headers = await self._headers()

        if factor_type == "fido2":
            url = (
                f"{settings.verify_tenant_url}/v2.0/factors/fido2/relyingparties"
                f"/{settings.fido2_rp_id}/registrations"
            )
            r = await self._client.get(url, params={"userId": verify_user_id}, headers=headers)
            if r.is_success:
                for reg in r.json().get("fido2", r.json().get("registrations", [])):
                    rid = reg.get("id")
                    if rid:
                        await self._client.delete(f"{url}/{rid}", headers=headers)

        elif factor_type == "totp":
            url = f"{settings.verify_tenant_url}/v2.0/factors/totp/registrations"
            r = await self._client.get(url, params={"userId": verify_user_id}, headers=headers)
            if r.is_success:
                regs = r.json().get("totpRegistrations", r.json().get("registrations", []))
                for reg in regs:
                    rid = reg.get("id")
                    if rid:
                        await self._client.delete(f"{url}/{rid}", headers=headers)

        elif factor_type == "push":
            url = f"{settings.verify_tenant_url}/v2.0/factors/push/registrations"
            r = await self._client.get(url, params={"userId": verify_user_id}, headers=headers)
            if r.is_success:
                regs = r.json().get("pushRegistrations", r.json().get("registrations", []))
                for reg in regs:
                    rid = reg.get("id")
                    if rid:
                        await self._client.delete(f"{url}/{rid}", headers=headers)

        elif factor_type == "email_otp":
            url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp"
            r = await self._client.get(url, params={"userId": verify_user_id}, headers=headers)
            if r.is_success:
                for reg in r.json().get("emailotp", []):
                    rid = reg.get("id")
                    if rid:
                        await self._client.delete(f"{url}/{rid}", headers=headers)

    async def get_enrolled_factors(self, verify_user_id: str) -> dict:
        """
        Return the authentication factors enrolled by a user from IBM Verify.
        Queries FIDO2, TOTP, and push registrations for the given user.
        Returns a dict with keys: fido2, totp, push — each True/False.
        Uses client_credentials token — ROPC is blocked by adaptive access.
        """
        headers = await self._headers()
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

    async def totp_challenge(self, user_id: str) -> dict:
        """
        Initiate a TOTP verification challenge for an already-enrolled user.
        Returns a transaction_id the user completes by supplying their OTP code.
        Uses the same verifications endpoint as enroll — IBM Verify returns a
        transaction the client verifies with the current 6-digit code.
        """
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/totp/verifications"
        body = {"userId": user_id}
        resp = await self._client.post(url, json=body, headers=headers)
        if not resp.is_success:
            logger.error("TOTP challenge error %s: %s", resp.status_code, resp.text)
        resp.raise_for_status()
        return resp.json()

    async def totp_verify(self, transaction_id: str, otp_code: str) -> dict:
        """Verify TOTP code. IBM Verify uses POST /v2.0/factors/totp/verifications/{id}."""
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/totp/verifications/{transaction_id}"
        body = {"otp": otp_code}
        resp = await self._client.post(url, json=body, headers=headers)
        if not resp.is_success:
            logger.error("TOTP verify error %s: %s", resp.status_code, resp.text)
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
    #
    # IBM Verify email OTP flow (Cloud Directory):
    #
    #   1. GET  /v2.0/factors/emailotp?search=userId={id}
    #         → returns list; pick the first enabled enrollment's `id`
    #         → if none exists, POST /v2.0/factors/emailotp to create one
    #
    #   2. POST /v2.0/factors/emailotp/{enrollmentId}/verifications
    #         → triggers OTP delivery; returns { id (transactionId), ... }
    #
    #   3. PUT  /v2.0/factors/emailotp/verifications/{transactionId}
    #         → body: { otp: "123456" } — verifies the code

    async def _email_otp_get_or_create_enrollment(self, user_id: str, email: str) -> str:
        """
        Return the enrollmentId for the user's email OTP factor.
        Creates one if none exists, using client_credentials token.
        """
        headers = await self._headers()
        list_url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp"

        # 1. Check for existing enrollment
        resp = await self._client.get(
            list_url,
            params={"search": f"userId={user_id}"},
            headers=headers,
        )
        if resp.is_success:
            enrollments = resp.json().get("emailotp", [])
            enabled = [e for e in enrollments if e.get("enabled") or e.get("validated")]
            if enabled:
                return str(enabled[0]["id"])
            # If any enrollment exists (even disabled) use its id rather than creating a new one
            if enrollments:
                return str(enrollments[0]["id"])

        # 2. Create enrollment
        logger.debug("Creating email OTP enrollment for user %s", user_id)
        create_resp = await self._client.post(
            list_url,
            json={"userId": user_id, "emailAddress": email},
            headers=headers,
        )
        if not create_resp.is_success:
            logger.error(
                "Email OTP enrollment create %s: %s",
                create_resp.status_code,
                create_resp.text,
            )
        create_resp.raise_for_status()
        enrollment = create_resp.json()
        eid = str(enrollment["id"])

        # Enable/validate the enrollment so it can receive codes
        await self._client.put(
            f"{list_url}/{eid}",
            json={**enrollment, "enabled": True, "validated": True},
            headers=headers,
        )
        return eid

    async def email_otp_enroll(self, user_id: str, email: str) -> dict:
        """Public alias — returns the enrollment record (id, emailAddress, …)."""
        headers = await self._headers()
        eid = await self._email_otp_get_or_create_enrollment(user_id, email)
        resp = await self._client.get(
            f"{settings.verify_tenant_url}/v2.0/factors/emailotp/{eid}",
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()

    async def email_otp_send(self, user_id: str, email: str) -> dict:
        """
        Send an OTP to the user's registered email address.

        IBM Verify endpoint:
          POST /v2.0/factors/emailotp/{enrollmentId}/verifications
        Returns a transaction object whose `id` is used in email_otp_verify.
        """
        headers = await self._headers()
        eid = await self._email_otp_get_or_create_enrollment(user_id, email)
        url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp/{eid}/verifications"
        resp = await self._client.post(url, json={}, headers=headers)
        if not resp.is_success:
            logger.error("Email OTP send error %s: %s", resp.status_code, resp.text)
        resp.raise_for_status()
        return resp.json()

    async def email_otp_verify(self, transaction_id: str, otp_code: str) -> dict:
        """
        Verify the OTP code the user received by email.

        IBM Verify endpoint:
          PUT /v2.0/factors/emailotp/verifications/{transactionId}
        Body: { "otp": "<code>" }
        """
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp/verifications/{transaction_id}"
        body = {"otp": otp_code}
        resp = await self._client.put(url, json=body, headers=headers)
        if not resp.is_success:
            logger.error("Email OTP verify error %s: %s", resp.status_code, resp.text)
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
