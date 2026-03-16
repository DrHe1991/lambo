from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class DepositResponse(BaseModel):
    id: int
    wallet_id: int
    chain: str
    tx_hash: str
    block_number: int
    token_symbol: str
    amount: int
    amount_formatted: str
    from_address: str
    confirmations: int
    required_confirmations: int
    status: str
    credited_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class DepositList(BaseModel):
    deposits: list[DepositResponse]
    total: int
