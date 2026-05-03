from datetime import datetime
from pydantic import BaseModel


class LedgerEntry(BaseModel):
    """Single ledger entry response."""
    id: int
    user_id: int
    amount_usdc_micro: int
    action_type: str
    ref_type: str
    ref_id: int | None
    tx_hash: str | None = None
    note: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class WalletResponse(BaseModel):
    """User wallet info — balance lives on chain, this just returns the address."""
    user_id: int
    embedded_wallet_address: str | None
    delegated_actions_enabled: bool = False
