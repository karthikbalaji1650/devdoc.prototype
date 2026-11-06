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

    @property
    def cookie_secure_enabled(self) -> bool:
        return self.cookie_secure == "true"

    @property
    def cors_origin_list(self) -> list[str]:
        return [s.strip() for s in self.cors_origins.split(",") if s.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
