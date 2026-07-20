from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings

# Resolve .env from the project root (two levels up from this file)
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    verify_tenant_url: str
    # OIDC application credentials (authorization_code flow — login/SSO)
    verify_client_id: str
    verify_client_secret: str
    # API client credentials (client_credentials flow — backend service calls)
    # Falls back to the OIDC client if not set
    verify_api_client_id: Optional[str] = None
    verify_api_client_secret: Optional[str] = None
    verify_oidc_issuer: str
    verify_oidc_authorize_url: str
    verify_oidc_token_url: str
    verify_oidc_jwks_url: str
    verify_oidc_logout_url: Optional[str] = None
    verify_group_claim: str = "groups"
    frontend_base_url: str
    oidc_redirect_uri: str
    # Step-up redirect URI — defaults to the same base as oidc_redirect_uri but at /stepup-callback.
    # Add both /callback and /stepup-callback to your IBM Verify application's Redirect URIs list.
    stepup_redirect_uri: Optional[str] = None
    post_logout_redirect_uri: str
    fido2_rp_id: str
    fido2_rp_origin: str
    jwt_secret: str
    ngrok_authtoken: Optional[str] = None
    # Admin credentials for ROPC token (factor API calls)
    verify_admin_username: Optional[str] = None
    verify_admin_password: Optional[str] = None
    # Comma-separated emails that are always granted Admin role at login.
    # Used when IBM Verify group membership is not included in the ID token.
    admin_emails: str = ""

    # ── SMTP — optional, used to email temp passwords on admin-initiated reset ─
    # If smtp_host is not set, temp password emails are skipped (admin must
    # share the password shown in the modal manually).
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from: str = "noreply@mockbank.local"
    smtp_use_tls: bool = True

    # ── Step-up authentication thresholds ────────────────────────────────
    # ACR value sent to IBM Verify during step-up.
    # Set this to the Policy ID / ACR value of your "second factor only" access policy.
    # Find it in IBM Verify → Security → Access Policies → your policy → copy the ACR value.
    stepup_acr: str = "urn:ibm:security:authentication:asf:any_secondfactor"

    # Dollar amount above which a transfer requires a fresh step-up challenge.
    # Set to 0 to require step-up for ALL transfers.
    transfer_stepup_threshold: float = 100.0

    # How long (minutes) a step-up token remains valid after issue.
    # After this window the user must re-verify even if their session is active.
    stepup_duration_minutes: int = 10

    # When True, every admin operation (create/update/disable/delete user) requires
    # a valid step-up even if the admin already completed one earlier in the session.
    admin_always_stepup: bool = True

    # When True, deleting one's own account requires step-up.
    delete_account_stepup: bool = True

    class Config:
        env_file = str(_ENV_FILE)


settings = Settings()
