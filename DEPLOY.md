# BitLink Deployment Guide

## Architecture Overview

```
Internet
  |
  ├── Android App ──> api.yourdomain.com ──┐
  └── Browser ──────> app.yourdomain.com ──┤
                                           ▼
                                    ┌─── Caddy (HTTPS) ───┐
                                    │  :80/:443 reverse    │
                                    │  proxy + auto certs  │
                                    └──┬──────┬──────┬─────┘
                                       │      │      │
                                   API:8000  UI    MinIO
                                       │   (static) (media)
                                       │
                                   Pay:8000
                                       │
                              ┌────────┴────────┐
                              │                 │
                          PostgreSQL          Redis
```

## Environments

| | Dev (local) | Prod (VPS) |
|---|---|---|
| Command | `docker-compose up` | `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d` |
| API URL | `http://localhost:8003` | `https://api.yourdomain.com` |
| Media URL | `http://localhost:9000` | `https://media.yourdomain.com` |
| HTTPS | No | Yes (Caddy auto-cert) |
| DB password | `bitlink_dev_password` | Random strong password |
| Debug | `true` | `false` |

---

## Server Setup (One-Time)

### 1. Provision VPS

Recommended: **Hetzner CX22** (2 vCPU, 4GB RAM, 40GB SSD, ~EUR 4/month)

Alternatives: DigitalOcean $6/mo, Vultr $6/mo

OS: Ubuntu 22.04 LTS

### 2. Run Setup Script

```bash
ssh root@YOUR_SERVER_IP
curl -sSL https://raw.githubusercontent.com/YOUR_USER/lambo/main/scripts/setup-server.sh | bash
```

Or manually:

```bash
apt-get update && apt-get upgrade -y
curl -fsSL https://get.docker.com | sh
useradd -m -s /bin/bash bitlink
usermod -aG docker bitlink
su - bitlink
git clone https://github.com/YOUR_USER/lambo.git ~/bitlink
cp ~/bitlink/.env.prod.example ~/bitlink/.env.prod
```

### 3. Configure DNS

Add A records pointing to your VPS IP:

```
api.yourdomain.com    -> YOUR_SERVER_IP
app.yourdomain.com    -> YOUR_SERVER_IP
media.yourdomain.com  -> YOUR_SERVER_IP
```

### 4. Edit Environment

```bash
nano ~/bitlink/.env.prod
```

Generate secure values:

```bash
# Database password
openssl rand -base64 24

# Secret key
openssl rand -base64 32

# Redis password
openssl rand -base64 24

# MinIO keys
openssl rand -base64 20  # access key
openssl rand -base64 40  # secret key
```

### 5. Build UI and Start

From your local machine:

```bash
cd ui
VITE_API_URL=https://api.yourdomain.com npm run build
scp -r dist/ bitlink@YOUR_SERVER_IP:~/bitlink/ui/
```

On the server:

