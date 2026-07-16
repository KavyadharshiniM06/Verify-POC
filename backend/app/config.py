from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    verify_tenant_url: str
    verify_client_id: str
    verify_client_secret: str
    verify_oidc_issuer: str
    fido2_rp_id: str
    fido2_rp_origin: str
    jwt_secret: str

    class Config:
        env_file = ".env"


settings = Settings()
