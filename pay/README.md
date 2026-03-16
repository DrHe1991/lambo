# Pay Service - Web3 Payment Gateway

A standalone, extensible Web3 payment gateway supporting multi-chain deposits and withdrawals.

## Features

- **HD Wallet Address Generation**: Unique deposit addresses per user using BIP32/BIP44
- **Multi-Chain Support**: Starting with TRON (USDT), extensible to ETH, BSC, Solana, Bitcoin
- **Real-time Deposit Monitoring**: Background worker polls blockchain for deposits
- **Balance Management**: Automatic crediting after confirmation threshold
- **Withdrawal Processing**: Queue-based withdrawal with signature support
- **Multi-App Support**: Multiple applications can use the same payment gateway

## Architecture

```
pay/
├── app/
│   ├── main.py              # FastAPI entry point
│   ├── config.py            # Configuration settings
│   ├── models/              # SQLAlchemy models
│   ├── services/
│   │   ├── hd_wallet.py     # HD wallet address derivation
│   │   ├── tron_service.py  # TRON blockchain operations
│   │   └── monitor.py       # Deposit monitoring worker
│   ├── routes/              # API endpoints
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

## Security Considerations

- **xpub only**: The payment service only has the extended public key, not private keys
- **Cold signing**: Withdrawals require signatures from a separate cold wallet
- **API authentication**: Apps authenticate with API key/secret
- **Idempotent processing**: Deposits are deduplicated by tx_hash

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

## License

MIT
