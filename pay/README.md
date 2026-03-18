# Pay Service - Web3 Payment Gateway

A standalone, extensible Web3 payment gateway supporting multi-chain deposits, withdrawals, and CEX-backed USDT ↔ sat exchange.

## Features

- **HD Wallet Address Generation**: Unique deposit addresses per user using BIP32/BIP44
- **Multi-Chain Support**: Starting with TRON (USDT), extensible to ETH, BSC, Polygon
- **Real-time Deposit Monitoring**: Background worker polls blockchain for deposits
- **Balance Management**: Automatic crediting after confirmation threshold
- **Withdrawal Processing**: Queue-based withdrawal with signature support
- **Multi-App Support**: Multiple applications can use the same payment gateway
- **CEX Reserve Exchange**: USDT ↔ sat exchange backed by centralized exchange reserves
- **Automated Rebalancing**: Periodic reserve rebalancing with quota management
- **First Exchange Bonus**: 10% bonus on first USDT→sat exchange (up to $5)

## Architecture

```
pay/
├── app/
│   ├── main.py              # FastAPI entry point
│   ├── config.py            # Configuration settings
│   ├── models/
│   │   ├── wallet.py        # Wallet, DepositAddress, WalletBalance
│   │   ├── deposit.py       # Deposit model
│   │   ├── withdrawal.py    # Withdrawal model
│   │   ├── exchange.py      # Exchange, Quota, Rebalance models
│   │   └── ledger.py        # PayLedger for audit trail
│   ├── services/
│   │   ├── hd_wallet.py     # HD wallet address derivation
│   │   ├── tron_service.py  # TRON blockchain operations
│   │   ├── monitor.py       # Deposit monitoring worker
│   │   ├── cex_client.py    # Binance API client
│   │   ├── exchange_service.py  # USDT ↔ sat exchange
│   │   ├── rebalance_service.py # CEX reserve management
│   │   └── scheduler.py     # APScheduler for periodic tasks
│   ├── routes/
│   │   ├── apps.py          # App registration
│   │   ├── wallets.py       # Wallet operations
│   │   ├── deposits.py      # Deposit queries
│   │   ├── withdrawals.py   # Withdrawal operations
│   │   └── exchange.py      # Exchange endpoints
│   ├── schemas/             # Pydantic schemas
│   └── db/                  # Database setup
├── alembic/                 # Database migrations
├── scripts/                 # Test and utility scripts
└── requirements.txt
```

## Quick Start

### 1. Generate Test Wallet

```bash
cd pay
pip install -r requirements.txt
python scripts/test_shasta.py
```

This will output:
- Extended public key (xpub) for configuration
- Test deposit addresses
- Hot wallet info (for testing withdrawals)

### 2. Configure Environment

Create `.env` file:

```env
DATABASE_URL=postgresql+asyncpg://bitlink:bitlink_dev_password@localhost:5435/bitlink
REDIS_URL=redis://localhost:6380/1
TRON_NETWORK=shasta
TRON_XPUB=your_xpub_from_test_script
TRON_API_KEY=optional_trongrid_api_key
```

### 3. Run Migrations

```bash
cd pay
alembic upgrade head
```

### 4. Start Service

With Docker:
```bash
docker-compose up pay
```

Or directly:
```bash
cd pay
uvicorn app.main:app --reload --port 8004
```

## API Endpoints

### Apps

| Method | Path | Description |
|--------|------|-------------|
| POST | `/apps` | Register new client app |
| GET | `/apps/{id}` | Get app details |
| GET | `/apps` | List all apps |

### Wallets

| Method | Path | Description |
|--------|------|-------------|
| POST | `/wallets?app_id=1` | Create wallet for user |
| GET | `/wallets/{id}` | Get wallet details |
| GET | `/wallets/{id}/balance` | Get balance |
| GET | `/wallets/{id}/address?chain=tron` | Get/create deposit address |
| GET | `/wallets/{id}/ledger` | Get transaction history |

### Deposits

| Method | Path | Description |
|--------|------|-------------|
| GET | `/deposits/wallet/{id}` | List deposits |
| GET | `/deposits/{id}` | Get deposit details |

### Withdrawals

| Method | Path | Description |
|--------|------|-------------|
| POST | `/withdrawals/wallet/{id}` | Create withdrawal request |
| GET | `/withdrawals/wallet/{id}` | List withdrawals |
| GET | `/withdrawals/{id}` | Get withdrawal details |
| POST | `/withdrawals/{id}/cancel` | Cancel pending withdrawal |

