#!/usr/bin/env bash
set -euo pipefail

# BitLink Manual Deploy Script
# Usage:
#   ./scripts/deploy.sh          # Full deploy (UI + API)
#   ./scripts/deploy.sh api      # API-only (no UI rebuild)
#   ./scripts/deploy.sh ui       # UI-only (no API rebuild)
#   ./scripts/deploy.sh logs     # Tail API logs
#   ./scripts/deploy.sh ssh      # SSH into server
#   ./scripts/deploy.sh status   # Check container status

VPS_HOST="129.212.227.242"
VPS_USER="bitlink"
SSH_KEY="$HOME/.ssh/bitlink-do"
DOMAIN="bit-link.app"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_DIR="~/lambo"
SSH_CMD="ssh -i $SSH_KEY $VPS_USER@$VPS_HOST"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

build_ui() {
  echo "→ Building UI..."
  cd "$PROJECT_DIR/ui"
  VITE_API_URL="https://api.$DOMAIN" \
  VITE_GOOGLE_CLIENT_ID="99467099885-njmme06oms9n65j4pe9d33cp6f8rvok1.apps.googleusercontent.com" \
  npm run build
  echo "→ Uploading UI to server..."
  cd "$PROJECT_DIR"
  scp -i "$SSH_KEY" -r ui/dist "$VPS_USER@$VPS_HOST:$REMOTE_DIR/ui/"
  echo "✓ UI deployed"
}

deploy_api() {
  echo "→ Pulling latest code & rebuilding API..."
  $SSH_CMD << EOF
    cd $REMOTE_DIR
    git pull origin main
    $COMPOSE build api pay
    $COMPOSE up -d
    $COMPOSE exec -T api alembic upgrade head
    $COMPOSE exec -T pay alembic upgrade head
EOF
  echo "✓ API deployed"
}

restart_caddy() {
  $SSH_CMD "cd $REMOTE_DIR && $COMPOSE restart caddy"
}

case "${1:-full}" in
  full)
    build_ui
    deploy_api
    echo "✓ Full deploy complete"
    ;;
  api)
    deploy_api
    ;;
  ui)
    build_ui
    restart_caddy
    echo "✓ UI-only deploy complete"
    ;;
  logs)
    $SSH_CMD "cd $REMOTE_DIR && $COMPOSE logs --tail 50 -f ${2:-api}"
    ;;
  ssh)
    exec $SSH_CMD
    ;;
  status)
    $SSH_CMD "cd $REMOTE_DIR && $COMPOSE ps --format 'table {{.Name}}\t{{.Status}}'"
    ;;
  *)
    echo "Usage: $0 {full|api|ui|logs [service]|ssh|status}"
    exit 1
    ;;
esac
