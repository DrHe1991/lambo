"""On-chain USDC tip verification.

After the client signs and broadcasts a USDC transfer to the creator's wallet,
it POSTs the resulting tx_hash to /tip/confirm. This module fetches the
transaction receipt from Base RPC and verifies:

1. tx is mined and successful (status = 1)
2. tx is to the USDC contract address
3. tx contains an ERC20 Transfer log with:
     from = sender's expected wallet
     to   = creator's expected wallet
     value >= claimed amount

We never trust client-supplied amounts — we read them from the chain.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# keccak256("Transfer(address,address,uint256)")
TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'


class ChainVerifyError(Exception):
    """Tip transaction failed verification."""


@dataclass(slots=True)
class VerifiedTip:
    tx_hash: str
    block_number: int
    sender: str       # 0x-prefixed lowercase
    recipient: str    # 0x-prefixed lowercase
    amount_micro: int
    token_address: str


async def _rpc(method: str, params: list[Any]) -> Any:
    """Single Base RPC JSON-RPC call."""
    payload = {'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(settings.base_rpc_url, json=payload)
        resp.raise_for_status()
        data = resp.json()
    if 'error' in data:
        raise ChainVerifyError(f'RPC error: {data["error"]}')
    return data.get('result')


def _hex_to_int(h: str | None) -> int:
    if not h:
        return 0
    return int(h, 16)


def _topic_to_address(topic: str) -> str:
    """A 32-byte topic encodes a 20-byte address in the rightmost 20 bytes."""
    return '0x' + topic[-40:].lower()


async def verify_usdc_tip(
    tx_hash: str,
    expected_sender: str,
    expected_recipient: str,
    min_amount_micro: int | None = None,
) -> VerifiedTip:
    """Verify an on-chain USDC tip.

    expected_sender / expected_recipient are 0x-addresses (case insensitive).
    min_amount_micro lets us reject dust if the client claimed a larger tip.

    Raises ChainVerifyError if anything mismatches.
    """
    if not tx_hash.startswith('0x') or len(tx_hash) != 66:
        raise ChainVerifyError('Malformed tx_hash')

    receipt = await _rpc('eth_getTransactionReceipt', [tx_hash])
    if receipt is None:
        raise ChainVerifyError('Transaction not yet mined')

    if _hex_to_int(receipt.get('status')) != 1:
        raise ChainVerifyError('Transaction failed on-chain')

    block_number = _hex_to_int(receipt.get('blockNumber'))

    # Confirmation depth check
    if settings.tip_confirmation_blocks > 1:
        head = _hex_to_int(await _rpc('eth_blockNumber', []))
        if head - block_number < settings.tip_confirmation_blocks - 1:
            raise ChainVerifyError(
                f'Need {settings.tip_confirmation_blocks} confirmations, have {head - block_number + 1}'
            )

    expected_sender_lc = expected_sender.lower()
    expected_recipient_lc = expected_recipient.lower()
    usdc_lc = settings.usdc_address.lower()

    for log in receipt.get('logs', []) or []:
        if (log.get('address') or '').lower() != usdc_lc:
            continue
        topics = log.get('topics') or []
        if len(topics) != 3 or topics[0].lower() != TRANSFER_TOPIC:
            continue

        from_addr = _topic_to_address(topics[1])
        to_addr = _topic_to_address(topics[2])
        if from_addr != expected_sender_lc or to_addr != expected_recipient_lc:
            continue

        value = _hex_to_int(log.get('data'))
        if min_amount_micro is not None and value < min_amount_micro:
            continue

        return VerifiedTip(
            tx_hash=tx_hash,
            block_number=block_number,
            sender=from_addr,
            recipient=to_addr,
            amount_micro=value,
            token_address=usdc_lc,
        )

    raise ChainVerifyError(
        'No matching USDC Transfer log found '
        f'(expected {expected_sender_lc} -> {expected_recipient_lc})'
    )