```bash
cd ~/bitlink
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### 6. Run Migrations

```bash
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
docker compose -f docker-compose.prod.yml exec pay alembic upgrade head
```

### 7. Verify

```bash
curl https://api.yourdomain.com/health
# {"status":"ok","service":"bitlink-api"}
```

---

## Environment Variables Reference

| Variable | Service | Description |
|---|---|---|
| `DOMAIN` | Caddy | Your domain (e.g. `bitlink.example.com`) |
| `DB_USER` | Postgres | Database username |
| `DB_PASSWORD` | Postgres | Database password |
| `DB_NAME` | Postgres | Database name |
| `REDIS_PASSWORD` | Redis | Redis password |
| `SECRET_KEY` | API | JWT signing key |
| `S3_ACCESS_KEY` | API, MinIO | MinIO access key |
| `S3_SECRET_KEY` | API, MinIO | MinIO secret key |
| `TRON_NETWORK` | Pay | `shasta` (testnet) or `mainnet` |
| `TRON_XPUB` | Pay | Extended public key for HD wallet |
| `TRON_API_KEY` | Pay | TronGrid API key |
| `BINANCE_API_KEY` | Pay | Binance API key |
| `BINANCE_API_SECRET` | Pay | Binance API secret |
| `BINANCE_TESTNET` | Pay | `true` for testnet |

---

## CI/CD (GitHub Actions)

### Auto Deploy on Push to Main

Workflow: `.github/workflows/deploy.yml`

1. Runs CI (lint, test, typecheck, build)
2. Builds UI with production `VITE_API_URL`
3. SSHs to VPS, pulls latest code
4. Copies UI build, rebuilds Docker images
5. Restarts services, runs migrations

**Required GitHub Secrets:**

| Secret | Value |
|---|---|
| `VPS_HOST` | Server IP or hostname |
| `VPS_USER` | `bitlink` |
| `VPS_SSH_KEY` | Private SSH key (ed25519 recommended) |
| `DOMAIN` | `yourdomain.com` |

Setup SSH key:

```bash
# On your machine
ssh-keygen -t ed25519 -f bitlink-deploy -N ""
# Copy public key to server
ssh-copy-id -i bitlink-deploy.pub bitlink@YOUR_SERVER_IP
# Add private key content as VPS_SSH_KEY secret in GitHub
```

### Build APK

Workflow: `.github/workflows/build-apk.yml`

Triggered by:
- Tag push (`v*`) — builds release APK and creates GitHub Release
- Manual dispatch — choose debug or release

**Additional GitHub Secrets for release builds:**

| Secret | Value |
|---|---|
| `KEYSTORE_BASE64` | Base64-encoded keystore file |
| `KEYSTORE_PASSWORD` | Keystore password |
| `KEY_ALIAS` | Key alias name |
| `KEY_PASSWORD` | Key password |

Generate keystore:

```bash
keytool -genkey -v -keystore bitlink.keystore \
  -alias bitlink -keyalg RSA -keysize 2048 -validity 10000
base64 -i bitlink.keystore | pbcopy  # copies to clipboard for GitHub secret
```

---

## Building APK for Real Device Testing

### Quick (debug, no signing)

```bash
cd ui
VITE_API_URL=https://api.yourdomain.com npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

APK location: `ui/android/app/build/outputs/apk/debug/app-debug.apk`

Transfer to phone via ADB or direct file transfer.

### Release (signed)

```bash
cd ui/android
./gradlew assembleRelease
```

Requires keystore configured in `app/build.gradle` (see Capacitor config section).

---

## Database Operations

### Backup

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U $DB_USER $DB_NAME > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore

```bash
cat backup.sql | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U $DB_USER $DB_NAME
```

### Connect to DB

```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U $DB_USER $DB_NAME
```

---

## Rollback

### Code rollback

```bash
ssh bitlink@YOUR_SERVER_IP
cd ~/bitlink
git log --oneline -5          # find the commit to roll back to
git checkout <commit-hash>
docker compose -f docker-compose.prod.yml --env-file .env.prod build api pay
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### Database rollback

```bash
docker compose -f docker-compose.prod.yml exec api alembic downgrade -1
docker compose -f docker-compose.prod.yml exec pay alembic downgrade -1
```

---

## Monitoring

### Service health

```bash
# All containers
docker compose -f docker-compose.prod.yml ps

# API health
curl -s https://api.yourdomain.com/health

# Pay health
docker compose -f docker-compose.prod.yml exec pay curl -s http://localhost:8000/health
```

### Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f pay
docker compose -f docker-compose.prod.yml logs -f caddy

# Last 100 lines
docker compose -f docker-compose.prod.yml logs --tail 100 api
```

### Resource usage

```bash
docker stats
```

---

## Troubleshooting

### Caddy not getting HTTPS cert

- Verify DNS A records resolve to your server IP: `dig api.yourdomain.com`
- Check Caddy logs: `docker compose -f docker-compose.prod.yml logs caddy`
- Ensure ports 80 and 443 are open: `ufw status`

### API can't connect to database

- Check postgres is healthy: `docker compose -f docker-compose.prod.yml ps postgres`
- Verify DATABASE_URL in .env.prod matches DB_USER/DB_PASSWORD/DB_NAME
- Check API logs for connection errors

### Media uploads fail

- Check MinIO is running: `docker compose -f docker-compose.prod.yml ps minio`
- Verify S3_ACCESS_KEY and S3_SECRET_KEY match between API env and MinIO env
- Check that `S3_PUBLIC_URL` is set to `https://media.yourdomain.com`

### WebSocket chat not connecting

- Caddy supports WebSocket proxying natively — no extra config needed
- Verify the app uses `wss://api.yourdomain.com` (derived from VITE_API_URL)
- Check browser console for connection errors
