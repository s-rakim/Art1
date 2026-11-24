from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Everything comes from the environment. See backend/.env.example."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "production"
    api_prefix: str = "/api/v1"
    public_api_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:3000"
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["http://localhost:3000"])
    trusted_hosts: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["*"])

    database_url: str
    db_pool_min: int = 2
    db_pool_max: int = 10

    # Supabase. Tokens are verified locally: HS256 with the project's JWT
    # secret, or ES256/RS256 against the project's JWKS when the secret is
    # not set (newer projects with asymmetric signing keys).
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_jwt_audience: str = "authenticated"
    supabase_service_role_key: str = ""
    storage_bucket: str = "product-images"
    # Admin endpoints demand a token issued after a second factor (aal2).
    admin_require_mfa: bool = False

    search_url: str = "http://search:8080"
    redis_url: str = ""

    # Rate limits, requests per minute. Per client IP for everything, and a
    # tighter per user budget on endpoints worth abusing.
    rate_limit_ip: int = 300
    rate_limit_sensitive: int = 20
    rate_limit_rider_location: int = 30

    currency: str = "USD"
    shipping_standard_cents: int = 499
    shipping_express_cents: int = 1499
    free_shipping_over_cents: int = 4900
    tax_rate: float = 0.0
    payout_hold_days: int = 7
    payout_minimum_cents: int = 2000
    rider_fee_cents: int = 300
    rider_location_retention_days: int = 14
    unpaid_order_ttl_minutes: int = 60

    payment_provider: Literal["stripe", "manual", "test"] = "manual"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    max_body_bytes: int = 1_000_000
    expose_docs: bool = False

    @field_validator("cors_origins", "trusted_hosts", mode="before")
    @classmethod
    def split_csv(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                import json

                return json.loads(v)
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    @model_validator(mode="after")
    def refuse_unsafe_production(self):
        if self.environment != "production":
            return self
        problems = []
        if self.payment_provider == "test":
            problems.append("PAYMENT_PROVIDER=test marks every order paid; it is not allowed in production")
        if not self.supabase_jwt_secret and not self.supabase_url:
            problems.append("set SUPABASE_JWT_SECRET or SUPABASE_URL so tokens can be verified")
        if self.supabase_jwt_secret and len(self.supabase_jwt_secret) < 32:
            problems.append("SUPABASE_JWT_SECRET is too short")
        if self.payment_provider == "stripe" and not (self.stripe_secret_key and self.stripe_webhook_secret):
            problems.append("stripe needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET")
        if "*" in self.cors_origins:
            problems.append("CORS_ORIGINS cannot be * in production")
        if problems:
            raise ValueError("; ".join(problems))
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
