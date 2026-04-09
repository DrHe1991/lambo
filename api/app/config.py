from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = 'postgresql+asyncpg://bitlink:bitlink_dev_password@localhost:5432/bitlink'

    # Redis
    redis_url: str = 'redis://localhost:6379/0'

    # Environment
    env: str = 'development'
    debug: bool = False

    # Auth
    secret_key: str = 'dev-secret-key-change-in-production'
    jwt_algorithm: str = 'HS256'
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    google_client_id: str = ''
    google_client_secret: str = ''

    # AI (Bank of AI — OpenAI-compatible LLM gateway)
    bankofai_api_key: str = ''
    bankofai_model: str = 'gpt-5.4-mini'
    bankofai_base_url: str = 'https://api.bankofai.io/v1'
    ai_enabled: bool = True

    # Platform ops wallet (pay service wallet ID for operational expenses like AI)
    platform_wallet_id: int = 0

    # Pay Service
    pay_service_url: str = 'http://pay:8000'
    pay_app_id: int = 1

    # S3-compatible Object Storage (MinIO in dev, R2/S3 in prod)
    s3_endpoint: str = 'http://localhost:9000'
    s3_access_key: str = 'bitlink'
    s3_secret_key: str = 'bitlink_dev_password'
    s3_bucket_posts: str = 'posts'
    s3_bucket_chat: str = 'chat'
    s3_public_url: str = 'http://localhost:9000'

    class Config:
        env_file = '.env'
        extra = 'ignore'


settings = Settings()
