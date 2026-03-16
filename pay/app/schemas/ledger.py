from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class LedgerEntryResponse(BaseModel):
    id: int
    wallet_id: int
    amount: int
    amount_formatted: str
    balance_after: int
    balance_after_formatted: str
    action: str
    ref_type: Optional[str]
    ref_id: Optional[int]
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
