"""
IBM Verify SaaS HTTP client.
Handles token acquisition (client_credentials) and IBM Verify API calls.
Access tokens are never logged.
"""
import base64
import json as _json
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
        headers["Accept"] = "application/scim+json"
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

    # ── Group / Role management ───────────────────────────────────────────

    # IBM Verify group displayNames as they exist in the tenant.
    # "Admin" role maps to the "admin" group (lowercase in IBM Verify).
    # "Customer" and "Manager" match their groups exactly.
    _ROLE_TO_GROUP: dict[str, str] = {
        "Admin": "admin",
        "Manager": "Manager",
        "Customer": "Customer",
    }

    async def _find_group_id(self, group_name: str) -> Optional[str]:
        """
        Return the IBM Verify group id whose displayName matches group_name
        (case-insensitive scan, to handle any casing drift).
        """
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Groups"
        # Try exact match first using the IBM Verify displayName
        resp = await self._client.get(
            url,
            params={"filter": f'displayName eq "{group_name}"'},
            headers=headers,
        )
        if resp.is_success:
            resources = resp.json().get("Resources", [])
            if resources:
                return resources[0]["id"]
        # Fall back to a case-insensitive scan across all groups
        resp_all = await self._client.get(url, headers=headers)
        if not resp_all.is_success:
            logger.warning("_find_group_id: GET groups failed %s %s", resp_all.status_code, resp_all.text[:200])
            return None
        for g in resp_all.json().get("Resources", []):
            if g.get("displayName", "").lower() == group_name.lower():
                return g["id"]
        return None

    async def _resolve_group_id(self, role: str) -> Optional[str]:
        """Map an app role string to the IBM Verify group id, using the known name mapping."""
        ibm_group_name = self._ROLE_TO_GROUP.get(role, role)
        return await self._find_group_id(ibm_group_name)

    async def sync_user_role_group(self, verify_user_id: str, new_role: str, old_role: Optional[str] = None) -> None:
        """
        Keep IBM Verify group membership in sync with the application role.

        - Removes the user from the old role group (if different and it exists).
        - Adds the user to the new role group (if it exists in IBM Verify).

        Groups must be pre-created in IBM Verify with displayNames that match
        the role strings exactly: "Customer", "Manager", "Admin".
        Missing groups are silently skipped so this never breaks the main operation.
        """
        if old_role and old_role != new_role:
            old_gid = await self._resolve_group_id(old_role)
            if old_gid:
                await self._remove_user_from_group(verify_user_id, old_gid, old_role)

        new_gid = await self._resolve_group_id(new_role)
        if new_gid:
            await self._add_user_to_group(verify_user_id, new_gid, new_role)
        else:
            logger.warning(
                "sync_user_role_group: no group found for role '%s' in IBM Verify — "
                "check _ROLE_TO_GROUP mapping matches your tenant group names",
                new_role,
            )

    async def _add_user_to_group(self, verify_user_id: str, group_id: str, group_name: str) -> None:
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Groups/{group_id}"
        body = {
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            "Operations": [
                {
                    "op": "add",
                    "path": "members",
                    "value": [{"value": verify_user_id, "type": "user"}],
                }
            ],
        }
        resp = await self._client.patch(url, content=_json.dumps(body).encode("utf-8"), headers=headers)
        if resp.is_success:
            logger.debug("sync_user_role_group: added user %s to group '%s'", verify_user_id, group_name)
        else:
            logger.warning(
                "sync_user_role_group: failed to add user %s to group '%s': %s %s",
                verify_user_id, group_name, resp.status_code, resp.text[:200],
            )

    async def _remove_user_from_group(self, verify_user_id: str, group_id: str, group_name: str) -> None:
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Groups/{group_id}"
        # Use a "replace" with the filtered member list excluded, which IBM Verify
        # handles more reliably than the path-filter remove form.
        # First fetch the current member list so we can rebuild it without this user.
        get_resp = await self._client.get(url, headers=headers)
        if get_resp.is_success:
            current_members = get_resp.json().get("members", [])
            new_members = [
                m for m in current_members
                if m.get("value") != verify_user_id
            ]
            body = {
                "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
                "Operations": [
                    {
                        "op": "replace",
                        "path": "members",
                        "value": [{"value": m["value"], "type": "user"} for m in new_members],
                    }
                ],
            }
        else:
            # Fallback: path-filter form (IBM Verify rejects empty-body PATCH)
            body = {
                "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
                "Operations": [
                    {
                        "op": "remove",
                        "path": f'members[value eq "{verify_user_id}"]',
                    }
                ],
            }
        resp = await self._client.patch(url, content=_json.dumps(body).encode("utf-8"), headers=headers)
        if resp.is_success:
            logger.debug("sync_user_role_group: removed user %s from group '%s'", verify_user_id, group_name)
        else:
            logger.warning(
                "sync_user_role_group: failed to remove user %s from group '%s': %s %s",
                verify_user_id, group_name, resp.status_code, resp.text[:200],
            )

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

    async def list_users(self, search: str = "", start_index: int = 1, count: int = 20) -> dict:
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users"
        params = {
            "startIndex": start_index,
            "count": count,
        }
        if search.strip():
            params["filter"] = f'userName co "{search.strip()}" or name.formatted co "{search.strip()}"'
        resp = await self._client.get(url, params=params, headers=headers)
        resp.raise_for_status()
        return resp.json()

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
            "emails": [{"value": email, "type": "work", "primary": True}],
            "active": active,
        }
        resp = await self._client.post(url, content=_json.dumps(body).encode("utf-8"), headers=headers)
        if not resp.is_success:
            logger.error("create_user failed: %s %s", resp.status_code, resp.text[:300])
        resp.raise_for_status()
        return resp.json()

    async def update_user(self, verify_user_id: str, email: str, name: str, role: str) -> dict:
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users/{verify_user_id}"

        # Fetch current record to check userCategory and preserve userName
        get_resp = await self._client.get(url, headers=headers)
        get_resp.raise_for_status()
        current = get_resp.json()

        logger.debug("update_user GET current record: %s", _json.dumps(current))
        logger.debug(
            "update_user called with: email=%s name=%s  "
            "current_name_formatted=%s  current_emails=%s",
            email, name,
            current.get("name", {}).get("formatted"),
            current.get("emails"),
        )

        ext = current.get("urn:ietf:params:scim:schemas:extension:ibm:2.0:User", {})
        is_federated = ext.get("userCategory", "regular") == "federated"

        if is_federated:
            logger.warning(
                "update_user: skipping IBM Verify PATCH for federated user %s — "
                "name/email are managed by the identity provider",
                verify_user_id,
            )
            return current

        body = {
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            "Operations": [],
        }

        current_name = current.get("name", {}).get("formatted", "")
        if current_name != name:
            logger.debug("update_user: name differs (%r → %r), adding op", current_name, name)
            body["Operations"].append(
                {"op": "replace", "path": "name", "value": {"formatted": name}}
            )
        else:
            logger.debug("update_user: name unchanged (%r), skipping", current_name)

        current_email = next(
            (
                item.get("value", "")
                for item in current.get("emails", [])
                if item.get("value")
            ),
            "",
        )
        if current_email != email:
            logger.debug("update_user: email differs (%r → %r), adding op", current_email, email)
            current_emails = current.get("emails", [])
            new_emails = []
            for item in current_emails:
                entry = dict(item)
                if entry.get("primary") or entry.get("value") == current_email:
                    entry["value"] = email
                new_emails.append(entry)
            if not new_emails:
                new_emails = [{"value": email, "type": "work", "primary": True}]
            body["Operations"].append(
                {"op": "replace", "path": "emails", "value": new_emails}
            )
        else:
            logger.debug("update_user: email unchanged (%r), skipping", current_email)

        if not body["Operations"]:
            logger.debug("update_user: nothing changed — skipping PATCH for %s", verify_user_id)
            return current

        patch_headers = {
            "Authorization": headers["Authorization"],
            "Content-Type": "application/scim+json",
            "Accept": "application/scim+json",
        }
        raw_body = _json.dumps(body).encode("utf-8")
        logger.debug("update_user PATCH body (exact): %s", _json.dumps(body))
        resp = await self._client.patch(url, content=raw_body, headers=patch_headers)
        if not resp.is_success:
            logger.error(
                "update_user PATCH failed for %s: %s %s",
                verify_user_id, resp.status_code, resp.text,
            )
        resp.raise_for_status()
        refreshed = await self._client.get(url, headers=headers)
        refreshed.raise_for_status()
        logger.debug("update_user refreshed record: %s", _json.dumps(refreshed.json()))
        return refreshed.json()

    async def set_user_active(self, verify_user_id: str, active: bool) -> dict:
        """
        Enable or disable a Cloud Directory user in IBM Verify.

        IBM Verify's /v2.0/Users PATCH endpoint for the `active` attribute
        requires a full PatchOp envelope.  However some tenant configurations
        reject the PATCH form entirely for `active`.  Using a PUT of the full
        current record is the most reliable approach (same pattern as
        reset_password) and avoids the CSIAI0093E "missing Operations/schemas"
        400 that IBM Verify returns when it cannot parse the PATCH body.
        """
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users/{verify_user_id}"

        # Fetch current record so we PUT back a complete, valid resource.
        get_resp = await self._client.get(url, headers=headers)
        get_resp.raise_for_status()
        current = get_resp.json()

        put_body = dict(current)
        put_body["active"] = active

        resp = await self._client.put(url, content=_json.dumps(put_body).encode("utf-8"), headers=headers)
        if not resp.is_success:
            logger.error(
                "set_user_active PUT failed for %s (active=%s): %s %s",
                verify_user_id, active, resp.status_code, resp.text[:300],
            )
        resp.raise_for_status()
        return resp.json() if resp.content else {"id": verify_user_id, "active": active}

    async def delete_user(self, verify_user_id: str) -> None:
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users/{verify_user_id}"
        resp = await self._client.delete(url, headers=headers)
        resp.raise_for_status()

    async def reset_password(self, verify_user_id: str) -> str:
        """
        Force a password reset for a Cloud Directory user in IBM Verify SaaS.

        Sets a cryptographically random temporary password on the account and
        marks pwdReset=True so IBM Verify requires the user to choose a new
        password on their next login.

        Returns the temporary password so the admin can communicate it to the
        user out-of-band. Federated users are skipped (their password is owned
        by the external IdP) and a descriptive error is raised instead.

        IBM Verify does not expose a "send reset email" backend API — the only
        supported admin-side mechanism is PUT /v2.0/Users/{id} with a new
        password + pwdReset=true.
        """
        import secrets as _secrets
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users/{verify_user_id}"

        # Fetch current record
        get_resp = await self._client.get(url, headers=headers)
        get_resp.raise_for_status()
        current = get_resp.json()

        ext = current.get("urn:ietf:params:scim:schemas:extension:ibm:2.0:User", {})
        if ext.get("userCategory") == "federated":
            raise ValueError(
                "Password is managed by the external identity provider for federated users. "
                "Direct them to reset their password through their IdP."
            )

        # Generate a secure temporary password that satisfies IBM Verify complexity:
        # min 8 chars, must contain upper, lower, digit, and special character.
        alphabet = "abcdefghijklmnopqrstuvwxyz"
        tmp_pwd = (
            _secrets.choice(alphabet.upper())          # 1 uppercase
            + _secrets.choice("0123456789")            # 1 digit
            + _secrets.choice("!@#$%^&*")              # 1 special
            + "".join(_secrets.choice(alphabet + alphabet.upper() + "0123456789") for _ in range(13))
        )
        # Shuffle to avoid predictable prefix
        tmp_list = list(tmp_pwd)
        for i in range(len(tmp_list) - 1, 0, -1):
            j = _secrets.randbelow(i + 1)
            tmp_list[i], tmp_list[j] = tmp_list[j], tmp_list[i]
        tmp_pwd = "".join(tmp_list)

        # PUT the full record back with the new password and pwdReset=True.
        # IBM Verify will require the user to change the password on next login.
        put_body = dict(current)
        put_body["password"] = tmp_pwd
        put_body.setdefault("urn:ietf:params:scim:schemas:extension:ibm:2.0:User", {})["pwdReset"] = True

        resp = await self._client.put(url, content=_json.dumps(put_body).encode("utf-8"), headers=headers)
        if not resp.is_success:
            logger.error(
                "reset_password failed for %s: %s %s",
                verify_user_id, resp.status_code, resp.text[:300],
            )
        resp.raise_for_status()
        return tmp_pwd

    
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

        IBM Verify search param: ?search=userId%3D{id}  (URL-encoded '=')
        The response envelope key is "emailotp" (list of enrollment objects).
        """
        headers = await self._headers()
        list_url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp"

        async def _fetch_existing() -> str | None:
            """Try both known search param formats and return the first enrollment id found."""
            for search_val in (f"userId={user_id}", f"userId%3D{user_id}"):
                r = await self._client.get(
                    list_url,
                    params={"search": search_val},
                    headers=headers,
                )
                logger.debug(
                    "_email_otp_get_or_create_enrollment GET %s → %s %s",
                    search_val, r.status_code, r.text[:300],
                )
                if r.is_success:
                    enrollments = r.json().get("emailotp", [])
                    if enrollments:
                        # Prefer enabled/validated; fall back to any enrollment
                        enabled = [e for e in enrollments if e.get("enabled") or e.get("validated")]
                        chosen = enabled[0] if enabled else enrollments[0]
                        return str(chosen["id"])
            return None

        # 1. Try to find an existing enrollment
        eid = await _fetch_existing()
        if eid:
            return eid

        # 2. Create a new enrollment
        logger.debug("Creating email OTP enrollment for user %s", user_id)
        create_resp = await self._client.post(
            list_url,
            json={"userId": user_id, "emailAddress": email},
            headers=headers,
        )

        # 409 = enrollment already exists for this email — fetch it
        if create_resp.status_code == 409:
            logger.debug(
                "Email OTP enrollment 409 for user %s — fetching existing enrollment",
                user_id,
            )
            eid = await _fetch_existing()
            if eid:
                return eid
            # Last resort: list ALL emailotp enrollments and match by userId
            all_resp = await self._client.get(list_url, headers=headers)
            if all_resp.is_success:
                for e in all_resp.json().get("emailotp", []):
                    if str(e.get("userId", "")) == user_id:
                        return str(e["id"])
            raise httpx.HTTPStatusError(
                "409 and could not locate existing enrollment",
                request=create_resp.request,
                response=create_resp,
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
        Requires the admin ROPC token — client_credentials returns 403 on this endpoint.
        Returns a transaction object whose `id` is used in email_otp_verify.
        """
        headers = await self._admin_headers()
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
        Requires the admin ROPC token — client_credentials returns 403 on this endpoint.
        Body: { "otp": "<code>" }
        """
        headers = await self._admin_headers()
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
