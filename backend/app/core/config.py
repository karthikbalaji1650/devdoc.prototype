from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Same environment variable names the Node API read, so existing
    deployments and docker-compose files keep working unchanged."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str | None = None
    # Test management (and other data that used to live in the browser).
    redis_url: str | None = None

    # Kept as a raw string: Node only treated the exact value "true" as on
    # (COOKIE_SECURE === 'true'), so "1" or "yes" must stay off here too.
    cookie_secure: str = ""
    cors_origins: str = ""

    gemini_api_key: str = ""
    gemini_model: str = ""
    openai_api_key: str = ""
    openai_model: str = ""

    # 32 random bytes, base64: encrypts stored test-server credentials
    # (AES-256-GCM, DDS-SRS-075). Unset, servers without credentials still work.
    secrets_key: str = ""

    # The background worker that polls remote test runs (DDS-SRS-021).
    # Tests turn it off and drive polling directly.
    remote_poll_enabled: bool = True

    # The code editor's file bridge (sandbox/file_bridge.py), for cloning
    # existing repositories into its workspace (DDS-SRS-030), and the token
    # it requires if BRIDGE_TOKEN is set there too.
    bridge_url: str = ""
    bridge_token: str = ""

    # JWT access tokens (DDS-SRS-076): HS256 key, at least 32 bytes. Without
    # it the key is derived from SECRETS_KEY; with neither, JWTs are off.
    jwt_secret: str = ""

    # Single sign-on over OpenID Connect (DDS-SRS-076). Set the first four to
    # turn it on; OIDC_REDIRECT_URI is this API's /api/auth/sso/callback.
    oidc_issuer: str = ""
    oidc_client_id: str = ""
    oidc_client_secret: str = ""
    oidc_redirect_uri: str = ""
    oidc_scopes: str = ""
    oidc_provider_name: str = ""  # the button says "Sign in with <this>"
    oidc_post_login_url: str = ""  # where the browser lands after; default: the first CORS origin

    @property
    def cookie_secure_enabled(self) -> bool:
        return self.cookie_secure == "true"

    @property
    def cors_origin_list(self) -> list[str]:
        return [s.strip() for s in self.cors_origins.split(",") if s.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
