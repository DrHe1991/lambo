# BitLink Test Wallets

**WARNING: These wallets are for TESTNET ONLY. Never use these addresses or the mnemonic for real funds.**

## Test Mnemonic

```
angle guard apart web ring gym bird wedding patient category milk cargo
```

This mnemonic is used to derive all test deposit addresses and hot wallets using BIP44 standard paths.

## Hot Wallet Addresses

Hot wallets are used to fund test user deposit addresses and process withdrawals on testnets.

Derivation path: `m/44'/COIN'/0'/1/0` (internal change path, index 0)

| Chain | Network | Address | Faucet |
|-------|---------|---------|--------|
| TRON | Shasta | `TNnatCFqYS4nCNXa3MHQMh7ZGewujvTmuy` | [shasta.tronscan.org](https://shasta.tronscan.org/#/faucet) |
| Ethereum | Sepolia | `0x4a8FFF6bD1dcefFB28da8f74D83De90ea3985530` | [sepoliafaucet.com](https://sepoliafaucet.com/) |
| BSC | Testnet | `0x4a8FFF6bD1dcefFB28da8f74D83De90ea3985530` | [bnbchain.org](https://testnet.bnbchain.org/faucet-smart) |
| Polygon | Mumbai | `0x4a8FFF6bD1dcefFB28da8f74D83De90ea3985530` | [polygon.technology](https://faucet.polygon.technology/) |
| Bitcoin | Testnet | `1LQyRkYZUFG4he7F6ciNsokxckSc9wkCsy` | [coinfaucet.eu](https://coinfaucet.eu/en/btc-testnet/) |

> **Note:** EVM chains (Ethereum, BSC, Polygon) share the same address since they use the same derivation path (coin type 60).

## User Deposit Addresses

User deposit addresses are derived from the external change path: `m/44'/COIN'/0'/0/{index}`

Each user gets a unique index. The first user (index 0) gets:

| Chain | Address |
|-------|---------|
| TRON | `TKRqwozvQ1f8doqLNMdMsnjkuGJpkA6ioe` |

## How to Fund Test Accounts

### Option 1: Fund Hot Wallet (Recommended)

1. Go to the appropriate faucet for the chain
2. Enter the hot wallet address from the table above
3. Request test tokens
4. The hot wallet can then send to any user deposit address

### Option 2: Fund User Address Directly

1. Go to the faucet
2. Enter the specific user deposit address
3. The deposit monitor will detect and credit the balance

## Accepted Tokens

| Network | Token | Contract Address |
|---------|-------|------------------|
| TRON Mainnet | USDT | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` |
| Shasta Testnet | USDT | `TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs` |
| Nile Testnet | USDT | `TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj` |

To test deposits on Shasta:
1. Get test TRX from faucet (for gas fees)
2. Get test USDT from faucet: https://shasta.tronscan.org/#/faucet
3. Send USDT to your deposit address

## Security Notes

- Never commit real private keys or mnemonics
- This test mnemonic is publicly documented and should never hold real funds
- Production will use a different mnemonic stored securely in environment variables
- Hot wallet private keys are only accessible in the `pay` service container
