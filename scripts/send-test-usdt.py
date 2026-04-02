#!/usr/bin/env python3
"""
Send test USDT (TRC-20) on TRON Shasta testnet.

Usage (run inside pay container):
    docker exec bitlink-pay python /app/scripts/send-test-usdt.py <to_address> <amount>

Example:
    docker exec bitlink-pay python /app/scripts/send-test-usdt.py TQfPnm8qJfhCsE2F82VFg1caKBTfXvqTv8 5

Requirements:
    - Hot wallet must have USDT balance on Shasta testnet
    - Hot wallet must have TRX for gas fees
    - Get test tokens from: https://shasta.tronscan.org/#/faucet

Hot Wallet: TNnatCFqYS4nCNXa3MHQMh7ZGewujvTmuy
"""

import sys
import asyncio
import warnings

# Disable SSL warnings for Shasta testnet
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Monkey-patch requests to disable SSL verification (Shasta has SSL issues from Docker)
import requests
_original_request = requests.Session.request
def _patched_request(self, *args, **kwargs):
    kwargs['verify'] = False
    return _original_request(self, *args, **kwargs)
requests.Session.request = _patched_request

# Shasta testnet USDT contract
USDT_CONTRACT = 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs'

# Test mnemonic - DO NOT USE IN PRODUCTION
TEST_MNEMONIC = 'angle guard apart web ring gym bird wedding patient category milk cargo'


def get_hot_wallet():
    """Derive hot wallet address and private key from test mnemonic."""
    from bip_utils import Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
    
    seed = Bip39SeedGenerator(TEST_MNEMONIC).Generate()
    bip44 = Bip44.FromSeed(seed, Bip44Coins.TRON)
    account = bip44.Purpose().Coin().Account(0)
    hot_wallet = account.Change(Bip44Changes.CHAIN_INT).AddressIndex(0)
    
    return {
        'address': hot_wallet.PublicKey().ToAddress(),
        'private_key': hot_wallet.PrivateKey().Raw().ToHex(),
    }


async def get_usdt_balance(address: str) -> float:
    """Get USDT balance for an address."""
    import httpx
    
    async with httpx.AsyncClient(verify=False) as client:
        response = await client.get(
            f'https://api.shasta.trongrid.io/v1/accounts/{address}',
            headers={'Content-Type': 'application/json'},
        )
        
        if response.status_code == 404:
            return 0.0
        
        data = response.json()
        account = data.get('data', [{}])[0] if data.get('data') else {}
        
        for token in account.get('trc20', []):
            if USDT_CONTRACT in token:
                raw_balance = int(token[USDT_CONTRACT])
                return raw_balance / 1_000_000
        
        return 0.0


async def get_trx_balance(address: str) -> float:
    """Get TRX balance for gas fees."""
    import httpx
    
    async with httpx.AsyncClient(verify=False) as client:
        response = await client.get(
            f'https://api.shasta.trongrid.io/v1/accounts/{address}',
            headers={'Content-Type': 'application/json'},
        )
        
        if response.status_code == 404:
            return 0.0
        
        data = response.json()
        account = data.get('data', [{}])[0] if data.get('data') else {}
        return account.get('balance', 0) / 1_000_000


def send_usdt(from_address: str, private_key: str, to_address: str, amount: float) -> dict:
    """Send USDT (TRC-20) transfer."""
    from tronpy import Tron
    from tronpy.keys import PrivateKey
    from tronpy.contract import Contract
    
    client = Tron(network='shasta')
    
    # Load USDT contract
    contract = client.get_contract(USDT_CONTRACT)
    
    # Amount in smallest unit (6 decimals)
    amount_raw = int(amount * 1_000_000)
    
    # Build transfer transaction
    priv_key = PrivateKey(bytes.fromhex(private_key))
    
    txn = (
        contract.functions.transfer(to_address, amount_raw)
        .with_owner(from_address)
        .fee_limit(100_000_000)  # 100 TRX fee limit
        .build()
        .sign(priv_key)
    )
    
    # Broadcast
    result = txn.broadcast()
    return result


async def main():
    if len(sys.argv) < 3:
        print('Usage: python scripts/send-test-usdt.py <to_address> <amount>')
        print('Example: python scripts/send-test-usdt.py TQfPnm8qJfhCsE2F82VFg1caKBTfXvqTv8 5')
        sys.exit(1)
    
    to_address = sys.argv[1]
    amount = float(sys.argv[2])
    
    if not to_address.startswith('T') or len(to_address) != 34:
        print(f'Error: Invalid TRON address: {to_address}')
        sys.exit(1)
    
    if amount <= 0:
        print(f'Error: Amount must be positive: {amount}')
        sys.exit(1)
    
    print('=' * 50)
    print('BitLink Test USDT Transfer (Shasta Testnet)')
    print('=' * 50)
    print()
    
    # Get hot wallet
    hot_wallet = get_hot_wallet()
    print(f'Hot Wallet: {hot_wallet["address"]}')
    
    # Check balances
    trx_balance = await get_trx_balance(hot_wallet['address'])
    usdt_balance = await get_usdt_balance(hot_wallet['address'])
    
    print(f'TRX Balance: {trx_balance:.2f} TRX (for gas)')
    print(f'USDT Balance: {usdt_balance:.2f} USDT')
    print()
    
    if trx_balance < 10:
        print('Error: Insufficient TRX for gas fees.')
        print('Please fund the hot wallet with TRX from:')
        print('  https://shasta.tronscan.org/#/faucet')
        print(f'  Address: {hot_wallet["address"]}')
        sys.exit(1)
    
    if usdt_balance < amount:
        print(f'Error: Insufficient USDT balance ({usdt_balance:.2f} < {amount:.2f})')
        print('Please fund the hot wallet with USDT from:')
        print('  https://shasta.tronscan.org/#/faucet')
        print(f'  Address: {hot_wallet["address"]}')
        sys.exit(1)
    
    print(f'Sending {amount} USDT to {to_address}...')
    print()
    
    try:
        result = send_usdt(
            from_address=hot_wallet['address'],
            private_key=hot_wallet['private_key'],
            to_address=to_address,
            amount=amount,
        )
        
        print('Transaction submitted!')
        print(f'TX Hash: {result.get("txid", "unknown")}')
        print(f'Result: {result.get("result", False)}')
        print()
        print(f'View on explorer:')
        print(f'  https://shasta.tronscan.org/#/transaction/{result.get("txid", "")}')
        
    except Exception as e:
        print(f'Error sending USDT: {e}')
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