### Exchange (CEX Reserve System)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/exchange/price` | Get current BTC price |
| GET | `/exchange/quota` | Get exchange quotas |
| GET | `/exchange/chain-fees` | Get network fees per chain |
| POST | `/exchange/preview` | Create 30s exchange preview |
| POST | `/exchange/confirm` | Confirm exchange |
| GET | `/exchange/history?wallet_id=1` | Get exchange history |
| POST | `/exchange/rebalance` | Trigger manual rebalance |

## Example Usage

### 1. Register an App

```bash
curl -X POST http://localhost:8004/apps \
  -H "Content-Type: application/json" \
  -d '{"name": "bitlink", "description": "BitLink social app"}'
```

Response:
```json
{
  "id": 1,
  "name": "bitlink",
  "api_key": "abc123...",
  "api_secret": "xyz789..."  // Only shown once!
}
```

### 2. Create a Wallet

```bash
curl -X POST "http://localhost:8004/wallets?app_id=1" \
  -H "Content-Type: application/json" \
  -d '{"external_user_id": "user_123"}'
```

### 3. Get Deposit Address

```bash
curl "http://localhost:8004/wallets/1/address?chain=tron"
```

Response:
```json
{
  "id": 1,
  "wallet_id": 1,
  "chain": "tron",
  "address": "TXyz...",
  "derivation_index": 0
}
```

### 4. Check Balance

```bash
curl "http://localhost:8004/wallets/1/balance"
```

Response:
```json
{
  "wallet_id": 1,
  "balance": 10000000,
  "locked_balance": 0,
  "available_balance": 10000000,
  "balance_formatted": "10.00",
  "available_formatted": "10.00"
}
```

## Testing on Shasta Testnet

1. Run `python scripts/test_shasta.py` to get test addresses
2. Get test TRX from faucet: https://shasta.tronex.io/
3. Get test USDT from faucet or swap
4. Send USDT to your deposit address
5. Monitor logs for deposit detection
6. Check balance after ~20 confirmations (~1 minute)

## CEX Reserve Exchange System

The exchange system allows users to convert between USDT and sat (satoshis) using a centralized exchange (Binance) as the backing reserve.

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     Binance CEX Account                          │
│   ┌─────────────┐                     ┌─────────────┐           │
│   │ BTC Reserve │ ◄──── Rebalance ───►│ USDT Reserve│           │
│   │   0.5 BTC   │                     │  $15,000    │           │
│   └─────────────┘                     └─────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Platform Internal Quotas                       │
│   ┌─────────────────────┐       ┌─────────────────────┐         │
│   │ Buy Sat Quota       │       │ Sell Sat Quota      │         │
│   │ (USDT → sat limit)  │       │ (sat → USDT limit)  │         │
│   │ ~$24,000 remaining  │       │ ~20M sat remaining  │         │
│   └─────────────────────┘       └─────────────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      User Exchange Flow                          │
│   1. User requests preview → locks rate for 30s                  │
│   2. User confirms → internal balance update                     │
│   3. Quota deducted → no immediate CEX trade                     │
│   4. When quota < 10% → trigger CEX rebalance                    │
└─────────────────────────────────────────────────────────────────┘
```

### Quota System

| Quota | Initial Value | Trigger Rebalance |
|-------|---------------|-------------------|
| buy_sat (USDT → sat) | CEX BTC × price × 80% | < 10% remaining |
| sell_sat (sat → USDT) | CEX USDT × 80% | < 10% remaining |

### Rebalancing

Rebalancing maintains the target BTC/USDT ratio (default 50/50):

- **Scheduled**: Every 12 hours
- **Quota-triggered**: When any quota falls below 10%
- **Manual**: Via `/exchange/rebalance` endpoint

### Exchange Fee

- 0.5% buffer fee on all exchanges (configurable via `exchange_buffer_rate`)

### First Exchange Bonus

- 10% bonus on first USDT → sat exchange
- Maximum bonus: $5 worth of exchange (so max +$0.50 worth of sat)
- Bonus applied at confirmation, advertised at deposit

### Configuration

```python
# pay/app/config.py

# CEX Configuration
binance_api_key: str = ''
binance_api_secret: str = ''
binance_testnet: bool = True

