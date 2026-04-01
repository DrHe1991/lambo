import secrets

from eth_account.messages import encode_defunct
from eth_account import Account
import nacl.signing
import nacl.encoding

import redis.asyncio as aioredis

from app.config import settings

NONCE_TTL = 300  # 5 minutes
SIGN_MESSAGE_TEMPLATE = 'Sign in to BitLink\nNonce: {nonce}'


async def _get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.redis_url, decode_responses=True)


async def create_nonce(address: str) -> tuple[str, str]:
    """Generate and store a nonce for the given address. Returns (nonce, message_to_sign)."""
    nonce = secrets.token_hex(16)
    message = SIGN_MESSAGE_TEMPLATE.format(nonce=nonce)

    r = await _get_redis()
    await r.setex(f'auth_nonce:{address.lower()}', NONCE_TTL, nonce)
    await r.close()

    return nonce, message


async def verify_and_consume_nonce(address: str, nonce: str) -> bool:
    """Verify a nonce matches and consume it (one-time use)."""
    r = await _get_redis()
    key = f'auth_nonce:{address.lower()}'
    stored = await r.get(key)
    if stored and stored == nonce:
        await r.delete(key)
        await r.close()
        return True
    await r.close()
    return False


def recover_eth_signer(message: str, signature: str) -> str:
    """Recover the Ethereum address that signed the message (EIP-191 personal_sign).

    Works for MetaMask, Binance Wallet, and any EVM-compatible wallet.
    Returns the checksummed address.
    """
    signable = encode_defunct(text=message)
    address = Account.recover_message(signable, signature=signature)
    return address  # checksummed


def verify_solana_signature(address: str, message: str, signature: str) -> bool:
    """Verify a Solana ed25519 signature from Phantom wallet.

    Args:
        address: base58-encoded Solana public key
        message: the UTF-8 message that was signed
        signature: base58-encoded signature
    """
    try:
        import base58
        pubkey_bytes = base58.b58decode(address)
        sig_bytes = base58.b58decode(signature)
        verify_key = nacl.signing.VerifyKey(pubkey_bytes)
        verify_key.verify(message.encode(), sig_bytes)
        return True
    except Exception:
        return False
