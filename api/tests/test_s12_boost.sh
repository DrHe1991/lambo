#!/usr/bin/env bash
# Sprint 12: Boost Paid Promotion Tests
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
echo " S12: Boost Paid Promotion Tests"
echo "═══════════════════════════════════════════════"

# ── 1. Create test users ──────────────────────────────────────────────
echo ""; echo "── 1. Create test users ──"

ALICE=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Alice\",\"handle\":\"alice_boost_$TS\"}")
ALICE_ID=$(jv "$ALICE" "d['id']")
echo "  Alice ID=$ALICE_ID"

BOB=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Bob\",\"handle\":\"bob_boost_$TS\"}")
BOB_ID=$(jv "$BOB" "d['id']")
echo "  Bob ID=$BOB_ID"

# ── 2. Fund users ─────────────────────────────────────────────────────
echo ""; echo "── 2. Fund users ──"
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET available_balance=50000, free_posts_remaining=10 
   WHERE id IN ($ALICE_ID,$BOB_ID);" > /dev/null 2>&1 &
wait $!
echo "  Funded with 50000 sat each"

# ── 3. Alice creates a post ───────────────────────────────────────────
echo ""; echo "── 3. Alice creates a post ──"
POST=$(curl -s -X POST "$API/posts?author_id=$ALICE_ID" -H 'Content-Type: application/json' \
  -d '{"content":"Great content that needs boosting!"}')
POST_ID=$(jv "$POST" "d['id']")
echo "  Post ID=$POST_ID"

# ── 4. Check initial boost info ───────────────────────────────────────
echo ""; echo "── 4. Check initial boost info ──"
BOOST_INFO=$(curl -s "$API/posts/$POST_ID/boost")
echo "  Boost info: $BOOST_INFO"
IS_BOOSTED=$(jv "$BOOST_INFO" "d['is_boosted']")
REMAINING=$(jv "$BOOST_INFO" "d['boost_remaining']")
assert "Post not boosted initially" "[ \"$IS_BOOSTED\" = 'False' ]"
assert "Boost remaining = 0" "python3 -c \"assert $REMAINING == 0\""

# ── 5. Test minimum boost amount ──────────────────────────────────────
echo ""; echo "── 5. Test minimum boost amount ──"
FAIL_BOOST=$(curl -s -X POST "$API/posts/$POST_ID/boost?amount=500&user_id=$ALICE_ID")
echo "  Low boost response: $FAIL_BOOST"
assert "Rejected below minimum" "echo '$FAIL_BOOST' | grep -q 'detail'"

# ── 6. Test only author can boost ─────────────────────────────────────
echo ""; echo "── 6. Test only author can boost ──"
BOB_BOOST=$(curl -s -X POST "$API/posts/$POST_ID/boost?amount=1000&user_id=$BOB_ID")
echo "  Bob boost attempt: $BOB_BOOST"
assert "Non-author rejected" "echo '$BOB_BOOST' | grep -q 'detail'"

# ── 7. Successfully boost post ────────────────────────────────────────
echo ""; echo "── 7. Successfully boost post ──"
ALICE_BAL_BEFORE=$(jv "$(curl -s "$API/users/$ALICE_ID/balance")" "d['available_balance']")
echo "  Alice balance before: $ALICE_BAL_BEFORE"

BOOST=$(curl -s -X POST "$API/posts/$POST_ID/boost?amount=2000&user_id=$ALICE_ID")
echo "  Boost response: $BOOST"

AMOUNT_PAID=$(jv "$BOOST" "d['amount_paid']")
BOOST_POINTS=$(jv "$BOOST" "d['boost_points_added']")
MULTIPLIER=$(jv "$BOOST" "d['current_multiplier']")
echo "  Paid: $AMOUNT_PAID, Points: $BOOST_POINTS, Multiplier: $MULTIPLIER"

assert "Amount paid = 2000" "[ $AMOUNT_PAID -eq 2000 ]"
assert "Boost points = 20" "python3 -c \"assert $BOOST_POINTS == 20.0, '$BOOST_POINTS'\""
assert "Multiplier > 1" "python3 -c \"assert $MULTIPLIER > 1.0, '$MULTIPLIER'\""

