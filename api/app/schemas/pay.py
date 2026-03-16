"""Schemas for Pay integration routes."""

from pydantic import BaseModel


class CryptoBalance(BaseModel):
    """Balance for a single token."""
    token_symbol: str
    balance: int
    balance_formatted: str


class CryptoBalanceResponse(BaseModel):
    """Response with all token balances."""
    balances: list[CryptoBalance]


class DepositAddressResponse(BaseModel):
    """Response with deposit address."""
    chain: str
    address: str


class DepositResponse(BaseModel):
    """Single deposit entry."""
    id: int
    chain: str
    tx_hash: str
    token_symbol: str
    amount: int
    amount_formatted: str
    status: str
    confirmations: int
    created_at: str


class DepositsListResponse(BaseModel):
    """List of deposits."""
    deposits: list[DepositResponse]


class WithdrawalRequest(BaseModel):
    """Request to create a withdrawal."""
    to_address: str
    amount: int
    chain: str = 'tron'
    token_symbol: str = 'TRX'


class WithdrawalResponse(BaseModel):
    """Single withdrawal entry."""
    id: int
    chain: str
    to_address: str
    token_symbol: str
    amount: int
    amount_formatted: str
    status: str
    tx_hash: str | None
    created_at: str


class WithdrawalsListResponse(BaseModel):
    """List of withdrawals."""
    withdrawals: list[WithdrawalResponse]
