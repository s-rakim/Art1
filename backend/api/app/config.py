from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Everything comes from the environment. See .env.example at the repo root."""

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
    # Public base URL for Storage if it isn't served from SUPABASE_URL.
    storage_url: str = ""
    # Product images: biggest upload accepted, longest side kept after
    # resizing, and any outside hosts a store may link images from (empty
    # means only images uploaded through the API).
    max_image_bytes: int = 8_000_000
    image_max_side: int = 2000
    image_url_hosts: Annotated[list[str], NoDecode] = Field(default_factory=list)
    # Product videos: their own bucket, size and length caps.
    video_bucket: str = "product-videos"
    max_video_bytes: int = 50_000_000
    max_video_seconds: int = 180
    # Admin endpoints demand a token issued after a second factor (aal2).
    admin_require_mfa: bool = False

    search_url: str = "http://search:8080"
    redis_url: str = ""

    # Rate limits, requests per minute. Per client IP for everything, and a
    # tighter per user budget on endpoints worth abusing.
    rate_limit_ip: int = 300
    rate_limit_sensitive: int = 20
    rate_limit_rider_location: int = 30
    # Requests from inside the compose network with no forwarded client
    # address are the web app's own cached page renders. They share one
    # address, so they get a bucket of their own.
    rate_limit_internal: int = 6000
    internal_networks: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "fc00::/7", "::1/128"]
    )

    currency: str = "USD"
    payout_minimum_cents: int = 2000
    # Offer ready orders to the closest free rider automatically and pass the
    # job on if they don't accept in time. How far to look, and the batching
    # rules, are admin settings.
    auto_dispatch: bool = True
    dispatch_accept_seconds: int = 120

    # Central payments. Times in till and bank messages are read in this zone.
    payment_timezone: str = "Africa/Nairobi"
    # Secret in the URL a phone or Daraja posts payments to. Empty turns
    # those endpoints off; pasting messages in the console always works.
    payment_webhook_token: str = ""
    # Daraja (Safaricom M-Pesa API), only needed to register the C2B
    # callback URLs with `python -m app.cli register-mpesa-urls`.
    mpesa_env: Literal["sandbox", "production"] = "sandbox"
    mpesa_shortcode: str = ""
    mpesa_consumer_key: str = ""
    mpesa_consumer_secret: str = ""

    rider_location_retention_days: int = 14
    unpaid_order_ttl_minutes: int = 60

    payment_provider: Literal["stripe", "manual", "test"] = "manual"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    max_body_bytes: int = 1_000_000
    expose_docs: bool = False

    @field_validator("cors_origins", "trusted_hosts", "image_url_hosts", "internal_networks", mode="before")
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
        if self.payment_webhook_token and len(self.payment_webhook_token) < 32:
            problems.append("PAYMENT_WEBHOOK_TOKEN must be at least 32 characters")
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