# ── 8. Check balance deducted ─────────────────────────────────────────
echo ""; echo "── 8. Check balance deducted ──"
ALICE_BAL_AFTER=$(jv "$(curl -s "$API/users/$ALICE_ID/balance")" "d['available_balance']")
echo "  Alice balance after: $ALICE_BAL_AFTER"
EXPECTED=$((ALICE_BAL_BEFORE - 2000))
assert "Balance reduced by 2000" "[ $ALICE_BAL_AFTER -eq $EXPECTED ]"

# ── 9. Check boost info updated ───────────────────────────────────────
echo ""; echo "── 9. Check boost info updated ──"
BOOST_INFO2=$(curl -s "$API/posts/$POST_ID/boost")
echo "  Boost info: $BOOST_INFO2"
IS_BOOSTED2=$(jv "$BOOST_INFO2" "d['is_boosted']")
REMAINING2=$(jv "$BOOST_INFO2" "d['boost_remaining']")
assert "Post is now boosted" "[ \"$IS_BOOSTED2\" = 'True' ]"
assert "Boost remaining = 20" "python3 -c \"assert $REMAINING2 == 20.0\""

# ── 10. Add more boost ────────────────────────────────────────────────
echo ""; echo "── 10. Add more boost ──"
BOOST2=$(curl -s -X POST "$API/posts/$POST_ID/boost?amount=3000&user_id=$ALICE_ID")
TOTAL_REMAINING=$(jv "$BOOST2" "d['total_boost_remaining']")
echo "  Total remaining after 2nd boost: $TOTAL_REMAINING"
assert "Boost stacks (20 + 30 = 50)" "python3 -c \"assert $TOTAL_REMAINING == 50.0\""

# ── 11. Test decay ────────────────────────────────────────────────────
echo ""; echo "── 11. Test decay ──"
DECAY=$(curl -s -X POST "$API/rewards/boost/decay")
echo "  Decay result: $DECAY"
DECAYED=$(jv "$DECAY" "d['posts_decayed']")
assert "Posts decayed" "[ $DECAYED -ge 1 ]"

# Check remaining after decay (50 * 0.7 = 35)
BOOST_INFO3=$(curl -s "$API/posts/$POST_ID/boost")
REMAINING3=$(jv "$BOOST_INFO3" "d['boost_remaining']")
echo "  Remaining after decay: $REMAINING3"
assert "Boost decayed to ~35" "python3 -c \"assert 34 <= $REMAINING3 <= 36, '$REMAINING3'\""

# ── 12. Test max multiplier ───────────────────────────────────────────
echo ""; echo "── 12. Test max multiplier ──"
# Add huge boost
curl -s -X POST "$API/posts/$POST_ID/boost?amount=10000&user_id=$ALICE_ID" > /dev/null
BOOST_INFO4=$(curl -s "$API/posts/$POST_ID/boost")
MULT=$(jv "$BOOST_INFO4" "d['current_multiplier']")
echo "  Multiplier with high boost: $MULT"
assert "Multiplier capped at 5.0" "python3 -c \"assert $MULT == 5.0, '$MULT'\""

# ── 13. Check platform revenue ────────────────────────────────────────
echo ""; echo "── 13. Check platform revenue ──"
# Query platform_revenue for boost_revenue
REV=$(docker compose exec -T postgres psql -U bitlink -d bitlink -tAc \
  "SELECT COALESCE(SUM(boost_revenue), 0) FROM platform_revenue WHERE created_at > NOW() - INTERVAL '1 hour';")
echo "  Boost revenue: $REV"
assert "Platform received boost revenue" "[ ${REV:-0} -gt 0 ]"

# ── 14. Check ledger entries ──────────────────────────────────────────
echo ""; echo "── 14. Check ledger entries ──"
LEDGER=$(curl -s "$API/users/$ALICE_ID/ledger?limit=5")
HAS_BOOST=$(echo "$LEDGER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(e['action_type']=='spend_boost' for e in d))")
echo "  Has boost entry: $HAS_BOOST"
assert "Ledger has spend_boost entry" "[ \"$HAS_BOOST\" = 'True' ]"

# ── Summary ───────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo " Results: $PASS/$TOTAL passed, $FAIL failed"
echo "═══════════════════════════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
