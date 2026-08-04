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
                "scope": "manageAuthFactors delegatedAuthFactors authenticatorConfig manageUsers readUsers manageUserStandardGroups readUserGroups readActivity",
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
                "scope": "manageAuthFactors delegatedAuthFactors authenticatorConfig manageUsers readUsers manageUserStandardGroups readUserGroups openid",
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

    # IBM Verify group displayNames — exactly three active roles.
    # No Customer, SalesRep, SalesManager, SalesAdmin groups are used.
    _ROLE_TO_GROUP: dict[str, str] = {
        "Admin":             "admin",
        "Manager":           "Manager",
        "SalesforceManager": "Salesforce-Administrator",
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

    async def _ensure_group_exists(self, role: str) -> Optional[str]:
        """
        Return the IBM Verify group id for the given role, creating the group
        in IBM Verify if it does not already exist.  This guarantees that
        self-registered customers are always placed in the Customer group even
        on a fresh tenant where the group has not been manually pre-created.
        """
        ibm_group_name = self._ROLE_TO_GROUP.get(role, role)
        gid = await self._find_group_id(ibm_group_name)
        if gid:
            return gid
        # Group is missing — create it on the fly
        logger.info(
            "_ensure_group_exists: group '%s' not found in IBM Verify — creating it now",
            ibm_group_name,
        )
        try:
            result = await self.create_group(ibm_group_name)
            return result["id"]
        except Exception as exc:
            logger.error(
                "_ensure_group_exists: could not create group '%s': %s",
                ibm_group_name, exc,
            )
            return None

    async def sync_user_role_group(self, verify_user_id: str, new_role: str, old_role: Optional[str] = None) -> None:
        """
        Keep IBM Verify group membership in sync with the application role.

        Removes the user from ALL known role groups (not just the previous one)
        then adds them to the new role group.  This ensures accumulated group
        memberships from past role changes are always cleaned up — a Mover
        must belong to exactly one role group at a time.

        Raises RuntimeError if the target group cannot be found or created.
        """
        # Build the complete set of IBM Verify group names that correspond to
        # any role OTHER than the new one.  This catches every group the user
        # may have been placed in across multiple historical role changes.
        new_ibm_group = self._ROLE_TO_GROUP.get(new_role, new_role)
        all_role_groups = set(self._ROLE_TO_GROUP.values())
        groups_to_remove = all_role_groups - {new_ibm_group}

        for group_name in groups_to_remove:
            gid = await self._find_group_id(group_name)
            if not gid:
                continue
            if not await self._is_user_in_group(verify_user_id, gid):
                continue
            logger.info(
                "sync_user_role_group: removing user %s from stale group '%s'",
                verify_user_id, group_name,
            )
            await self._remove_user_from_group(verify_user_id, gid, group_name)

        # Add to the new role group
        new_gid = await self._ensure_group_exists(new_role)
        if not new_gid:
            raise RuntimeError(
                f"IBM Verify group '{new_ibm_group}' (role='{new_role}') could not be found or created. "
                "Ensure the group exists in IBM Verify and that the API client has "
                "'manageUserStandardGroups' scope."
            )
        await self._add_user_to_group(verify_user_id, new_gid, new_role)

    async def _is_user_in_group(self, verify_user_id: str, group_id: str) -> bool:
        """
        Check whether the user is already a direct member of the group.

        IBM Verify's Group GET omits the members array when membership is large
        (it paginates members separately), so we cannot rely on the group resource
        alone.  Instead we query the user's own SCIM record and check its groups
        list — this is always authoritative and never paginated away.
        """
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users/{verify_user_id}"
        resp = await self._client.get(url, headers=headers)
        if not resp.is_success:
            # Cannot confirm — assume not a member so the add is attempted
            return False
        for g in resp.json().get("groups", []):
            if g.get("value") == group_id:
                return True
        return False

    async def _add_user_to_group(self, verify_user_id: str, group_id: str, group_name: str) -> None:
        # Skip if the user is already a member (avoid CSIAI0130E duplicate-member 500).
        if await self._is_user_in_group(verify_user_id, group_id):
            logger.info(
                "sync_user_role_group: user %s already in group '%s' — skipping add",
                verify_user_id, group_name,
            )
            return

        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Groups/{group_id}"
        # IBM Verify SCIM Groups PATCH: op=add with path="members".
        # Each member entry MUST include both "value" (userId) and "type" ("user").
        # Confirmed by CSIAI0093E: "required attribute(s) missing: [type]".
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
            logger.info("sync_user_role_group: added user %s to group '%s'", verify_user_id, group_name)
            return

        logger.error(
            "sync_user_role_group: failed to add user %s to group '%s': %s %s",
            verify_user_id, group_name, resp.status_code, resp.text[:500],
        )
        resp.raise_for_status()

    async def _remove_user_from_group(self, verify_user_id: str, group_id: str, group_name: str) -> None:
        # IBM Verify Groups PATCH uses application/scim+json.
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Groups/{group_id}"
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
            logger.info("sync_user_role_group: removed user %s from group '%s'", verify_user_id, group_name)
        else:
            logger.warning(
                "sync_user_role_group: failed to remove user %s from group '%s': %s %s",
                verify_user_id, group_name, resp.status_code, resp.text[:300],
            )

    async def get_user_by_id(self, verify_user_id: str) -> dict:
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users/{verify_user_id}"
        resp = await self._client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def get_live_email(self, verify_user_id: str, fallback: str = "") -> str:
        """
        Return the primary email address IBM Verify currently holds for this user.

        Always fetches live from IBM Verify SCIM so callers never rely on a
        potentially stale local-DB or request-body value.  Falls back to
        ``fallback`` (e.g. the OIDC claim) when the SCIM call fails so a
        network blip never blocks login.

        This is the single source of truth helper — use it in every path that
        writes a user's email to the local DB.
        """
        try:
            ibv_user = await self.get_user_by_id(verify_user_id)
            live = next(
                (e.get("value", "") for e in ibv_user.get("emails", []) if e.get("value")),
                "",
            )
            if live:
                if fallback and live.lower() != fallback.lower():
                    logger.info(
                        "get_live_email: IBM Verify email %r differs from supplied %r "
                        "for user %s — using IBM Verify value",
                        live, fallback, verify_user_id,
                    )
                return live
        except Exception as exc:
            logger.warning(
                "get_live_email: SCIM fetch failed for %s (%s) — using fallback %r",
                verify_user_id, exc, fallback,
            )
        return fallback

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

    async def create_user(
        self,
        email: str,
        name: str,
        role: str,
        active: bool = True,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        username: Optional[str] = None,
    ) -> dict:
        """
        Create a workforce user in IBM Verify via SCIM.

        userName  — set to ``username`` if provided, otherwise falls back to ``email``.
                    The value is sent verbatim — no domain suffix is appended.
        name      — ``givenName`` / ``familyName`` are populated when first_name /
                    last_name are supplied; ``formatted`` always set to ``name``.
        """
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users"

        # Build the name block — always include formatted; add given/family when present
        name_block: dict = {"formatted": name}
        if first_name:
            name_block["givenName"] = first_name
        if last_name:
            name_block["familyName"] = last_name

        # userName is the IBM Verify login identifier — use the preferred username
        # exactly as typed, falling back to email if none was supplied.
        user_name = username.strip() if username and username.strip() else email

        body = {
            "schemas": [
                "urn:ietf:params:scim:schemas:core:2.0:User",
                "urn:ietf:params:scim:schemas:extension:ibm:2.0:User",
            ],
            "userName": user_name,
            "name": name_block,
            "emails": [{"value": email, "type": "work", "primary": True}],
            "active": active,
        }
        resp = await self._client.post(url, content=_json.dumps(body).encode("utf-8"), headers=headers)
        if not resp.is_success:
            logger.error("create_user failed: %s %s", resp.status_code, resp.text[:300])
        resp.raise_for_status()
        return resp.json()

    async def create_user_with_password(
        self,
        email: str,
        name: str,
        password: str,
        first_name: str = "",
        last_name: str = "",
    ) -> dict:
        """
        Create a Cloud Directory user in IBM Verify with an initial password
        and explicitly disable the pwdReset flag so IBM Verify does NOT force
        a password change on the user's first login.

        IBM Verify Cloud Directory sets pwdReset=true by default on admin-created
        accounts (treating any SCIM-created account as admin-provisioned).  We
        must set pwdReset=false in the IBM extension block at creation time, then
        immediately follow up with a PATCH to ensure the flag is persisted — some
        tenant configurations ignore the field on POST and require a PATCH to clear it.

        Used for customer self-registration so the user can log in immediately
        with the credentials they chose without being forced to set a new password.
        IBM Verify enforces the tenant's password complexity policy — a 400 is
        returned if the supplied password does not comply; that error is surfaced
        to the caller verbatim.
        """
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users"

        # Build the name sub-object
        name_parts: dict = {"formatted": name}
        if first_name:
            name_parts["givenName"] = first_name
        if last_name:
            name_parts["familyName"] = last_name

        body = {
            "schemas": [
                "urn:ietf:params:scim:schemas:core:2.0:User",
                "urn:ietf:params:scim:schemas:extension:ibm:2.0:User",
            ],
            "userName": email,
            "name": name_parts,
            "emails": [{"value": email, "type": "work", "primary": True}],
            "active": True,
            "password": password,
            # Explicitly tell IBM Verify this is a user-chosen password —
            # do NOT force a password change on first login.
            "urn:ietf:params:scim:schemas:extension:ibm:2.0:User": {
                "pwdReset": False,
            },
        }
        resp = await self._client.post(url, content=_json.dumps(body).encode("utf-8"), headers=headers)
        if not resp.is_success:
            logger.error("create_user_with_password failed: %s %s", resp.status_code, resp.text[:300])
        resp.raise_for_status()
        created = resp.json()
        user_id = created.get("id", "")

        # ── Follow-up PATCH to clear pwdReset ─────────────────────────────
        # Some IBM Verify tenant configurations ignore pwdReset on POST
        # (it is treated as a read-only attribute during creation).
        # A subsequent PATCH on the IBM extension block reliably clears it.
        if user_id:
            patch_url = f"{settings.verify_tenant_url}/v2.0/Users/{user_id}"
            patch_body = {
                "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
                "Operations": [
                    {
                        "op": "replace",
                        "path": "urn:ietf:params:scim:schemas:extension:ibm:2.0:User:pwdReset",
                        "value": False,
                    }
                ],
            }
            patch_resp = await self._client.patch(
                patch_url,
                content=_json.dumps(patch_body).encode("utf-8"),
                headers=headers,
            )
            if not patch_resp.is_success:
                # Non-fatal: log but do not block the registration.
                # The user may see a forced password change on first login if
                # the PATCH fails, but the account is still fully created.
                logger.warning(
                    "create_user_with_password: pwdReset PATCH failed for %s: %s %s",
                    user_id, patch_resp.status_code, patch_resp.text[:200],
                )
            else:
                logger.debug("create_user_with_password: pwdReset cleared for %s", user_id)

        return created

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
        Uses admin headers (ROPC if configured, else client_credentials) for the
        manageAuthFactors scope required by DELETE on factor registration endpoints.
        Raises on any unexpected HTTP error so the caller can surface the failure.
        """
        # Factor management APIs require manageAuthFactors scope — use admin token
        headers = await self._admin_headers()

        if factor_type == "fido2":
            # Use the tenant-wide endpoint and filter client-side by userId.
            # The per-RP endpoint ignores the userId query param server-side.
            url = f"{settings.verify_tenant_url}/v2.0/factors/fido2/registrations"
            r = await self._client.get(url, headers=headers)
            logger.info("FIDO2 list for unenroll: status=%s body=%s", r.status_code, r.text[:400])
            if r.status_code == 404:
                return
            r.raise_for_status()
            all_regs = r.json().get("fido2", r.json().get("registrations", []))
            regs = [reg for reg in all_regs if reg.get("userId") == verify_user_id]
            logger.info("FIDO2 regs for user %s: %s", verify_user_id, regs)
            for reg in regs:
                rid = reg.get("id")
                if rid:
                    dr = await self._client.delete(f"{url}/{rid}", headers=headers)
                    logger.info("FIDO2 delete %s: %s", rid, dr.status_code)
                    if not dr.is_success:
                        logger.warning("FIDO2 delete %s failed %s: %s", rid, dr.status_code, dr.text[:200])

        elif factor_type == "totp":
            url = f"{settings.verify_tenant_url}/v2.0/factors/totp/registrations"
            r = await self._client.get(url, params={"userId": verify_user_id}, headers=headers)
            logger.info("TOTP list for unenroll user=%s: status=%s body=%s", verify_user_id, r.status_code, r.text[:400])
            if r.status_code == 404:
                return
            r.raise_for_status()
            regs = r.json().get("totpRegistrations", r.json().get("registrations", []))
            logger.info("TOTP regs for user %s: %s", verify_user_id, regs)
            for reg in regs:
                rid = reg.get("id")
                if rid:
                    dr = await self._client.delete(f"{url}/{rid}", headers=headers)
                    logger.info("TOTP delete %s: %s %s", rid, dr.status_code, dr.text[:200])
                    if not dr.is_success:
                        logger.warning("TOTP delete %s failed %s: %s", rid, dr.status_code, dr.text[:200])

        elif factor_type == "push":
            # IBM Verify Authenticator registrations live under /v1.0/authenticators
            url = f"{settings.verify_tenant_url}/v1.0/authenticators"
            r = await self._client.get(url, params={"userId": verify_user_id}, headers=headers)
            logger.info("Push list for unenroll user=%s: status=%s body=%s", verify_user_id, r.status_code, r.text[:400])
            if r.status_code == 404:
                return
            r.raise_for_status()
            all_regs = r.json().get("authenticators", r.json().get("registrations", []))
            regs = [reg for reg in all_regs if reg.get("owner") == verify_user_id or reg.get("userId") == verify_user_id]
            logger.info("Push regs for user %s: %s", verify_user_id, regs)
            for reg in regs:
                rid = reg.get("id")
                if rid:
                    dr = await self._client.delete(f"{url}/{rid}", headers=headers)
                    logger.info("Push delete %s: %s %s", rid, dr.status_code, dr.text[:200])
                    if not dr.is_success:
                        logger.warning("Push delete %s failed %s: %s", rid, dr.status_code, dr.text[:200])

        elif factor_type == "email_otp":
            url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp"
            r = await self._client.get(
                url,
                params={"search": f'userId = "{verify_user_id}"'},
                headers=headers,
            )
            logger.info("EmailOTP list for unenroll user=%s: status=%s body=%s", verify_user_id, r.status_code, r.text[:400])
            if r.status_code == 404:
                return
            r.raise_for_status()
            for reg in r.json().get("emailotp", []):
                rid = reg.get("id")
                if rid:
                    dr = await self._client.delete(f"{url}/{rid}", headers=headers)
                    logger.info("EmailOTP delete %s: %s %s", rid, dr.status_code, dr.text[:200])
                    if not dr.is_success:
                        logger.warning("Email OTP delete %s failed %s: %s", rid, dr.status_code, dr.text[:200])

    async def get_enrolled_factors(self, verify_user_id: str) -> dict:
        """
        Return the authentication factors enrolled by a user from IBM Verify.
        Queries FIDO2, TOTP, push, and email OTP registrations for the given user.

        Returns a dict with keys fido2, totp, push, email_otp — each value is either
        False (not enrolled) or a list of device registration dicts:
            [{"id": str, "name": str, "created_at": str|None}]

        Uses admin ROPC token (same as unenroll_factor) so that IBM Verify
        honours the userId filter and returns per-user registrations.
        Falls back to client_credentials if no admin credentials are configured.
        """
        headers = await self._admin_headers()
        results: dict = {"fido2": False, "totp": False, "push": False, "email_otp": False}
        logger.info("get_enrolled_factors: querying IBM Verify for user %s", verify_user_id)

        def _parse_created(reg: dict):
            """Extract a registration timestamp from various IBM Verify field names."""
            for key in ("created", "createdAt", "lastUsed", "dateCreated", "modified", "modifiedAt"):
                val = reg.get(key)
                if val:
                    return str(val)
            return None

        try:
            # IBM Verify's per-RP endpoint (/v2.0/factors/fido2/relyingparties/{rpId}/registrations)
            # returns 404 for any RP ID that was not created through this specific app's
            # enrollment flow — including passkeys enrolled via IBM Verify's own portal.
            #
            # IBM Verify's FIDO2 registrations endpoint requires a search param to
            # return results for a specific user. Without it, total=0 even if data exists.
            # The correct form is: search=userId = "<id>"
            fido2_all_url = f"{settings.verify_tenant_url}/v2.0/factors/fido2/registrations"
            r = await self._client.get(
                fido2_all_url,
                params={"search": f'userId = "{verify_user_id}"'},
                headers=headers,
            )
            logger.info("FIDO2 registrations: status=%s body_preview=%s", r.status_code, r.text[:400])
            if r.status_code == 200:
                body = r.json()
                all_regs = body.get("fido2", body.get("registrations", []))
                # Also filter client-side as a safety net in case search is ignored
                regs = [reg for reg in all_regs if reg.get("userId") == verify_user_id]
                if not regs and all_regs:
                    # search was honoured server-side — all returned entries are for this user
                    regs = all_regs
                logger.info("FIDO2 regs for user %s: %d found", verify_user_id, len(regs))
                if regs:
                    results["fido2"] = [
                        {
                            "id": reg.get("id", ""),
                            "name": (
                                reg.get("attributes", {}).get("nickname")
                                or reg.get("friendlyName")
                                or reg.get("nickName")
                                or reg.get("attributes", {}).get("aaGuid", "")
                                or "Passkey device"
                            ),
                            "created_at": _parse_created(reg),
                        }
                        for reg in regs
                    ]
            else:
                logger.warning(
                    "FIDO2 registrations query returned %s for user %s: %s",
                    r.status_code, verify_user_id, r.text[:200],
                )
        except Exception as exc:
            logger.warning("FIDO2 registration query failed for user %s: %s", verify_user_id, exc)

        try:
            totp_url = f"{settings.verify_tenant_url}/v2.0/factors/totp/registrations"
            r = await self._client.get(totp_url, params={"userId": verify_user_id}, headers=headers)
            logger.info("TOTP registrations: status=%s body_preview=%s", r.status_code, r.text[:300])
            if r.status_code == 200:
                totp_data = r.json()
                all_totp = totp_data.get("totpRegistrations", totp_data.get("registrations", []))
                # IBM Verify may ignore the userId param — filter client-side
                regs = [reg for reg in all_totp if reg.get("userId") == verify_user_id or reg.get("owner") == verify_user_id]
                # If filtering yields nothing but total is non-zero, the param was honoured
                if not regs and all_totp:
                    regs = all_totp  # server already filtered — trust it
                logger.info("TOTP regs for user %s: %d of %d", verify_user_id, len(regs), len(all_totp))
                if regs:
                    results["totp"] = [
                        {
                            "id": reg.get("id", ""),
                            "name": (
                                reg.get("friendlyName")
                                or reg.get("accountName")
                                or "Authenticator App"
                            ),
                            "created_at": _parse_created(reg),
                        }
                        for reg in regs
                    ]
            # 404 = no TOTP enrollment exists — treat as not enrolled (not an error)
            elif r.status_code != 404:
                logger.warning("TOTP registration query returned %s for user %s", r.status_code, verify_user_id)
        except Exception as exc:
            logger.warning("TOTP registration query failed for user %s: %s", verify_user_id, exc)

        try:
            # IBM Verify Authenticator (push notification) registrations live under
            # /v1.0/authenticators keyed by "owner" (not /v2.0/factors/push/registrations
            # which 404s unless the push factor was enrolled via the v2 API directly).
            push_url = f"{settings.verify_tenant_url}/v1.0/authenticators"
            r = await self._client.get(push_url, params={"userId": verify_user_id}, headers=headers)
            logger.info("Push registrations: status=%s body_preview=%s", r.status_code, r.text[:300])
            if r.status_code == 200:
                push_data = r.json()
                regs = push_data.get("authenticators", push_data.get("registrations", []))
                # Filter by owner in case the server ignores the param
                regs = [reg for reg in regs if reg.get("owner") == verify_user_id or reg.get("userId") == verify_user_id]
                if regs:
                    results["push"] = [
                        {
                            "id": reg.get("id", ""),
                            "name": (
                                reg.get("attributes", {}).get("deviceName")
                                or reg.get("attributes", {}).get("accountName")
                                or reg.get("friendlyName")
                                or reg.get("attributes", {}).get("platformType")
                                or "Mobile device"
                            ),
                            "created_at": reg.get("creationTime") or _parse_created(reg),
                        }
                        for reg in regs
                    ]
            elif r.status_code != 404:
                logger.warning("Push registration query returned %s for user %s", r.status_code, verify_user_id)
        except Exception as exc:
            logger.warning("Push registration query failed for user %s: %s", verify_user_id, exc)

        try:
            email_otp_url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp"
            # IBM Verify requires the search value to be quoted: userId = "xxx"
            r = await self._client.get(
                email_otp_url,
                params={"search": f'userId = "{verify_user_id}"'},
                headers=headers,
            )
            logger.info("Email OTP registrations: status=%s body_preview=%s", r.status_code, r.text[:300])
            if r.status_code == 200:
                regs = r.json().get("emailotp", [])
                enabled_regs = [e for e in regs if e.get("enabled") or e.get("validated")]
                effective = enabled_regs if enabled_regs else regs
                if effective:
                    results["email_otp"] = [
                        {
                            "id": reg.get("id", ""),
                            "name": (
                                reg.get("attributes", {}).get("emailAddress")
                                or reg.get("emailAddress")
                                or reg.get("email")
                                or "Email OTP"
                            ),
                            "created_at": _parse_created(reg),
                        }
                        for reg in effective
                    ]
            elif r.status_code != 404:
                logger.warning("Email OTP query returned %s for user %s: %s", r.status_code, verify_user_id, r.text[:200])
        except Exception as exc:
            logger.warning("Email OTP registration query failed for user %s: %s", verify_user_id, exc)

        logger.info(
            "get_enrolled_factors RESULT for %s: fido2=%s totp=%s push=%s email_otp=%s",
            verify_user_id,
            bool(results["fido2"]), bool(results["totp"]), bool(results["push"]), bool(results["email_otp"]),
        )
        return results

    # ── TOTP ──────────────────────────────────────────────────────────────

    def _user_token_headers(self, user_access_token: Optional[str]) -> Optional[dict]:
        """
        Return auth headers using the user's own IBM Verify access token, or None
        if no token is available (caller should fall back to service token).
        IBM Verify's /v2.0/factors/* enrollment APIs are user-scoped — they return
        403 CSIAK4300E when called with a client_credentials service token even if
        the token carries manageAuthFactors scope.  The user-context token obtained
        during OIDC login is the correct credential for these calls.
        """
        if not user_access_token:
            return None
        return {
            "Authorization": f"Bearer {user_access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def totp_enroll(self, user_id: str, user_access_token: Optional[str] = None) -> dict:
        """
        Enroll TOTP for a user. Returns transaction_id + otpauth URI.

        When called with the user's own OIDC token (user_access_token), IBM Verify
        identifies the user from the token sub — the body must be empty ({}).
        Sending userId in the body causes a 400 "request body is invalid: userId".

        Falls back to admin ROPC token with userId in body when no user token is
        available (admin-initiated enrollment path).
        """
        url = f"{settings.verify_tenant_url}/v2.0/factors/totp/verifications"

        if user_access_token:
            # User-context call: IBM Verify reads userId from the token sub.
            # Body must be empty — sending userId causes a 400.
            headers = self._user_token_headers(user_access_token)
            resp = await self._client.post(url, json={}, headers=headers)
            # Stale token (401) → retry with admin token + explicit userId
            if resp.status_code == 401:
                logger.info("TOTP enroll: user token 401 (stale) — retrying with admin token")
                headers = await self._admin_headers()
                resp = await self._client.post(url, json={"userId": user_id}, headers=headers)
        else:
            # Admin/service call: must supply userId explicitly.
            headers = await self._admin_headers()
            resp = await self._client.post(url, json={"userId": user_id}, headers=headers)

        if not resp.is_success:
            logger.error("TOTP enroll error %s: %s", resp.status_code, resp.text)
        resp.raise_for_status()
        return resp.json()

    async def totp_challenge(self, user_id: str, user_access_token: Optional[str] = None) -> dict:
        """
        Initiate a TOTP verification challenge for an already-enrolled user.
        Returns a transaction_id the user completes by supplying their OTP code.
        Same body rules as totp_enroll: empty body with user token, userId with admin token.
        """
        url = f"{settings.verify_tenant_url}/v2.0/factors/totp/verifications"
        if user_access_token:
            headers = self._user_token_headers(user_access_token)
            resp = await self._client.post(url, json={}, headers=headers)
            if resp.status_code == 401:
                headers = await self._admin_headers()
                resp = await self._client.post(url, json={"userId": user_id}, headers=headers)
        else:
            headers = await self._admin_headers()
            resp = await self._client.post(url, json={"userId": user_id}, headers=headers)
        if not resp.is_success:
            logger.error("TOTP challenge error %s: %s", resp.status_code, resp.text)
        resp.raise_for_status()
        return resp.json()

    async def totp_verify(self, transaction_id: str, otp_code: str, user_access_token: Optional[str] = None) -> dict:
        """
        Verify TOTP code. IBM Verify: POST /v2.0/factors/totp/verifications/{id}
        Body: {"otp": "<code>"} — same for both user-context and admin tokens.
        """
        headers = self._user_token_headers(user_access_token) or await self._admin_headers()
        url = f"{settings.verify_tenant_url}/v2.0/factors/totp/verifications/{transaction_id}"
        resp = await self._client.post(url, json={"otp": otp_code}, headers=headers)
        if not resp.is_success:
            logger.error("TOTP verify error %s: %s", resp.status_code, resp.text)
        resp.raise_for_status()
        return resp.json()

    # ── Push Notifications ────────────────────────────────────────────────

    async def push_initiate(self, user_id: str) -> dict:
        """
        Send a push notification to the user's enrolled IBM Verify Authenticator.

        IBM Verify SaaS does NOT expose /v2.0/factors/push/verifications on most
        tenants (returns 404).  The correct flow uses:

          1. GET  /v1.0/authnmethods/signatures?authenticatorId={auth_id}
                → fetch the signature method id (subType=userPresence)
          2. POST /v1.0/authenticators/{auth_id}/verifications
                → body: { logic, expiresIn, authenticationMethods, transactionData, pushNotification }
                → returns { id (transaction_id), state: PENDING, authenticatorId, ... }

        Returns the verification dict with an extra "_authenticator_id" key so
        push_poll can build the correct poll URL.
        """
        headers = await self._admin_headers()
        base = settings.verify_tenant_url

        # 1. Find the user's authenticator registration
        reg_resp = await self._client.get(
            f"{base}/v1.0/authenticators",
            params={"userId": user_id},
            headers=headers,
        )
        reg_resp.raise_for_status()
        authenticators = reg_resp.json().get("authenticators", [])
        active = [a for a in authenticators
                  if a.get("owner") == user_id and a.get("enabled") and a.get("state") == "ACTIVE"]
        if not active:
            raise ValueError(f"No active IBM Verify Authenticator found for user {user_id}")
        auth_id = active[0]["id"]

        # 2. Fetch the signature method id for this authenticator
        sig_resp = await self._client.get(
            f"{base}/v1.0/authnmethods/signatures",
            params={"authenticatorId": auth_id},
            headers=headers,
        )
        sig_resp.raise_for_status()
        signatures = sig_resp.json().get("signatures", [])
        if not signatures:
            raise ValueError(f"No signature methods found for authenticator {auth_id}")
        sig_id = signatures[0]["id"]

        # 3. Create the push verification transaction
        body = {
            "logic": "OR",
            "expiresIn": 120,
            "authenticationMethods": [{"id": sig_id, "methodType": "signature"}],
            "transactionData": {
                "message": "MockBank step-up verification",
                "originIpAddress": "127.0.0.1",
                "originUserAgent": "MockBank/1.0",
            },
            "pushNotification": {
                "title": "MockBank Verification",
                "message": "Tap Approve to complete your MockBank step-up verification.",
                "send": True,
            },
        }
        vfy_resp = await self._client.post(
            f"{base}/v1.0/authenticators/{auth_id}/verifications",
            json=body,
            headers=headers,
        )
        vfy_resp.raise_for_status()
        result = vfy_resp.json()
        # Embed authenticator_id so push_poll can build the correct URL
        result["_authenticator_id"] = auth_id
        logger.info(
            "push_initiate: tx=%s auth=%s state=%s",
            result.get("id"), auth_id, result.get("state"),
        )
        return result

    async def push_poll(self, transaction_id: str, authenticator_id: str = "") -> dict:
        """
        Poll the push verification transaction for status.

        Requires the authenticator_id to build the correct v1.0 URL.
        Falls back gracefully when authenticator_id is absent.
        """
        headers = await self._admin_headers()
        base = settings.verify_tenant_url

        if authenticator_id:
            url = f"{base}/v1.0/authenticators/{authenticator_id}/verifications/{transaction_id}"
        else:
            # Fallback: try to locate the authenticator by listing verifications
            # This path is less efficient but handles legacy callers.
            url = f"{base}/v1.0/authenticators/{transaction_id}/verifications/{transaction_id}"

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

        IBM Verify stores the email inside ``attributes.emailAddress`` (not the
        top-level ``emailAddress`` field which is always null in list responses).
        The individual GET /emailotp/{id} response also uses attributes.emailAddress.

        If the user has multiple enrollments (e.g. created after an email change),
        the one whose attributes.emailAddress matches the current ``email`` is
        preferred.  If none match, the newest enrollment is chosen and updated
        via PUT to the correct address.

        The search param IBM Verify requires for this endpoint is:
          ?search=userId = "655001CSOJ"   (with quotes around the value)
        Both the unquoted and quoted forms are tried; if search returns 400
        the method falls back to listing all enrollments and filtering client-side.
        """
        headers = await self._headers()
        list_url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp"

        def _extract_email(enrollment: dict) -> str:
            """IBM Verify puts the address inside attributes.emailAddress."""
            return (
                enrollment.get("attributes", {}).get("emailAddress")
                or enrollment.get("emailAddress")
                or ""
            )

        async def _fetch_all_for_user() -> list[dict]:
            """
            Return all emailotp enrollments belonging to user_id.
            Tries the IBM Verify search param first; falls back to a full
            list + client-side filter when search returns 400.
            """
            # IBM Verify requires quoted values: search=userId = "id"
            for search_val in (
                f'userId = "{user_id}"',
                f"userId={user_id}",
            ):
                r = await self._client.get(
                    list_url,
                    params={"search": search_val},
                    headers=headers,
                )
                logger.debug(
                    "_email_otp_get_or_create_enrollment search=%r → %s %s",
                    search_val, r.status_code, r.text[:300],
                )
                if r.is_success:
                    all_e = r.json().get("emailotp", [])
                    # Server may or may not honour the filter — always filter client-side
                    matching = [e for e in all_e if str(e.get("userId", "")) == user_id]
                    return matching if matching else all_e

            # Both search forms failed — list everything and filter
            logger.debug("_email_otp_get_or_create_enrollment: search failed, listing all")
            r2 = await self._client.get(list_url, headers=headers)
            if r2.is_success:
                return [e for e in r2.json().get("emailotp", [])
                        if str(e.get("userId", "")) == user_id]
            return []

        # ── 1. Find existing enrollments ──────────────────────────────────
        enrollments = await _fetch_all_for_user()

        if enrollments:
            # Sort newest first so we always prefer the most recently created one
            enrollments.sort(key=lambda e: e.get("created", ""), reverse=True)

            # Prefer an enrollment whose address already matches the current email
            exact = next(
                (e for e in enrollments if _extract_email(e).lower() == email.lower()),
                None,
            )
            chosen = exact or enrollments[0]
            eid = str(chosen["id"])
            enrolled_email = _extract_email(chosen)

            if enrolled_email.lower() != email.lower():
                # Address is stale — update the enrollment to the current email.
                # IBM Verify stores the email inside the attributes block.
                logger.info(
                    "_email_otp_get_or_create_enrollment: updating enrollment %s "
                    "email %r → %r for user %s",
                    eid, enrolled_email, email, user_id,
                )
                put_resp = await self._client.put(
                    f"{list_url}/{eid}",
                    json={
                        "userId": user_id,
                        "attributes": {"emailAddress": email},
                        "enabled": True,
                        "validated": True,
                    },
                    headers=headers,
                )
                if not put_resp.is_success:
                    logger.warning(
                        "_email_otp_get_or_create_enrollment: PUT to update email failed "
                        "%s %s — OTP may go to old address",
                        put_resp.status_code, put_resp.text[:200],
                    )
                else:
                    logger.info(
                        "_email_otp_get_or_create_enrollment: enrollment email updated "
                        "successfully for user %s", user_id,
                    )
            return eid

        # ── 2. No enrollment found — create one ───────────────────────────
        logger.debug("Creating email OTP enrollment for user %s email %r", user_id, email)
        create_resp = await self._client.post(
            list_url,
            json={"userId": user_id, "attributes": {"emailAddress": email}},
            headers=headers,
        )

        # 409 = enrollment already exists — re-fetch
        if create_resp.status_code == 409:
            logger.debug(
                "Email OTP enrollment 409 for user %s — re-fetching existing enrollment",
                user_id,
            )
            enrollments = await _fetch_all_for_user()
            if enrollments:
                enrollments.sort(key=lambda e: e.get("created", ""), reverse=True)
                return str(enrollments[0]["id"])
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

    async def email_otp_send(self, user_id: str, email: str, user_access_token: Optional[str] = None) -> dict:
        """
        Send an OTP to the user's registered email address and return the IBM
        Verify transaction object **plus** the exact bearer token string that
        created it (keyed as ``_auth_token``).

        The caller MUST pass ``_auth_token`` back to ``email_otp_verify`` via
        its ``winning_token`` parameter so both calls use the identical token.
        IBM Verify scopes pending OTP transactions to the auth context of the
        token that created the POST — any other token returns 404 on PUT verify.

        IBM Verify endpoint:
          POST /v2.0/factors/emailotp/{enrollmentId}/verifications

        Token attempt order
        ───────────────────
        1. User's own ibm_access_token (sub = enrollment userId — always works
           when the OIDC token has not yet expired, typically ~1 h).
        2. Service token (client_credentials + delegatedAuthFactors scope).
        3. Service token with explicit userId body (some tenant configs need it).
        """
        eid = await self._email_otp_get_or_create_enrollment(user_id, email)
        url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp/{eid}/verifications"

        # Build candidate list: (headers_dict, body_dict, label)
        candidates: list[tuple[dict, dict, str]] = []

        user_hdrs = self._user_token_headers(user_access_token)
        if user_hdrs:
            candidates.append((user_hdrs, {}, "user-token"))

        svc_token = await self._get_access_token()
        svc_hdrs = {
            "Authorization": f"Bearer {svc_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        candidates.append((svc_hdrs, {}, "svc-token-nobody"))
        candidates.append((svc_hdrs, {"userId": user_id}, "svc-token-userid"))

        for hdrs, body, label in candidates:
            resp = await self._client.post(url, json=body, headers=hdrs)
            logger.debug("Email OTP send (%s) → %s %s", label, resp.status_code, resp.text[:200])
            if resp.is_success:
                result = resp.json()
                # Embed the winning token AND enrollment_id so verify can use
                # the exact same auth context and correct URL path.
                result["_auth_token"] = hdrs["Authorization"].split(" ", 1)[1]
                result["_enrollment_id"] = eid
                logger.info("Email OTP send succeeded via %s, tx=%s eid=%s", label, result.get("id"), eid)
                return result
            logger.warning("Email OTP send (%s) → %s — trying next", label, resp.status_code)

        logger.error("Email OTP send: all attempts failed for user %s", user_id)
        resp.raise_for_status()  # raise on the last response
        return resp.json()  # unreachable, satisfies type checker

    async def email_otp_verify(
        self,
        transaction_id: str,
        otp_code: str,
        user_access_token: Optional[str] = None,
        winning_token: Optional[str] = None,
        enrollment_id: Optional[str] = None,
    ) -> dict:
        """
        Verify the OTP code the user received by email.

        IBM Verify endpoint (correct path — enrollment ID is required):
          POST /v2.0/factors/emailotp/{enrollmentId}/verifications/{transactionId}
        Body: { "otp": "<code>" }

        Pass ``winning_token`` (the ``_auth_token`` value returned by
        ``email_otp_send``) to guarantee this call uses the exact same auth
        context.  Falls back to the user token then the service token when
        ``winning_token`` is absent.
        """
        if not enrollment_id:
            # Fallback: flat verifications path — works on some IBM Verify tenants
            # but the preferred path includes the enrollment ID.
            logger.warning(
                "email_otp_verify: no enrollment_id for tx=%s — using flat path (may 404)",
                transaction_id,
            )
            url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp/verifications/{transaction_id}"
        else:
            url = f"{settings.verify_tenant_url}/v2.0/factors/emailotp/{enrollment_id}/verifications/{transaction_id}"
        body = {"otp": otp_code}

        # Build candidate list in the same order as send, but put winning_token first
        candidates: list[tuple[dict, str]] = []

        if winning_token:
            candidates.append((
                {"Authorization": f"Bearer {winning_token}", "Content-Type": "application/json", "Accept": "application/json"},
                "winning-token",
            ))

        user_hdrs = self._user_token_headers(user_access_token)
        if user_hdrs:
            candidates.append((user_hdrs, "user-token"))

        svc_token = await self._get_access_token()
        svc_hdrs = {
            "Authorization": f"Bearer {svc_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        candidates.append((svc_hdrs, "svc-token"))

        for hdrs, label in candidates:
            resp = await self._client.post(url, json=body, headers=hdrs)
            logger.warning(
                "Email OTP verify (%s) → %s  body=%s",
                label, resp.status_code, resp.text[:400],
            )
            if resp.is_success:
                logger.info("Email OTP verify succeeded via %s", label)
                # IBM Verify returns 200 with an empty body on success — guard against that
                return resp.json() if resp.content else {}

        logger.error("Email OTP verify: all attempts failed, tx=%s", transaction_id)
        resp.raise_for_status()
        return {}  # unreachable

    # ── OIDC / SSO ────────────────────────────────────────────────────────

    async def check_userinfo_active(self, access_token: str) -> bool:
        """
        Verify the OIDC access_token still has the scopes MockBank requires
        by calling IBM Verify's /userinfo endpoint and inspecting the response.

        Why /userinfo + content check (not token introspection):
          - Introspection returns active=true even after consent is revoked on
            IBM Verify's self-service privacy page (token stays technically valid).
          - /userinfo enforces scope auth on every call. Revoking email or
            profile consent causes IBM Verify to either return 401 OR return 200
            with those claims stripped from the response body.
          - We check BOTH: status code AND whether the required claims are present.

        MockBank requires both `email` and `sub` to function:
          - `email`  is the user's identity key in the local DB.
          - `sub`    is the IBM Verify user ID bound to the JWT.
          - Revoking either `email` or `profile` scope drops those claims.

        From the IBM Verify privacy page the user sees two revocable rows:
          • MockBank POC / OpenID Connect scopes / email
          • MockBank POC / OpenID Connect scopes / profile
        Revoking either must terminate the MockBank session immediately.

        Returns:
          True  — /userinfo 200 AND both sub+email present → session valid.
          False — 401/403, OR 200 but email/sub missing → consent revoked.

        Fail-open on 5xx / network errors to avoid spurious logouts.
        """
        userinfo_url = f"{settings.verify_tenant_url}/v1.0/endpoint/default/userinfo"
        try:
            resp = await self._client.get(
                userinfo_url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
            )
        except Exception as exc:
            logger.warning("check_userinfo_active: network error — treating as active. exc=%s", exc)
            return True  # fail open on connectivity issues

        # 401 / 403 → IBM Verify explicitly rejected the token / scopes
        if resp.status_code in (401, 403):
            logger.warning(
                "check_userinfo_active: /userinfo returned %s — OIDC consent revoked.",
                resp.status_code,
            )
            return False

        # 5xx or unexpected status → infra problem, fail open
        if not resp.is_success:
            logger.warning(
                "check_userinfo_active: /userinfo returned %s — treating as active. body=%s",
                resp.status_code, resp.text[:200],
            )
            return True

        # 200 — check the response body for required claims.
        # IBM Verify may return 200 with claims stripped when a specific
        # scope consent is revoked (e.g. email revoked → no email claim).
        try:
            claims = resp.json()
        except Exception:
            logger.warning("check_userinfo_active: could not parse /userinfo JSON — treating as active")
            return True

        sub   = claims.get("sub")
        email = claims.get("email")

        logger.debug(
            "check_userinfo_active: /userinfo 200 — sub=%s email_present=%s",
            sub, bool(email),
        )

        # sub missing → openid scope revoked (unlikely but fatal)
        if not sub:
            logger.warning("check_userinfo_active: sub missing from /userinfo — openid scope revoked")
            return False

        # email missing → email scope revoked → MockBank cannot identify the user
        if not email:
            logger.warning("check_userinfo_active: email missing from /userinfo — email scope revoked")
            return False

        return True

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

    # ── Group CRUD ────────────────────────────────────────────────────────────

    async def list_groups(self) -> dict:
        """List all IBM Verify SCIM groups with their members."""
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Groups"
        resp = await self._client.get(url, params={"count": 100}, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        resources = data.get("Resources", [])
        groups = []
        for g in resources:
            members = g.get("members", [])
            groups.append({
                "id": g.get("id", ""),
                "displayName": g.get("displayName", ""),
                "memberCount": len(members),
                "members": [
                    {"id": m.get("value", ""), "display": m.get("display", "")}
                    for m in members
                ],
            })
        return {"total": len(groups), "groups": groups}

    async def get_group(self, group_id: str) -> dict:
        """Fetch a single IBM Verify group by ID."""
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Groups/{group_id}"
        resp = await self._client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def create_group(self, display_name: str, description: str = "") -> dict:
        """Create a new IBM Verify SCIM group."""
        import json as _json2
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Groups"
        body = {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:Group"],
            "displayName": display_name,
        }
        if description:
            body["externalId"] = description
        resp = await self._client.post(
            url, content=_json2.dumps(body).encode("utf-8"), headers=headers
        )
        if not resp.is_success:
            logger.error("create_group failed: %s %s", resp.status_code, resp.text[:300])
        resp.raise_for_status()
        data = resp.json()
        return {
            "id": data.get("id", ""),
            "displayName": data.get("displayName", display_name),
            "memberCount": 0,
            "members": [],
        }

    async def delete_group(self, group_id: str) -> None:
        """Delete an IBM Verify SCIM group by ID."""
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Groups/{group_id}"
        resp = await self._client.delete(url, headers=headers)
        if not resp.is_success and resp.status_code != 404:
            logger.error("delete_group %s failed: %s %s", group_id, resp.status_code, resp.text[:200])
            resp.raise_for_status()

    async def update_user_phone(self, verify_user_id: str, phone: str) -> None:
        """
        Update a user's phone number in IBM Verify via SCIM PATCH.
        Non-fatal — callers should catch and log exceptions rather than surfacing them.
        """
        headers = await self._user_headers()
        url = f"{settings.verify_tenant_url}/v2.0/Users/{verify_user_id}"
        body = {
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            "Operations": [
                {
                    "op": "replace",
                    "path": "phoneNumbers",
                    "value": [{"value": phone, "type": "mobile", "primary": True}],
                }
            ],
        }
        patch_headers = {
            "Authorization": headers["Authorization"],
            "Content-Type": "application/scim+json",
            "Accept": "application/scim+json",
        }
        resp = await self._client.patch(url, content=_json.dumps(body).encode("utf-8"), headers=patch_headers)
        if not resp.is_success:
            logger.warning(
                "update_user_phone PATCH failed for %s: %s %s",
                verify_user_id, resp.status_code, resp.text[:200],
            )

    async def get_user_activity(self, verify_user_id: str, limit: int = 20) -> list[dict]:
        """
        Fetch recent authentication events for a specific user from IBM Verify.
        Tries the /v1.0/events endpoint filtered by userId.
        Returns a normalized list of event dicts for display in the Engage tab.
        Falls back to empty list on any error.
        """
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v1.0/events"
        try:
            resp = await self._client.get(
                url,
                params={"userId": verify_user_id, "count": limit, "sortOrder": "descending"},
                headers=headers,
            )
            if resp.status_code == 404:
                logger.debug("IBM Verify /v1.0/events not available — returning empty list")
                return []
            if not resp.is_success:
                logger.warning("get_user_activity returned %s for user %s", resp.status_code, verify_user_id)
                return []
            data = resp.json()
            events = data if isinstance(data, list) else data.get("events", data.get("response", []))
            # Normalise each event to a consistent shape
            result = []
            for ev in events[:limit]:
                if not isinstance(ev, dict):
                    continue
                result.append({
                    "time": ev.get("time") or ev.get("created") or ev.get("timestamp") or "",
                    "action": ev.get("action") or ev.get("eventType") or ev.get("type") or "event",
                    "actor": (ev.get("actor") or {}).get("displayName") or ev.get("actorId") or "—",
                    "target": (ev.get("target") or {}).get("displayName") or ev.get("targetId") or "",
                    "outcome": ev.get("outcome") or ev.get("result") or "",
                    "ip": ev.get("ipAddress") or ev.get("ip") or "",
                })
            return result
        except Exception as exc:
            logger.warning("get_user_activity failed for user %s: %s", verify_user_id, exc)
            return []

    # ── IBM Verify Activity Log ───────────────────────────────────────────────

    async def get_activity_log(self, limit: int = 50) -> list[dict]:
        """
        Fetch recent activity events from IBM Verify.
        Uses /v1.0/events (Reports / Activity) endpoint.
        Falls back to empty list on any error so the admin UI degrades gracefully.
        """
        headers = await self._headers()
        url = f"{settings.verify_tenant_url}/v1.0/events"
        try:
            resp = await self._client.get(
                url,
                params={"count": limit, "sortOrder": "descending"},
                headers=headers,
            )
            if resp.status_code == 404:
                logger.debug("IBM Verify /v1.0/events not available — returning empty list")
                return []
            resp.raise_for_status()
            data = resp.json()
            events = data if isinstance(data, list) else data.get("events", data.get("response", []))
            return events[:limit]
        except Exception as exc:
            logger.warning("get_activity_log failed: %s", exc)
            return []

    async def close(self):
        await self._client.aclose()


verify_client = VerifyClient()
