#!/usr/bin/env bash
set -euo pipefail

# BitLink — One-time VPS setup script
# Run as root on a fresh Ubuntu 22.04+ server:
#   curl -sSL https://raw.githubusercontent.com/YOUR_USER/lambo/main/scripts/setup-server.sh | bash

REPO_URL="${REPO_URL:-https://github.com/YOUR_USER/lambo.git}"
APP_DIR="/home/bitlink/bitlink"

echo "=== BitLink Server Setup ==="

# 1. System updates
echo "[1/7] Updating system..."
apt-get update -qq && apt-get upgrade -y -qq

# 2. Install Docker
echo "[2/7] Installing Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

# 3. Create app user
echo "[3/7] Creating app user..."
if ! id -u bitlink &>/dev/null; then
  useradd -m -s /bin/bash bitlink
  usermod -aG docker bitlink
fi

# 4. Clone repo
echo "[4/7] Cloning repository..."
sudo -u bitlink bash -c "
  if [ ! -d ${APP_DIR} ]; then
    git clone ${REPO_URL} ${APP_DIR}
  else
    cd ${APP_DIR} && git pull origin main
  fi
"

# 5. Create .env.prod from example
echo "[5/7] Setting up environment..."
if [ ! -f "${APP_DIR}/.env.prod" ]; then
  sudo -u bitlink cp "${APP_DIR}/.env.prod.example" "${APP_DIR}/.env.prod"
  echo "  -> Created .env.prod — edit it with your real values:"
  echo "     nano ${APP_DIR}/.env.prod"
else
  echo "  -> .env.prod already exists, skipping"
fi

# 6. Configure firewall
echo "[6/7] Configuring firewall..."
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

# 7. Summary
echo "[7/7] Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit environment:  nano ${APP_DIR}/.env.prod"
echo "  2. Point DNS A records to this server's IP:"
echo "       api.yourdomain.com  -> $(curl -s ifconfig.me)"
echo "       app.yourdomain.com  -> $(curl -s ifconfig.me)"
echo "       media.yourdomain.com -> $(curl -s ifconfig.me)"
echo "  3. Build UI locally and scp dist/ to server, or push to main to trigger CI"
echo "  4. Start services:"
echo "       cd ${APP_DIR}"
echo "       docker compose -f docker-compose.prod.yml --env-file .env.prod up -d"
echo "  5. Run initial migrations:"
echo "       docker compose -f docker-compose.prod.yml exec api alembic upgrade head"
echo "       docker compose -f docker-compose.prod.yml exec pay alembic upgrade head"
