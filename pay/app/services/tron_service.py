"""
TRON blockchain service for interacting with TRON network.

Supports:
- TRX native transfers
- TRC-20 token transfers (USDT, USDC)
- Transaction monitoring
"""

import httpx
from typing import Optional
from dataclasses import dataclass, field
from datetime import datetime

from app.config import get_settings


# Known USDT contracts on different networks
USDT_CONTRACTS = {
    'mainnet': 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    'shasta': 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs',  # Shasta testnet USDT
    'nile': 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj',   # Nile testnet USDT
}


@dataclass
class TRC20Transfer:
    """Represents a TRC-20 token transfer."""
    tx_hash: str
    block_number: int
    timestamp: int
    from_address: str
    to_address: str
    contract_address: str
    token_symbol: str
    token_decimals: int
    amount: int  # Raw amount in smallest unit
    confirmed: bool = False


@dataclass
class TronTransaction:
    """Represents a TRON transaction."""
    tx_hash: str
    block_number: int
    timestamp: int
    from_address: str
    to_address: str
    amount: int  # In sun (1 TRX = 1,000,000 sun)
    confirmed: bool = False


class TronService:
    """Service for TRON blockchain operations."""
    
    def __init__(self):
        settings = get_settings()
        self.network = settings.tron_network
        self.api_key = settings.tron_api_key
        
        # Set API endpoint based on network
        if self.network == 'mainnet':
            self.api_base = 'https://api.trongrid.io'
        elif self.network == 'shasta':
            self.api_base = 'https://api.shasta.trongrid.io'
        elif self.network == 'nile':
            self.api_base = 'https://nile.trongrid.io'
        else:
            raise ValueError(f'Unknown TRON network: {self.network}')
        
        self.usdt_contract = USDT_CONTRACTS.get(self.network, '')
    
    def _get_headers(self) -> dict:
        """Get headers for API requests."""
        headers = {'Content-Type': 'application/json'}
        if self.api_key:
            headers['TRON-PRO-API-KEY'] = self.api_key
        return headers
    
    async def get_current_block(self) -> int:
        """Get the current block number."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f'{self.api_base}/wallet/getnowblock',
                headers=self._get_headers(),
            )
            response.raise_for_status()
            data = response.json()
            return data.get('block_header', {}).get('raw_data', {}).get('number', 0)
    
    async def get_trc20_transfers(
        self,
        address: str,
        contract_address: Optional[str] = None,
        min_timestamp: Optional[int] = None,
        limit: int = 50,
    ) -> list[TRC20Transfer]:
        """
        Get TRC-20 token transfers for an address.
        
        Args:
            address: The TRON address to check
            contract_address: Filter by specific contract (e.g., USDT)
            min_timestamp: Only get transfers after this timestamp (ms)
            limit: Maximum number of transfers to return
            
        Returns:
            List of TRC20Transfer objects
        """
        params = {
            'only_to': 'true',  # Only incoming transfers
            'limit': limit,
        }
        
        if contract_address:
            params['contract_address'] = contract_address
        
        if min_timestamp:
            params['min_timestamp'] = min_timestamp
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f'{self.api_base}/v1/accounts/{address}/transactions/trc20',
                params=params,
                headers=self._get_headers(),
            )
            
            if response.status_code == 404:
                return []
            
            response.raise_for_status()
            data = response.json()
        
        # Get current block for reference
        current_block = await self.get_current_block()
        
        transfers = []
        for tx in data.get('data', []):
            # Estimate block number from timestamp (TRON ~3 sec blocks)
            tx_timestamp = tx.get('block_timestamp', 0)
            # Use current block as approximation since API doesn't return block number
            transfer = TRC20Transfer(
                tx_hash=tx.get('transaction_id', ''),
                block_number=current_block - 10,  # Assume recent, will get confirmed quickly
                timestamp=tx_timestamp,
                from_address=tx.get('from', ''),
                to_address=tx.get('to', ''),
                contract_address=tx.get('token_info', {}).get('address', ''),
                token_symbol=tx.get('token_info', {}).get('symbol', ''),
                token_decimals=tx.get('token_info', {}).get('decimals', 6),
                amount=int(tx.get('value', '0')),
                confirmed=True,  # API only returns confirmed transfers
            )
            transfers.append(transfer)
        
        return transfers
    
    async def get_trx_transfers(
        self,
        address: str,
        min_timestamp: Optional[int] = None,
        limit: int = 50,
    ) -> list[TronTransaction]:
        """
        Get TRX native transfers for an address.
        
        Args:
            address: The TRON address to check
            min_timestamp: Only get transfers after this timestamp (ms)
            limit: Maximum number of transfers to return
            
        Returns:
            List of TronTransaction objects
        """
        params = {
            'only_to': 'true',
            'limit': limit,
        }
        
        if min_timestamp:
            params['min_timestamp'] = min_timestamp
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f'{self.api_base}/v1/accounts/{address}/transactions',
                params=params,
                headers=self._get_headers(),
            )
            
            if response.status_code == 404:
                return []
            
            response.raise_for_status()
            data = response.json()
        
        transactions = []
        for tx in data.get('data', []):
            # Skip non-transfer transactions
            if tx.get('raw_data', {}).get('contract', [{}])[0].get('type') != 'TransferContract':
                continue
            
            contract_param = tx.get('raw_data', {}).get('contract', [{}])[0].get('parameter', {}).get('value', {})
            
            transaction = TronTransaction(
                tx_hash=tx.get('txID', ''),
                block_number=tx.get('blockNumber', 0),
                timestamp=tx.get('block_timestamp', 0),
                from_address=self._hex_to_base58(contract_param.get('owner_address', '')),
                to_address=self._hex_to_base58(contract_param.get('to_address', '')),
                amount=contract_param.get('amount', 0),
                confirmed=tx.get('ret', [{}])[0].get('contractRet') == 'SUCCESS',
            )
            transactions.append(transaction)
        
        return transactions
    
    async def get_account_balance(self, address: str) -> dict:
        """
        Get TRX and TRC-20 token balances for an address.
        
        Returns:
            Dict with 'trx' (in sun) and 'tokens' (list of token balances)
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f'{self.api_base}/v1/accounts/{address}',
                headers=self._get_headers(),
            )
            
            if response.status_code == 404:
                return {'trx': 0, 'tokens': []}
            
            response.raise_for_status()
            data = response.json()
        
        account = data.get('data', [{}])[0] if data.get('data') else {}
        
        return {
            'trx': account.get('balance', 0),
            'tokens': account.get('trc20', []),
        }
    
    async def validate_address(self, address: str) -> bool:
        """Validate a TRON address."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f'{self.api_base}/wallet/validateaddress',
                json={'address': address},
                headers=self._get_headers(),
            )
            response.raise_for_status()
            data = response.json()
            return data.get('result', False)
    
    def _hex_to_base58(self, hex_address: str) -> str:
        """Convert hex address to base58 (TRON format)."""
        if not hex_address:
            return ''
        
        if hex_address.startswith('T'):
            return hex_address
        
        try:
            import base58
            if hex_address.startswith('41'):
                hex_bytes = bytes.fromhex(hex_address)
            else:
                hex_bytes = bytes.fromhex('41' + hex_address)
            
            # Add checksum
            import hashlib
            h1 = hashlib.sha256(hex_bytes).digest()
            h2 = hashlib.sha256(h1).digest()
            checksum = h2[:4]
            
            return base58.b58encode(hex_bytes + checksum).decode()
        except Exception:
            return hex_address


# Singleton instance
_tron_service: Optional[TronService] = None


def get_tron_service() -> TronService:
    """Get or create TronService singleton."""
    global _tron_service
    if _tron_service is None:
        _tron_service = TronService()
    return _tron_service
