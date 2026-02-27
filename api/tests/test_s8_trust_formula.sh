#!/usr/bin/env bash
# Sprint 8: Trust Formula Update Tests
set -euo pipefail

API="http://localhost:8001/api"
PASS=0; FAIL=0; TOTAL=0
TS=$(date +%s)

assert() {
  TOTAL=$((TOTAL+1))
  local desc="$1"; local cond="$2"
  if eval "$cond"; then
    PASS=$((PASS+1)); echo "  ✅ $desc"
  else
    FAIL=$((FAIL+1)); echo "  ❌ FAIL: $desc (condition: $cond)"
  fi
}

jv() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print($2)"; }

echo "═══════════════════════════════════════════════"
echo " S8: Trust Formula Update Tests"
echo "═══════════════════════════════════════════════"

# ── 1. Create new user and check default scores ──────────────────────
echo ""; echo "── 1. New user default scores (S8) ──"
USER=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"NewUser\",\"handle\":\"newuser_$TS\"}")
USER_ID=$(jv "$USER" "d['id']")
echo "  User ID=$USER_ID"

TRUST=$(curl -s "$API/users/$USER_ID/trust")
echo "  Trust: $TRUST"

CREATOR=$(jv "$TRUST" "d['creator_score']")
CURATOR=$(jv "$TRUST" "d['curator_score']")
JUROR=$(jv "$TRUST" "d['juror_score']")
RISK=$(jv "$TRUST" "d['risk_score']")
TRUST_SCORE=$(jv "$TRUST" "d['trust_score']")
TIER=$(jv "$TRUST" "d['tier']")

# S8 defaults: creator=150, curator=150, juror=300, risk=30
assert "Default creator_score=150" "[ $CREATOR -eq 150 ]"
assert "Default curator_score=150" "[ $CURATOR -eq 150 ]"
assert "Default juror_score=300" "[ $JUROR -eq 300 ]"
assert "Default risk_score=30" "[ $RISK -eq 30 ]"

# Trust = 150*0.6 + 150*0.3 + 0 - (30/50)^2 = 90 + 45 - 0.36 ≈ 135
assert "Trust score ~135" "[ $TRUST_SCORE -ge 130 ] && [ $TRUST_SCORE -le 140 ]"
assert "New user tier=white (score <= 150)" "[ \"$TIER\" = 'white' ]"

# ── 2. Check tier boundaries ─────────────────────────────────────────
echo ""; echo "── 2. Tier boundaries (S8) ──"
# Create users with specific trust scores to test tier boundaries

# GREEN: 151-250
GREEN_USER=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"GreenUser\",\"handle\":\"green_$TS\"}")
GREEN_ID=$(jv "$GREEN_USER" "d['id']")
# Set scores to get trust ~200
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET creator_score=250, curator_score=200, juror_score=300, risk_score=0 WHERE id=$GREEN_ID;" >/dev/null 2>&1 &
wait $!

# Refresh trust via API
GREEN_TRUST=$(curl -s "$API/users/$GREEN_ID/trust")
GREEN_SCORE=$(jv "$GREEN_TRUST" "d['trust_score']")
GREEN_TIER=$(jv "$GREEN_TRUST" "d['tier']")
echo "  Green user: score=$GREEN_SCORE, tier=$GREEN_TIER"
# 250*0.6 + 200*0.3 = 150 + 60 = 210 → should be GREEN
assert "Green user tier=green" "[ \"$GREEN_TIER\" = 'green' ]"

# BLUE: 251-400
BLUE_USER=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"BlueUser\",\"handle\":\"blue_$TS\"}")
BLUE_ID=$(jv "$BLUE_USER" "d['id']")
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET creator_score=400, curator_score=300, juror_score=300, risk_score=0 WHERE id=$BLUE_ID;" >/dev/null 2>&1 &
wait $!

BLUE_TRUST=$(curl -s "$API/users/$BLUE_ID/trust")
BLUE_SCORE=$(jv "$BLUE_TRUST" "d['trust_score']")
BLUE_TIER=$(jv "$BLUE_TRUST" "d['tier']")
echo "  Blue user: score=$BLUE_SCORE, tier=$BLUE_TIER"
# 400*0.6 + 300*0.3 = 240 + 90 = 330 → should be BLUE
assert "Blue user tier=blue" "[ \"$BLUE_TIER\" = 'blue' ]"

# PURPLE: 401-700
PURPLE_USER=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"PurpleUser\",\"handle\":\"purple_$TS\"}")
PURPLE_ID=$(jv "$PURPLE_USER" "d['id']")
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET creator_score=600, curator_score=500, juror_score=400, risk_score=0 WHERE id=$PURPLE_ID;" >/dev/null 2>&1 &
wait $!

