from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class WithdrawalCreate(BaseModel):
    chain: str = Field(default='tron')
    to_address: str = Field(..., min_length=30, max_length=100)
    amount: int = Field(..., gt=0)
    token_symbol: str = Field(default='USDT')


class WithdrawalResponse(BaseModel):
    id: int
    wallet_id: int
    chain: str
    to_address: str
    token_symbol: str
    amount: int
    amount_formatted: str
    fee: int
    status: str
    tx_hash: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    processed_at: Optional[datetime]
    confirmed_at: Optional[datetime]

    class Config:
        from_attributes = True
