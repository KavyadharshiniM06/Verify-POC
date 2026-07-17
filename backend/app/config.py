from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    verify_tenant_url: str
    verify_client_id: str
    verify_client_secret: str
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

    class Config:
        env_file = ".env"


settings = Settings()
