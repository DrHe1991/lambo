#!/usr/bin/env python3
"""
Test script for TRON Shasta testnet integration.

This script:
1. Generates test HD wallet addresses
2. Shows how to get test TRX from Shasta faucet
3. Tests the deposit monitoring flow

Usage:
    cd pay
    source .venv/bin/activate
    pip install bip-utils httpx base58
    python scripts/test_shasta.py
"""

import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


async def main():
    print('=' * 60)
    print('TRON Shasta Testnet Integration Test')
    print('=' * 60)
    print()
    
    # Import after path setup
    from app.services.hd_wallet import TestWalletService, generate_test_mnemonic
    from app.services.tron_service import TronService, USDT_CONTRACTS
    
    # 1. Generate test wallet
    print('1. Generating test HD wallet...')
    test_wallet = TestWalletService()
    
    xpub = test_wallet.get_xpub()
    print(f'   Extended Public Key (xpub):')
    print(f'   {xpub}')
    print()
    
    # 2. Generate deposit addresses
    print('2. Generating deposit addresses:')
    for i in range(3):
        addr_info = test_wallet.derive_address(i)
        print(f'   Address #{i}: {addr_info["address"]}')
        print(f'      Path: {addr_info["path"]}')
    print()
    
    # 3. Get hot wallet
    print('3. Hot wallet for withdrawals (TEST ONLY):')
    hot_wallet = test_wallet.get_hot_wallet()
    print(f'   Address: {hot_wallet["address"]}')
    print(f'   Path: {hot_wallet["path"]}')
    print()
    
    # 4. Test TRON API connection
    print('4. Testing TRON Shasta API connection...')
    tron_service = TronService()
    tron_service.network = 'shasta'
    tron_service.api_base = 'https://api.shasta.trongrid.io'
    
    try:
        current_block = await tron_service.get_current_block()
        print(f'   Current block: {current_block}')
        print(f'   Network: {tron_service.network}')
        print(f'   API: {tron_service.api_base}')
    except Exception as e:
        print(f'   Error: {e}')
    print()
    
    # 5. Show faucet info
    print('5. To get test TRX and USDT:')
    print('   a) Visit: https://shasta.tronex.io/')
    print('   b) Or use: https://www.trongrid.io/shasta')
    print(f'   c) Send to any generated address above')
    print()
    
    # 6. Show USDT contract
    print('6. Shasta testnet USDT contract:')
    usdt_contract = USDT_CONTRACTS.get('shasta', 'Not configured')
    print(f'   Contract: {usdt_contract}')
    print()
    
    # 7. Check balance of first address
    print('7. Checking balance of first address...')
    first_addr = test_wallet.derive_address(0)['address']
    try:
        balance = await tron_service.get_account_balance(first_addr)
        trx_balance = balance['trx'] / 1_000_000  # Convert from sun
        print(f'   TRX Balance: {trx_balance} TRX')
        print(f'   Tokens: {balance["tokens"]}')
    except Exception as e:
        print(f'   Address not activated (no transactions yet): {e}')
    print()
    
    print('=' * 60)
    print('Test complete!')
    print()
    print('Next steps:')
    print('1. Start Docker: docker-compose up postgres redis pay')
    print('2. Run migrations in pay container')
    print('3. Create an app and wallet via API')
    print('4. Get a deposit address')
    print('5. Send test TRX/USDT to the address')
    print('6. Watch the deposit get credited!')
    print('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())
