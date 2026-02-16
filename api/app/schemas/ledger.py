from datetime import datetime
from pydantic import BaseModel


class LedgerEntry(BaseModel):
    """Single ledger entry response."""
    id: int
    user_id: int
    amount: int
    balance_after: int
    action_type: str
    ref_type: str
    ref_id: int | None
    note: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class BalanceResponse(BaseModel):
    """User balance summary."""
    user_id: int
    available_balance: int
    change_24h: int = 0
