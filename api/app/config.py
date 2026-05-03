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

    # Privy — embedded non-custodial wallets
    # Get from https://dashboard.privy.io
    privy_app_id: str = ''
    privy_app_secret: str = ''
    privy_jwks_url: str = 'https://auth.privy.io/api/v1/apps/{app_id}/jwks.json'

    # Base mainnet on-chain config
    base_rpc_url: str = 'https://mainnet.base.org'
    base_chain_id: int = 8453
    usdc_address: str = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
    usdc_decimals: int = 6

    # Tip economics
    min_tip_micro: int = 10_000          # $0.01
    default_tip_micro: int = 100_000     # $0.10
    max_tip_micro: int = 100_000_000     # $100.00
    tip_confirmation_blocks: int = 1     # how many block confirmations to require

    # AI (Bank of AI — OpenAI-compatible LLM gateway)
    bankofai_api_key: str = ''
    bankofai_model: str = 'gpt-5.4-mini'
    bankofai_base_url: str = 'https://api.bankofai.io/v1'
    ai_enabled: bool = True

    # S3-compatible Object Storage (MinIO in dev, R2/S3 in prod)
    s3_endpoint: str = 'http://localhost:9000'
    s3_access_key: str = 'bitlink'
    s3_secret_key: str = 'bitlink_dev_password'
    s3_bucket_posts: str = 'posts'
    s3_bucket_chat: str = 'chat'
    s3_public_url: str = 'http://localhost:9000'

    # Free post quota (daily)
    free_posts_per_day: int = 3

    class Config:
        env_file = '.env'
        extra = 'ignore'


settings = Settings()
