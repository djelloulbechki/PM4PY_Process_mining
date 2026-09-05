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
    artifact_signed_url_ttl: int = 3600
    connector_encryption_key: str = ""

    # ──────────────────────────────────────────────────────────────
    # Stripe Billing (Pay-As-You-Go)
    # ──────────────────────────────────────────────────────────────
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_publishable_key: str = ""
    frontend_url: str = "http://localhost:3000"

    # Stripe Product IDs (for reference / admin UI)
    stripe_product_standard: str = ""
    stripe_product_pro: str = ""
    stripe_product_scale: str = ""

    # Stripe Price IDs (ONE-TIME payments)
    stripe_price_standard: str = ""
    stripe_price_pro: str = ""
    stripe_price_scale: str = ""

    # Tier definitions (business logic)
    tier_definitions: dict = {
        "standard": {
            "name": "Standard Pass",
            "price_usd": 49,
            "max_rows": 50000,
            "max_file_size_bytes": 15728640,  # 15 MB
            "credits": 1,
        },
        "pro": {
            "name": "Pro Pass",
            "price_usd": 99,
            "max_rows": 150000,
            "max_file_size_bytes": 41943040,  # 40 MB
            "credits": 1,
        },
        "scale": {
            "name": "Scale Pass",
            "price_usd": 199,
            "max_rows": 600000,
            "max_file_size_bytes": 125829120,  # 120 MB
            "credits": 1,
        },
    }

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]

    @property
    def stripe_configured(self) -> bool:
        return bool(self.stripe_secret_key and self.stripe_webhook_secret)

    def price_id_for_tier(self, tier: str) -> str | None:
        """Return the Stripe Price ID for a given tier code."""
        mapping = {
            "standard": self.stripe_price_standard,
            "pro": self.stripe_price_pro,
            "scale": self.stripe_price_scale,
        }
        return mapping.get(tier) or None

    def tier_for_price_id(self, price_id: str) -> str | None:
        """Reverse lookup: Stripe Price ID → tier code."""
        mapping = {
            self.stripe_price_standard: "standard",
            self.stripe_price_pro: "pro",
            self.stripe_price_scale: "scale",
        }
        return mapping.get(price_id)


@lru_cache
def get_settings() -> Settings:
    return Settings()
