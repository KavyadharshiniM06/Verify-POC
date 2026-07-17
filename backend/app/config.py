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
    post_logout_redirect_uri: str
    fido2_rp_id: str
    fido2_rp_origin: str
    jwt_secret: str
    ngrok_authtoken: Optional[str] = None
    # Admin credentials for ROPC token (factor API calls)
    verify_admin_username: Optional[str] = None
    verify_admin_password: Optional[str] = None

    class Config:
        env_file = str(_ENV_FILE)


settings = Settings()