PURPLE_TRUST=$(curl -s "$API/users/$PURPLE_ID/trust")
PURPLE_SCORE=$(jv "$PURPLE_TRUST" "d['trust_score']")
PURPLE_TIER=$(jv "$PURPLE_TRUST" "d['tier']")
echo "  Purple user: score=$PURPLE_SCORE, tier=$PURPLE_TIER"
# 600*0.6 + 500*0.3 + (400-300)*0.1 = 360 + 150 + 10 = 520 → should be PURPLE
assert "Purple user tier=purple" "[ \"$PURPLE_TIER\" = 'purple' ]"

# ORANGE: 701+
ORANGE_USER=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"OrangeUser\",\"handle\":\"orange_$TS\"}")
ORANGE_ID=$(jv "$ORANGE_USER" "d['id']")
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET creator_score=1000, curator_score=800, juror_score=500, risk_score=0 WHERE id=$ORANGE_ID;" >/dev/null 2>&1 &
wait $!

ORANGE_TRUST=$(curl -s "$API/users/$ORANGE_ID/trust")
ORANGE_SCORE=$(jv "$ORANGE_TRUST" "d['trust_score']")
ORANGE_TIER=$(jv "$ORANGE_TRUST" "d['tier']")
echo "  Orange user: score=$ORANGE_SCORE, tier=$ORANGE_TIER"
# 1000*0.6 + 800*0.3 + (500-300)*0.1 = 600 + 240 + 20 = 860 → should be ORANGE
assert "Orange user tier=orange" "[ \"$ORANGE_TIER\" = 'orange' ]"

# ── 3. Risk penalty impact ───────────────────────────────────────────
echo ""; echo "── 3. Risk penalty impact ──"
RISKY_USER=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"RiskyUser\",\"handle\":\"risky_$TS\"}")
RISKY_ID=$(jv "$RISKY_USER" "d['id']")
# High risk should dramatically reduce trust
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET creator_score=500, curator_score=500, juror_score=300, risk_score=200 WHERE id=$RISKY_ID;" >/dev/null 2>&1 &
wait $!

RISKY_TRUST=$(curl -s "$API/users/$RISKY_ID/trust")
RISKY_SCORE=$(jv "$RISKY_TRUST" "d['trust_score']")
RISKY_TIER=$(jv "$RISKY_TRUST" "d['tier']")
echo "  Risky user: score=$RISKY_SCORE, tier=$RISKY_TIER"
# 500*0.6 + 500*0.3 - (125 + (200-100)*5) = 300 + 150 - 625 = -175 → clamped to 0
assert "High risk user score low" "[ $RISKY_SCORE -lt 100 ]"
assert "High risk user tier=white" "[ \"$RISKY_TIER\" = 'white' ]"

# ── 4. Fee multiplier still works ────────────────────────────────────
echo ""; echo "── 4. Fee multiplier ──"
COSTS=$(curl -s "$API/users/$USER_ID/costs")
K=$(jv "$COSTS" "d['fee_multiplier']")
echo "  New user (trust~135) K=$K"
# K = 1.4 - 135/1250 ≈ 1.29
assert "Fee multiplier > 1.2 (low trust)" "python3 -c \"assert $K > 1.2, '$K'\""

ORANGE_COSTS=$(curl -s "$API/users/$ORANGE_ID/costs")
ORANGE_K=$(jv "$ORANGE_COSTS" "d['fee_multiplier']")
echo "  Orange user (trust~860) K=$ORANGE_K"
# K = 1.4 - 860/1250 ≈ 0.71
assert "Orange fee multiplier < 0.8 (high trust)" "python3 -c \"assert $ORANGE_K < 0.8, '$ORANGE_K'\""

# ── 5. Creator score can exceed 1000 ─────────────────────────────────
echo ""; echo "── 5. Creator score no cap ──"
ELITE_USER=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"EliteCreator\",\"handle\":\"elite_$TS\"}")
ELITE_ID=$(jv "$ELITE_USER" "d['id']")
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET creator_score=1500, curator_score=1000 WHERE id=$ELITE_ID;" >/dev/null 2>&1 &
wait $!

ELITE_TRUST=$(curl -s "$API/users/$ELITE_ID/trust")
ELITE_CREATOR=$(jv "$ELITE_TRUST" "d['creator_score']")
ELITE_SCORE=$(jv "$ELITE_TRUST" "d['trust_score']")
echo "  Elite: creator=$ELITE_CREATOR, trust=$ELITE_SCORE"
# 1500*0.6 + 1000*0.3 = 900 + 300 = 1200 → trust can exceed 1000
assert "Creator can exceed 1000" "[ $ELITE_CREATOR -eq 1500 ]"
assert "Trust score can exceed 1000" "[ $ELITE_SCORE -gt 1000 ]"

# ── Summary ───────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo " Results: $PASS/$TOTAL passed, $FAIL failed"
echo "═══════════════════════════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
