from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = 'postgresql+asyncpg://bitline:bitline_dev_password@localhost:5432/bitline'

    # Redis
    redis_url: str = 'redis://localhost:6379/0'

    # Environment
    env: str = 'development'
    debug: bool = False

    # Auth (for later phases)
    secret_key: str = 'dev-secret-key-change-in-production'
    google_client_id: str = ''
    google_client_secret: str = ''

    # AI
    anthropic_api_key: str = ''
    groq_api_key: str = ''

    class Config:
        env_file = '.env'
        extra = 'ignore'


settings = Settings()
