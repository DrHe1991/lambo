"""
Client for communicating with the Pay service.

The Pay service handles crypto deposits and withdrawals.
BitLink API proxies requests to Pay service for user wallet operations.
"""

import httpx
from typing import Optional
from app.config import settings


class PayClientError(Exception):
    """Error from Pay service."""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class PayClient:
    """HTTP client for Pay service."""

    def __init__(self):
        self.base_url = settings.pay_service_url
        self.app_id = settings.pay_app_id
        self.timeout = 30.0

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[dict] = None,
        json: Optional[dict] = None,
    ) -> dict:
        """Make HTTP request to Pay service."""
        url = f'{self.base_url}{path}'

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.request(
                    method=method,
                    url=url,
                    params=params,
                    json=json,
                )

                if response.status_code >= 400:
                    try:
                        detail = response.json().get('detail', 'Unknown error')
                    except Exception:
                        detail = response.text or f'Pay service error ({response.status_code})'
                    raise PayClientError(detail, response.status_code)

                return response.json()

            except httpx.RequestError as e:
                raise PayClientError(f'Pay service unavailable: {e}', 503)

    async def get_or_create_wallet(self, external_user_id: str) -> dict:
        """
        Get or create a wallet for a BitLink user.

        Args:
            external_user_id: BitLink user ID as string

        Returns:
            Wallet data with id, balance, etc.
        """
        # First try to find existing wallet
        try:
            wallets = await self._request(
                'GET',
                '/wallets',
                params={'app_id': self.app_id, 'external_user_id': external_user_id},
            )
            if wallets:
                return wallets[0]
        except PayClientError:
            pass

        # Create new wallet
        return await self._request(
            'POST',
            '/wallets',
            params={'app_id': self.app_id},
            json={'external_user_id': external_user_id},
        )

    async def get_wallet(self, wallet_id: int) -> dict:
        """Get wallet by ID."""
        return await self._request('GET', f'/wallets/{wallet_id}')

    async def get_deposit_address(self, wallet_id: int, chain: str = 'tron') -> dict:
        """
        Get deposit address for a wallet.

        Args:
            wallet_id: Pay wallet ID
            chain: Blockchain network (default: tron)

        Returns:
            Deposit address data
        """
        return await self._request(
            'GET',
            f'/wallets/{wallet_id}/address',
            params={'chain': chain},
        )

    async def get_balance(self, wallet_id: int) -> dict:
        """
        Get wallet balance.

        Returns:
            Balance data with token balances
        """
        return await self._request('GET', f'/wallets/{wallet_id}/balance')

    async def get_deposits(
        self,
        wallet_id: int,
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        """
        Get deposit history for a wallet.

        Returns:
            List of deposits
        """
        return await self._request(
            'GET',
            f'/deposits/wallet/{wallet_id}',
            params={'limit': limit, 'offset': offset},
        )

    async def create_withdrawal(
        self,
        wallet_id: int,
        to_address: str,
        amount: int,
        chain: str = 'tron',
        token_symbol: str = 'TRX',
    ) -> dict:
        """
        Create a withdrawal request.

        Args:
            wallet_id: Pay wallet ID
            to_address: Destination blockchain address
            amount: Amount in smallest unit (sun for TRX)
            chain: Blockchain network
            token_symbol: Token to withdraw (TRX, USDT)

        Returns:
            Withdrawal request data
        """
        return await self._request(
            'POST',
            f'/withdrawals/wallet/{wallet_id}',
            json={
                'chain': chain,
                'to_address': to_address,
                'amount': amount,
                'token_symbol': token_symbol,
            },
        )

    async def get_withdrawals(
        self,
        wallet_id: int,
        limit: int = 50,
        offset: int = 0,
    ) -> list:
        """
        Get withdrawal history for a wallet.

        Returns:
            List of withdrawals
        """
        return await self._request(
            'GET',
            f'/withdrawals/wallet/{wallet_id}',
            params={'limit': limit, 'offset': offset},
        )

    async def get_ledger(
        self,
        wallet_id: int,
        limit: int = 50,
        offset: int = 0,
    ) -> list:
        """
        Get ledger entries for a wallet.

        Returns:
            List of ledger entries
        """
        return await self._request(
            'GET',
            f'/wallets/{wallet_id}/ledger',
            params={'limit': limit, 'offset': offset},
        )

    # Exchange methods
    async def get_btc_price(self) -> dict:
        """Get current BTC price."""
        return await self._request('GET', '/exchange/price')

    async def get_exchange_quota(self) -> dict:
        """Get current exchange quotas."""
        return await self._request('GET', '/exchange/quota')

    async def get_chain_fees(self) -> list:
        """Get network fees per chain."""
        return await self._request('GET', '/exchange/chain-fees')

    async def create_exchange_preview(
        self,
        wallet_id: int,
        amount: int,
        direction: str,
        include_bonus: bool = False,
        is_first_exchange: bool = False,
    ) -> dict:
        """
        Create an exchange preview (30s valid).

        Args:
            wallet_id: Pay wallet ID
            amount: USDT (6 decimals) for buy_sat, sat for sell_sat
            direction: 'buy_sat' or 'sell_sat'
            include_bonus: Whether to include first exchange bonus
            is_first_exchange: Whether this is user's first exchange

        Returns:
            Preview data with amounts and expiry
        """
        return await self._request(
            'POST',
            '/exchange/preview',
            json={
                'wallet_id': wallet_id,
                'amount': amount,
                'direction': direction,
                'include_bonus': include_bonus,
                'is_first_exchange': is_first_exchange,
            },
        )

    async def confirm_exchange(self, preview_id: str, wallet_id: int) -> dict:
        """
        Confirm and execute an exchange.

        Args:
            preview_id: Preview ID from create_exchange_preview
            wallet_id: Pay wallet ID

        Returns:
            Exchange result data
        """
        return await self._request(
            'POST',
            '/exchange/confirm',
            json={
                'preview_id': preview_id,
                'wallet_id': wallet_id,
            },
        )

    async def get_exchange_history(
        self,
        wallet_id: int,
        limit: int = 20,
        offset: int = 0,
    ) -> dict:
        """Get exchange history for a wallet."""
        return await self._request(
            'GET',
            '/exchange/history',
            params={'wallet_id': wallet_id, 'limit': limit, 'offset': offset},
        )


# Singleton instance
_pay_client: Optional[PayClient] = None


def get_pay_client() -> PayClient:
    """Get or create PayClient singleton."""
    global _pay_client
    if _pay_client is None:
        _pay_client = PayClient()
    return _pay_client
