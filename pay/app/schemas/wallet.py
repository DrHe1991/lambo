from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class WalletCreate(BaseModel):
    external_user_id: str = Field(..., min_length=1, max_length=100)


class WalletResponse(BaseModel):
    id: int
    app_id: int
    external_user_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class TokenBalance(BaseModel):
    """Balance for a single token."""
    token_symbol: str
    token_contract: Optional[str]
    balance: int
    locked_balance: int
    available_balance: int
    balance_formatted: str
    decimals: int = 6  # Default for most tokens


class WalletBalances(BaseModel):
    """All token balances for a wallet."""
    wallet_id: int
    balances: list[TokenBalance]


class DepositAddressResponse(BaseModel):
    id: int
    wallet_id: int
    chain: str
    address: str
    derivation_index: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
