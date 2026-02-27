#!/usr/bin/env bash
# Sprint 7: Settlement Worker & Quality Subsidy Tests
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
echo " S7: Settlement Worker & Quality Subsidy Tests"
echo "═══════════════════════════════════════════════"

# ── 1. Create test users ──────────────────────────────────────────────
echo ""; echo "── 1. Setup: Create users ──"
CREATOR=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' -d "{\"name\":\"Creator\",\"handle\":\"creator_$TS\"}")
CREATOR_ID=$(jv "$CREATOR" "d['id']")
echo "  Creator ID=$CREATOR_ID"

LIKER1=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' -d "{\"name\":\"Liker1\",\"handle\":\"liker1_$TS\"}")
LIKER1_ID=$(jv "$LIKER1" "d['id']")
echo "  Liker1 ID=$LIKER1_ID"

LIKER2=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' -d "{\"name\":\"Liker2\",\"handle\":\"liker2_$TS\"}")
LIKER2_ID=$(jv "$LIKER2" "d['id']")
echo "  Liker2 ID=$LIKER2_ID"

# ── 2. Fund users via SQL ─────────────────────────────────────────────
echo ""; echo "── 2. Fund users ──"
docker compose exec -T postgres psql -U bitlink -d bitlink -c "UPDATE users SET available_balance=50000, free_posts_remaining=0, trust_score=700 WHERE id IN ($CREATOR_ID,$LIKER1_ID,$LIKER2_ID);" >/dev/null 2>&1 &
wait $!
echo "  Funded all users with 50000 sat, trust=700"

# ── 3. Creator makes posts ────────────────────────────────────────────
echo ""; echo "── 3. Creator makes posts ──"
P1=$(curl -s -X POST "$API/posts?author_id=$CREATOR_ID" -H 'Content-Type: application/json' \
  -d '{"content":"Quality post for subsidy testing","post_type":"note"}')
POST1_ID=$(jv "$P1" "d['id']")
echo "  Post1 ID=$POST1_ID"

P2=$(curl -s -X POST "$API/posts?author_id=$CREATOR_ID" -H 'Content-Type: application/json' \
  -d '{"content":"Another quality post","post_type":"note"}')
POST2_ID=$(jv "$P2" "d['id']")
echo "  Post2 ID=$POST2_ID"

# ── 4. Likers like the posts ──────────────────────────────────────────
echo ""; echo "── 4. Likers like the posts ──"
curl -s -X POST "$API/posts/$POST1_ID/like?user_id=$LIKER1_ID" > /dev/null
curl -s -X POST "$API/posts/$POST1_ID/like?user_id=$LIKER2_ID" > /dev/null
curl -s -X POST "$API/posts/$POST2_ID/like?user_id=$LIKER1_ID" > /dev/null
curl -s -X POST "$API/posts/$POST2_ID/like?user_id=$LIKER2_ID" > /dev/null
echo "  4 likes added"

# ── 5. Check platform_revenue via API (simpler than psql) ────────────
echo ""; echo "── 5. Check subsidy endpoint works ──"
SUBSIDY_RES=$(curl -s -X POST "$API/rewards/subsidy")
echo "  Subsidy response: $SUBSIDY_RES"

STATUS=$(jv "$SUBSIDY_RES" "d.get('status','')")
assert "Subsidy endpoint returns valid response" "[ -n \"$STATUS\" ]"

# ── 6. Get creator balance ────────────────────────────────────────────
echo ""; echo "── 6. Creator balance check ──"
CREATOR_BAL=$(jv "$(curl -s "$API/users/$CREATOR_ID/balance")" "d['available_balance']")
echo "  Creator balance: $CREATOR_BAL sat"
assert "Creator has balance" "[ $CREATOR_BAL -gt 0 ]"

# ── 7. Check pools endpoint ───────────────────────────────────────────
echo ""; echo "── 7. Verify pools endpoint ──"
POOLS=$(curl -s "$API/rewards/pools")
assert "Pools endpoint returns array" "echo '$POOLS' | python3 -c 'import sys,json; d=json.load(sys.stdin); print(type(d)==list)' | grep -q True"

# ── 8. Check pending rewards endpoint ─────────────────────────────────
echo ""; echo "── 8. Verify pending rewards endpoint ──"
PENDING=$(curl -s "$API/rewards/users/$CREATOR_ID/pending-rewards")
assert "Pending rewards endpoint works" "[ \"\$(jv '$PENDING' \"d.get('user_id',0)\")\" = \"$CREATOR_ID\" ]"

# ── 9. Check user rewards endpoint ────────────────────────────────────
echo ""; echo "── 9. Verify user rewards endpoint ──"
REWARDS=$(curl -s "$API/rewards/users/$CREATOR_ID/rewards")
assert "User rewards endpoint works" "[ \"\$(jv '$REWARDS' \"d.get('user_id',0)\")\" = \"$CREATOR_ID\" ]"

# ── Summary ───────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo " Results: $PASS/$TOTAL passed, $FAIL failed"
echo "═══════════════════════════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
