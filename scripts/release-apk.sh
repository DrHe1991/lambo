#!/usr/bin/env bash
set -euo pipefail

# BitLink APK Release Script
# Usage:
#   ./scripts/release-apk.sh v0.2.0        # Build, tag, upload APK as bitlink-v0.2.0.apk
#   ./scripts/release-apk.sh               # Auto-increment from latest git tag

VPS_HOST="129.212.227.242"
VPS_USER="bitlink"
SSH_KEY="$HOME/.ssh/bitlink-do"
DOMAIN="bit-link.app"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_DIR="~/lambo"
SSH_CMD="ssh -i $SSH_KEY $VPS_USER@$VPS_HOST"
ANDROID_DIR="$PROJECT_DIR/ui/android"
JAVA_HOME_PATH="/Applications/Android Studio.app/Contents/jbr/Contents/Home"

get_next_version() {
  local latest
  latest=$(git tag --sort=-v:refname | grep '^v' | head -1 2>/dev/null || echo "")
  if [[ -z "$latest" ]]; then
    echo "v0.1.0"
    return
  fi
  local major minor patch
  IFS='.' read -r major minor patch <<< "${latest#v}"
  echo "v${major}.${minor}.$((patch + 1))"
}

VERSION="${1:-$(get_next_version)}"
APK_NAME="bitlink-${VERSION}.apk"

echo "========================================"
echo "  BitLink APK Release — $VERSION"
echo "========================================"
echo ""

echo "[1/5] Building UI with production API..."
cd "$PROJECT_DIR/ui"
VITE_API_URL="https://api.$DOMAIN" \
VITE_GOOGLE_CLIENT_ID="99467099885-njmme06oms9n65j4pe9d33cp6f8rvok1.apps.googleusercontent.com" \
npm run build --silent

echo "[2/5] Syncing Capacitor..."
npx cap sync android 2>/dev/null

echo "[3/5] Building debug APK..."
cd "$ANDROID_DIR"
export JAVA_HOME="$JAVA_HOME_PATH"
./gradlew assembleDebug --quiet

APK_PATH=$(find "$ANDROID_DIR/app/build" -name '*debug*.apk' | head -1)
if [[ -z "$APK_PATH" ]]; then
  echo "ERROR: APK not found"
  exit 1
fi
APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
echo "  APK built: $APK_SIZE"

echo "[4/5] Uploading $APK_NAME to server..."
scp -i "$SSH_KEY" "$APK_PATH" "$VPS_USER@$VPS_HOST:$REMOTE_DIR/homepage/$APK_NAME"

echo "[5/5] Updating homepage download link..."
$SSH_CMD bash -s "$APK_NAME" "$VERSION" << 'REMOTE'
  APK_NAME="$1"
  VERSION="$2"
  cd ~/lambo/homepage

  # Remove old APK files (keep only the new one)
  find . -name 'bitlink-v*.apk' -o -name 'bitlink.apk' | while read f; do
    [[ "$(basename "$f")" != "$APK_NAME" ]] && rm -f "$f"
  done

  # Update download link and version hint in index.html
  sed -i "s|href=\"/bitlink[^\"]*\.apk\"|href=\"/$APK_NAME\"|g" index.html
  sed -i "s|Android APK.*<a|Android $VERSION \&middot; <a|g" index.html

  echo "  Server updated: /$APK_NAME"
REMOTE

echo ""
echo "Done!"
echo "  Download: https://$DOMAIN/$APK_NAME"
echo "  Homepage: https://$DOMAIN"
echo ""

read -p "Create git tag $VERSION? [y/N] " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  cd "$PROJECT_DIR"
  git tag "$VERSION"
  git push origin "$VERSION"
  echo "  Tag $VERSION pushed"
fi
