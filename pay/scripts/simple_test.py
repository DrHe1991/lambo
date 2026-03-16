#!/usr/bin/env python3
"""
Simple test script that demonstrates the payment gateway concepts
without requiring native crypto libraries.

For full testing, use Docker.
"""

import asyncio
import httpx

# Pre-generated test addresses from standard test mnemonic
# "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
# These are derived using BIP44 path m/44'/195'/0'/0/{index}
TEST_ADDRESSES = [
    {
        'index': 0,
        'address': 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH',
        'path': "m/44'/195'/0'/0/0",
    },
    {
        'index': 1, 
        'address': 'TKGxBMJohzHGYRuwPvHLFJjhMeFwPPf9Dw',
        'path': "m/44'/195'/0'/0/1",
    },
    {
        'index': 2,
        'address': 'TSHQnSHYBJTtmgpnkMgWU8KLfbE7HvV4Nt',
        'path': "m/44'/195'/0'/0/2",
    },
]

HOT_WALLET = {
    'address': 'TAaT6MjWEh6oXcfxMJBFGWgWEaGPWLaGgt',
    'path': "m/44'/195'/0'/1/0",
}

SHASTA_API = 'https://api.shasta.trongrid.io'
USDT_CONTRACT_SHASTA = 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs'


async def get_current_block() -> int:
    """Get current block from Shasta testnet."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(f'{SHASTA_API}/wallet/getnowblock')
        data = resp.json()
        return data.get('block_header', {}).get('raw_data', {}).get('number', 0)


async def get_balance(address: str) -> dict:
    """Get TRX balance for an address."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(f'{SHASTA_API}/v1/accounts/{address}')
        if resp.status_code == 404:
            return {'trx': 0, 'tokens': []}
        data = resp.json()
        account = data.get('data', [{}])[0] if data.get('data') else {}
        return {
            'trx': account.get('balance', 0),
            'tokens': account.get('trc20', []),
        }


async def main():
    print('=' * 60)
    print('TRON Shasta Testnet - Payment Gateway Test')
    print('=' * 60)
    print()
    
    # 1. Show test addresses
    print('1. Pre-derived test deposit addresses:')
    print('   (From standard test mnemonic "abandon...")')
    print()
    for addr in TEST_ADDRESSES:
        print(f'   #{addr["index"]}: {addr["address"]}')
        print(f'        Path: {addr["path"]}')
    print()
    
    # 2. Show hot wallet
    print('2. Hot wallet (for withdrawals):')
    print(f'   Address: {HOT_WALLET["address"]}')
    print(f'   Path: {HOT_WALLET["path"]}')
    print()
    
    # 3. Test API connection
    print('3. Testing TRON Shasta API...')
    try:
        block = await get_current_block()
        print(f'   Current block: {block}')
        print(f'   API: {SHASTA_API}')
    except Exception as e:
        print(f'   Error: {e}')
    print()
    
    # 4. Check balances
    print('4. Checking balances:')
    for addr in TEST_ADDRESSES[:2]:
        try:
            balance = await get_balance(addr['address'])
            trx = balance['trx'] / 1_000_000
            print(f'   {addr["address"][:10]}...: {trx} TRX')
        except Exception as e:
            print(f'   {addr["address"][:10]}...: Not activated')
    print()
    
    # 5. Instructions
    print('5. To test deposits:')
    print()
    print('   a) Get test TRX from faucet:')
    print('      https://shasta.tronex.io/')
    print()
    print(f'   b) Send TRX to: {TEST_ADDRESSES[0]["address"]}')
    print()
    print('   c) USDT contract on Shasta:')
    print(f'      {USDT_CONTRACT_SHASTA}')
    print()
    
    print('=' * 60)
    print('API Endpoints (when service is running):')
    print('=' * 60)
    print()
    print('POST http://localhost:8004/apps')
    print('     Create app: {"name": "bitlink"}')
    print()
    print('POST http://localhost:8004/wallets?app_id=1')
    print('     Create wallet: {"external_user_id": "user_123"}')
    print()
    print('GET  http://localhost:8004/wallets/1/address?chain=tron')
    print('     Get deposit address')
    print()
    print('GET  http://localhost:8004/wallets/1/balance')
    print('     Check balance')
    print()
    print('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())
