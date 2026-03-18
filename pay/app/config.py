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
    
    # CEX Configuration (Binance)
    binance_api_key: str = ''
    binance_api_secret: str = ''
    binance_testnet: bool = True  # Use testnet for development
    
    # Reserve Configuration
    target_btc_ratio: float = 0.50  # Target BTC ratio in reserve (50%)
    rebalance_deviation: float = 0.05  # Trigger trade if deviation > 5%
    quota_trigger_ratio: float = 0.10  # Trigger rebalance when quota < 10%
    reserve_usage_ratio: float = 0.80  # Only use 80% of reserve for quotas
    
    # Exchange Configuration
    exchange_buffer_rate: float = 0.005  # 0.5% buffer fee
    
    # First Exchange Bonus
    first_exchange_bonus_rate: float = 0.10  # 10% bonus
    first_exchange_bonus_cap_usd: float = 5.0  # Max $5 eligible for bonus
    
    # Chain Configuration (network fees in USD)
    chain_configs: dict = {
        'tron': {'min_deposit': 5.0, 'network_fee': 0.15, 'enabled': True},
        'polygon': {'min_deposit': 5.0, 'network_fee': 0.05, 'enabled': False},
        'bsc': {'min_deposit': 10.0, 'network_fee': 0.20, 'enabled': False},
        'eth': {'min_deposit': 50.0, 'network_fee': 5.0, 'enabled': False},
    }
    
    # Withdrawal limits
    min_btc_withdrawal_sat: int = 1_000_000  # 0.01 BTC
    min_usdt_withdrawal: int = 5_000_000  # $5 (6 decimals)
    
    # Service settings
    env: str = 'development'
    debug: bool = True
    
    class Config:
        env_file = '.env'
        extra = 'ignore'


@lru_cache
def get_settings() -> Settings:
    return Settings()
