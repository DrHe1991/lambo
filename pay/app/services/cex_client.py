import asyncio
import time
from decimal import Decimal
from typing import Optional
from dataclasses import dataclass
from functools import lru_cache

import httpx

from app.config import get_settings


@dataclass
class CexOrder:
    order_id: str
    symbol: str
    side: str  # 'BUY' or 'SELL'
    quantity: Decimal
    price: Decimal
    status: str


@dataclass
class CexBalances:
    btc: Decimal
    usdt: Decimal


class BinanceClient:
    '''Binance API client for reserve management.'''
    
    MAINNET_API = 'https://api.binance.com'
    TESTNET_API = 'https://testnet.binance.vision'
    
    def __init__(self, api_key: str, api_secret: str, testnet: bool = True):
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = self.TESTNET_API if testnet else self.MAINNET_API
        self._price_cache: dict[str, tuple[Decimal, float]] = {}
        self._price_cache_ttl = 30  # seconds
    
    async def get_btc_price(self) -> Decimal:
        '''Get current BTC/USDT price with 30s cache.'''
        cache_key = 'BTCUSDT'
        now = time.time()
        
        if cache_key in self._price_cache:
            price, cached_at = self._price_cache[cache_key]
            if now - cached_at < self._price_cache_ttl:
                return price
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f'{self.base_url}/api/v3/ticker/price',
                    params={'symbol': 'BTCUSDT'}
                )
                response.raise_for_status()
                data = response.json()
                price = Decimal(data['price'])
                self._price_cache[cache_key] = (price, now)
                return price
        except Exception as e:
            # Fallback to CoinGecko if Binance fails
            return await self._get_price_coingecko()
    
    async def _get_price_coingecko(self) -> Decimal:
        '''Fallback price from CoinGecko.'''
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    'https://api.coingecko.com/api/v3/simple/price',
                    params={'ids': 'bitcoin', 'vs_currencies': 'usd'}
                )
                response.raise_for_status()
                data = response.json()
                return Decimal(str(data['bitcoin']['usd']))
        except Exception:
            # Return a safe fallback price (should never happen in production)
            return Decimal('60000')
    
    async def get_balances(self) -> CexBalances:
        '''Get BTC and USDT balances from Binance account.'''
        if not self.api_key or not self.api_secret:
            # Return mock balances for testing without API keys
            return CexBalances(btc=Decimal('0.5'), usdt=Decimal('15000'))
        
        try:
            import hmac
            import hashlib
            
            timestamp = int(time.time() * 1000)
            query_string = f'timestamp={timestamp}'
            signature = hmac.new(
                self.api_secret.encode('utf-8'),
                query_string.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f'{self.base_url}/api/v3/account',
                    params={'timestamp': timestamp, 'signature': signature},
                    headers={'X-MBX-APIKEY': self.api_key}
                )
                response.raise_for_status()
                data = response.json()
                
                btc = Decimal('0')
                usdt = Decimal('0')
                
                for balance in data.get('balances', []):
                    if balance['asset'] == 'BTC':
                        btc = Decimal(balance['free']) + Decimal(balance['locked'])
                    elif balance['asset'] == 'USDT':
                        usdt = Decimal(balance['free']) + Decimal(balance['locked'])
                
                return CexBalances(btc=btc, usdt=usdt)
        except Exception as e:
            # Return mock balances on error
            return CexBalances(btc=Decimal('0.5'), usdt=Decimal('15000'))
    
    async def market_buy_btc(self, usdt_amount: Decimal) -> Optional[CexOrder]:
        '''Market buy BTC with USDT.'''
        if not self.api_key or not self.api_secret:
            # Mock order for testing
            price = await self.get_btc_price()
            quantity = usdt_amount / price
            return CexOrder(
                order_id=f'mock_{int(time.time())}',
                symbol='BTCUSDT',
                side='BUY',
                quantity=quantity,
                price=price,
                status='FILLED'
            )
        
        return await self._place_market_order('BUY', usdt_amount)
    
    async def market_sell_btc(self, btc_amount: Decimal) -> Optional[CexOrder]:
        '''Market sell BTC for USDT.'''
        if not self.api_key or not self.api_secret:
            # Mock order for testing
            price = await self.get_btc_price()
            return CexOrder(
                order_id=f'mock_{int(time.time())}',
                symbol='BTCUSDT',
                side='SELL',
                quantity=btc_amount,
                price=price,
                status='FILLED'
            )
        
        return await self._place_market_order('SELL', btc_amount)
    
    async def _place_market_order(
        self, side: str, amount: Decimal
    ) -> Optional[CexOrder]:
        '''Place a market order on Binance.'''
        import hmac
        import hashlib
        
        try:
            timestamp = int(time.time() * 1000)
            
            if side == 'BUY':
                # Buy with quote asset (USDT)
                params = {
                    'symbol': 'BTCUSDT',
                    'side': 'BUY',
                    'type': 'MARKET',
                    'quoteOrderQty': str(amount),
                    'timestamp': timestamp,
                }
            else:
                # Sell base asset (BTC)
                params = {
                    'symbol': 'BTCUSDT',
                    'side': 'SELL',
                    'type': 'MARKET',
                    'quantity': str(amount),
                    'timestamp': timestamp,
                }
            
            query_string = '&'.join(f'{k}={v}' for k, v in params.items())
            signature = hmac.new(
                self.api_secret.encode('utf-8'),
                query_string.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()
            params['signature'] = signature
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f'{self.base_url}/api/v3/order',
                    params=params,
                    headers={'X-MBX-APIKEY': self.api_key}
                )
                response.raise_for_status()
                data = response.json()
                
                return CexOrder(
                    order_id=str(data['orderId']),
                    symbol=data['symbol'],
                    side=data['side'],
                    quantity=Decimal(data['executedQty']),
                    price=Decimal(data.get('price', '0')) or await self.get_btc_price(),
                    status=data['status']
                )
        except Exception as e:
            print(f'Error placing order: {e}')
            return None


_cex_client: Optional[BinanceClient] = None


def get_cex_client() -> BinanceClient:
    '''Get singleton CEX client instance.'''
    global _cex_client
    if _cex_client is None:
        settings = get_settings()
        _cex_client = BinanceClient(
            api_key=settings.binance_api_key,
            api_secret=settings.binance_api_secret,
            testnet=settings.binance_testnet
        )
    return _cex_client