# Reserve Configuration
target_btc_ratio: float = 0.50      # Target 50% BTC
rebalance_deviation: float = 0.05   # Trade if deviation > 5%
quota_trigger_ratio: float = 0.10   # Rebalance if quota < 10%
reserve_usage_ratio: float = 0.80   # Use 80% of reserves

# Exchange Configuration
exchange_buffer_rate: float = 0.005  # 0.5% fee

# First Exchange Bonus
first_exchange_bonus_rate: float = 0.10   # 10%
first_exchange_bonus_cap_usd: float = 5.0 # Max $5 eligible

# Chain Fees (network fees for deposits)
chain_configs = {
    'tron': {'min_deposit': 5.0, 'network_fee': 0.15, 'enabled': True},
    'polygon': {'min_deposit': 5.0, 'network_fee': 0.05, 'enabled': False},
    'bsc': {'min_deposit': 10.0, 'network_fee': 0.20, 'enabled': False},
    'eth': {'min_deposit': 50.0, 'network_fee': 5.0, 'enabled': False},
}
```

### Exchange API Examples

#### Get Quote
```bash
curl http://localhost:8005/exchange/price
# {"btc_price": 62000.0}
```

#### Check Quotas
```bash
curl http://localhost:8005/exchange/quota
# {
#   "btc_price": 62000.0,
#   "buy_sat": {"initial": 24000000000, "remaining": 24000000000, "remaining_usd": 24000.0},
#   "sell_sat": {"initial": 20000000, "remaining": 20000000, "remaining_usd": 12000.0}
# }
```

#### Create Preview (USDT → sat)
```bash
curl -X POST http://localhost:8005/exchange/preview \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_id": 1,
    "amount": 10000000,
    "direction": "buy_sat",
    "include_bonus": true,
    "is_first_exchange": true
  }'
# {
#   "preview_id": "abc-123-...",
#   "amount_in": 10000000,
#   "amount_out": 16045,
#   "btc_price": 62000.0,
#   "buffer_rate": 0.005,
#   "bonus_sat": 1604,
#   "total_out": 17649,
#   "expires_in_seconds": 30
# }
```

#### Confirm Exchange
```bash
curl -X POST http://localhost:8005/exchange/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "preview_id": "abc-123-...",
    "wallet_id": 1
  }'
```

## Security Considerations

- **xpub only**: The payment service only has the extended public key, not private keys
- **Cold signing**: Withdrawals require signatures from a separate cold wallet
- **API authentication**: Apps authenticate with API key/secret
- **Idempotent processing**: Deposits are deduplicated by tx_hash
- **CEX API security**: Binance API keys should have trade-only permissions (no withdrawal)
- **Rate limiting**: Exchange previews expire after 30 seconds to limit price risk

## Extending to Other Chains

To add a new blockchain:

1. Add chain to `Chain` enum in `models/wallet.py`
2. Create chain service in `services/` (e.g., `eth_service.py`)
3. Update `monitor.py` to handle the new chain
4. Update `hd_wallet.py` with correct coin type

Example coin types (BIP44):
- Bitcoin: 0
- Ethereum: 60
- TRON: 195
- Solana: 501
- BSC: 60 (same as ETH)

## Database Models

### Core Models

| Table | Description |
|-------|-------------|
| `pay_apps` | Registered client applications |
| `pay_wallets` | User wallets per app |
| `pay_wallet_balances` | Token balances per wallet (USDT, TRX, SAT) |
| `pay_deposit_addresses` | HD-derived deposit addresses |
| `pay_deposits` | Incoming deposits |
| `pay_withdrawals` | Outgoing withdrawals |
| `pay_ledger` | Immutable audit trail |

### Exchange Models

| Table | Description |
|-------|-------------|
| `pay_exchange_quotas` | Platform-wide exchange limits |
| `pay_exchange_previews` | 30s valid exchange quotes |
| `pay_exchanges` | Completed exchange records |
| `pay_rebalance_logs` | CEX rebalancing history |
| `pay_reserve_snapshots` | Periodic reserve state snapshots |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection | - |
| `REDIS_URL` | Redis connection | - |
| `TRON_NETWORK` | TRON network (mainnet/shasta) | shasta |
| `TRON_XPUB` | Extended public key for HD wallets | - |
| `TRON_API_KEY` | TronGrid API key | - |
| `BINANCE_API_KEY` | Binance API key | - |
| `BINANCE_API_SECRET` | Binance API secret | - |
| `BINANCE_TESTNET` | Use Binance testnet | true |

## License

MIT
