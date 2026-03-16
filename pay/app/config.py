from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = 'postgresql+asyncpg://bitlink:bitlink_dev_password@localhost:5435/bitlink'
    
    # Redis
    redis_url: str = 'redis://localhost:6380/1'
    
    # TRON Configuration
    tron_network: str = 'shasta'  # mainnet, shasta (testnet), nile (testnet)
    tron_xpub: str = ''  # Extended public key for HD wallet
    tron_api_key: str = ''  # TronGrid API key
    tron_usdt_contract: str = ''  # USDT TRC-20 contract address
    
    # Deposit monitoring
    deposit_poll_interval: int = 10  # seconds
    deposit_confirmations: int = 20  # blocks to wait
    
    # Hot wallet for withdrawals (optional, for automated small withdrawals)
    hot_wallet_private_key: str = ''
    hot_wallet_max_withdrawal: int = 100_000_000  # 100 USDT in sun (6 decimals)
    
    # Service settings
    env: str = 'development'
    debug: bool = True
    
    class Config:
        env_file = '.env'
        extra = 'ignore'


@lru_cache
def get_settings() -> Settings:
    return Settings()
