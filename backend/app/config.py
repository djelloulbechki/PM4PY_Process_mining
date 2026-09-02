from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    redis_url: str = "redis://redis:6379/0"

    datasets_bucket: str = "datasets"
    artifacts_bucket: str = "artifacts"

    max_preview_bytes: int = 1_048_576
    max_upload_bytes: int = 524_288_000  # 500 MB
    default_max_rows: int = 100_000

    cors_origins: str = "http://localhost:3000"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    log_level: str = "INFO"

    # Signed URL lifetime for artifacts (seconds)
    artifact_signed_url_ttl: int = 3600

    connector_encryption_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
