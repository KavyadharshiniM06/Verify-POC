"""
IBM Verify SaaS HTTP client.
Handles token acquisition (client_credentials) and all IBM Verify API calls.
Access tokens are never logged.
"""
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class VerifyClient:
    def __init__(self):
        self._client = httpx.AsyncClient(timeout=30.0)

    async def _get_access_token(self) -> str:
        """Obtain an IBM Verify access token using client_credentials grant."""
        url = f"{settings.verify_tenant_url}/v1.0/endpoint/default/token"
        response = await self._client.post(
            url,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.verify_client_id,
                "client_secret": settings.verify_client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        response.raise_for_status()
        return response.json()["access_token"]

    async def _headers(self) -> dict:
        token = await self._get_access_token()
        # Token is intentionally not logged
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    # ── FIDO2/WebAuthn ────────────────────────────────────────────────────

    async def fido2_register_begin(self, user_id: str, username: str, display_name: str) -> dict:
        """Initiate FIDO2 registration — returns PublicKeyCredentialCreationOptions."""
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
        """Complete FIDO2 registration — sends attestation object to IBM Verify."""
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/fido2/relyingparties/{settings.fido2_rp_id}/attestation/result"
        body = {"userId": user_id, **attestation_response}
        resp = await self._client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def fido2_login_begin(self, user_id: str) -> dict:
        """Initiate FIDO2 assertion — returns PublicKeyCredentialRequestOptions."""
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/fido2/relyingparties/{settings.fido2_rp_id}/assertion/options"
        body = {"userId": user_id}
        resp = await self._client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def fido2_login_complete(self, assertion_response: dict) -> dict:
        """Complete FIDO2 login — verifies assertion with IBM Verify."""
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/fido2/relyingparties/{settings.fido2_rp_id}/assertion/result"
        resp = await self._client.post(url, json=assertion_response, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def get_user_by_id(self, verify_user_id: str) -> dict:
        """Fetch user profile from IBM Verify directory."""
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users/{verify_user_id}"
        resp = await self._client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.json()

    # ── TOTP ──────────────────────────────────────────────────────────────────

    async def totp_enroll(self, user_id: str) -> dict:
        """Initiate TOTP enrollment. Returns otpauth:// URI and transaction ID."""
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/totp/verifications"
        body = {"userId": user_id}
        resp = await self._client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def totp_verify(self, transaction_id: str, otp_code: str) -> dict:
        """Verify a TOTP code against an in-progress transaction."""
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/totp/verifications/{transaction_id}"
        body = {"otp": otp_code}
        resp = await self._client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    # ── Push Notifications ─────────────────────────────────────────────────────

    async def push_initiate(self, user_id: str) -> dict:
        """Send push to enrolled IBM Verify mobile app. Returns transaction ID."""
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
        """Poll IBM Verify for push transaction approval status."""
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/push/verifications/{transaction_id}"
        resp = await self._client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.json()

    # ── Email OTP ─────────────────────────────────────────────────────────────

    async def email_otp_send(self, user_id: str, email: str) -> dict:
        """Send a one-time passcode to the user's email via IBM Verify."""
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp/verifications"
        body = {"userId": user_id, "email": email}
        resp = await self._client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def email_otp_verify(self, transaction_id: str, otp_code: str) -> dict:
        """Verify the email OTP code."""
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp/verifications/{transaction_id}"
        body = {"otp": otp_code}
        resp = await self._client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    # ── OIDC / SSO ─────────────────────────────────────────────────────────────

    async def oidc_token_exchange(self, code: str, redirect_uri: str) -> dict:
        """Exchange authorization code for ID token using client_secret_basic (RFC 6749)."""
        import base64

        credentials = f"{settings.verify_client_id}:{settings.verify_client_secret}"
        encoded = base64.b64encode(credentials.encode()).decode()
        url = f"{settings.verify_tenant_url}/v1.0/endpoint/default/token"
        resp = await self._client.post(
            url,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={
                "Authorization": f"Basic {encoded}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def get_oidc_jwks(self) -> dict:
        """Fetch IBM Verify JWKS for ID token signature validation."""
        url = f"{settings.verify_tenant_url}/v1.0/endpoint/default/jwks"
        resp = await self._client.get(url)
        resp.raise_for_status()
        return resp.json()

    async def close(self):
        await self._client.aclose()


# Singleton instance
verify_client = VerifyClient()
