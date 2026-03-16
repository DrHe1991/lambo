#!/usr/bin/env python3
"""
Test faucet script for transferring TRX to test addresses.

This address is funded with test TRX and can be used to send
TRX to other addresses for testing the deposit flow.

Usage:
    # Transfer 100 TRX to an address
    docker exec bitlink-pay python scripts/test_faucet.py TFnq6oEGK2oNzet2WaUhFe2bF2z1hDbXUr 100
    
    # Check faucet balance
    docker exec bitlink-pay python scripts/test_faucet.py --balance
"""

import sys
import argparse
from tronpy import Tron
from tronpy.keys import PrivateKey

# Test faucet configuration
FAUCET_ADDRESS = 'TKRqwozvQ1f8doqLNMdMsnjkuGJpkA6ioe'
FAUCET_PRIVATE_KEY = 'a71e2e67533339e8cde768787469b8ce8226952062548c3f1d7688a8e6262ab7'
NETWORK = 'shasta'


def get_balance():
    """Get faucet balance."""
    client = Tron(network=NETWORK)
    balance = client.get_account_balance(FAUCET_ADDRESS)
    return balance


def transfer(to_address: str, amount_trx: float):
    """Transfer TRX from faucet to target address."""
    client = Tron(network=NETWORK)
    priv_key = PrivateKey(bytes.fromhex(FAUCET_PRIVATE_KEY))
    
    amount_sun = int(amount_trx * 1_000_000)
    
    txn = (
        client.trx.transfer(FAUCET_ADDRESS, to_address, amount_sun)
        .build()
        .sign(priv_key)
    )
    
    result = txn.broadcast()
    return result


def main():
    parser = argparse.ArgumentParser(description='Test faucet for TRX transfers')
    parser.add_argument('to_address', nargs='?', help='Target address')
    parser.add_argument('amount', nargs='?', type=float, help='Amount in TRX')
    parser.add_argument('--balance', '-b', action='store_true', help='Check faucet balance')
    
    args = parser.parse_args()
    
    if args.balance or (not args.to_address and not args.amount):
        balance = get_balance()
        print(f'Faucet Address: {FAUCET_ADDRESS}')
        print(f'Balance: {balance} TRX')
        return
    
    if not args.to_address or not args.amount:
        print('Usage: test_faucet.py <to_address> <amount>')
        print('       test_faucet.py --balance')
        sys.exit(1)
    
    print(f'Transferring {args.amount} TRX to {args.to_address}...')
    
    try:
        result = transfer(args.to_address, args.amount)
        print(f'Success!')
        print(f'TX Hash: {result["txid"]}')
    except Exception as e:
        print(f'Error: {e}')
        sys.exit(1)


if __name__ == '__main__':
    main()
