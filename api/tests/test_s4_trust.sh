#!/usr/bin/env bash
# Sprint 4: TrustScore Multi-Dimension & Dynamic Fees — Integration Tests
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
echo " S4: TrustScore & Dynamic Fees Tests"
echo "═══════════════════════════════════════════════"

# ── 1. Create test users ──────────────────────────────────────────────
echo ""; echo "── 1. Setup: Create users ──"
ALICE=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' -d "{\"name\":\"Alice\",\"handle\":\"alice_$TS\"}")
ALICE_ID=$(jv "$ALICE" "d['id']")
echo "  Alice ID=$ALICE_ID"

BOB=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' -d "{\"name\":\"Bob\",\"handle\":\"bob_$TS\"}")
BOB_ID=$(jv "$BOB" "d['id']")
echo "  Bob ID=$BOB_ID"

# ── 2. Default trust breakdown ────────────────────────────────────────
echo ""; echo "── 2. Default trust breakdown ──"
TRUST=$(curl -s "$API/users/$ALICE_ID/trust")
echo "  $TRUST"
assert "Default creator_score=500" "[ $(jv "$TRUST" "d['creator_score']") -eq 500 ]"
assert "Default curator_score=500" "[ $(jv "$TRUST" "d['curator_score']") -eq 500 ]"
assert "Default juror_score=500"   "[ $(jv "$TRUST" "d['juror_score']") -eq 500 ]"
assert "Default risk_score=0"      "[ $(jv "$TRUST" "d['risk_score']") -eq 0 ]"
assert "Composite trust=600"       "[ $(jv "$TRUST" "d['trust_score']") -eq 600 ]"
assert "Tier=blue"                 "[ \"$(jv "$TRUST" "d['tier']")\" = 'blue' ]"

# ── 3. Default dynamic costs ──────────────────────────────────────────
echo ""; echo "── 3. Default costs (trust=600) ──"
COSTS=$(curl -s "$API/users/$ALICE_ID/costs")
echo "  $COSTS"
K=$(jv "$COSTS" "d['fee_multiplier']")
assert "Fee multiplier ~0.92" "python3 -c \"assert 0.85 < $K < 0.95, '$K not in range'\""
POST_COST=$(jv "$COSTS" "d['costs']['post']")
# S6: base post cost changed from 200 to 50
assert "Post cost < 50 (discounted)" "[ $POST_COST -lt 50 ]"
assert "Post cost > 40 (not too low)" "[ $POST_COST -gt 40 ]"

# ── 4. Give users balance for testing ─────────────────────────────────
echo ""; echo "── 4. Fund test users ──"
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET available_balance=50000 WHERE id IN ($ALICE_ID,$BOB_ID);" > /dev/null 2>&1
echo "  Funded Alice & Bob with 50000 sat each"

# ── 5. Dynamic fees actually applied ─────────────────────────────────
echo ""; echo "── 5. Post creation uses dynamic fee ──"
BAL_BEFORE=$(jv "$(curl -s "$API/users/$ALICE_ID/balance")" "d['available_balance']")

# Alice's first post is free (free_posts_remaining=1)
curl -s -X POST "$API/posts?author_id=$ALICE_ID" -H 'Content-Type: application/json' \
  -d '{"content":"Free post test","post_type":"note"}' > /dev/null
BAL_AFTER_FREE=$(jv "$(curl -s "$API/users/$ALICE_ID/balance")" "d['available_balance']")
assert "Free post: balance unchanged" "[ $BAL_BEFORE -eq $BAL_AFTER_FREE ]"

# Second post should cost dynamic fee
POST_RES=$(curl -s -X POST "$API/posts?author_id=$ALICE_ID" -H 'Content-Type: application/json' \
  -d '{"content":"Paid post dynamic fee test","post_type":"note"}')
PAID_COST=$(jv "$POST_RES" "d['cost_paid']")
BAL_AFTER_PAID=$(jv "$(curl -s "$API/users/$ALICE_ID/balance")" "d['available_balance']")
DEDUCTED=$((BAL_AFTER_FREE - BAL_AFTER_PAID))
echo "  Post cost_paid=$PAID_COST, deducted=$DEDUCTED"
assert "Paid post cost matches cost_paid" "[ $DEDUCTED -eq $PAID_COST ]"
assert "Post cost == K*200 (dynamic)" "[ $PAID_COST -eq $POST_COST ]"

# ── 6. Like uses dynamic fee ─────────────────────────────────────────
echo ""; echo "── 6. Like uses dynamic fee ──"
POST_ID=$(jv "$POST_RES" "d['id']")
BOB_BAL_BEFORE=$(jv "$(curl -s "$API/users/$BOB_ID/balance")" "d['available_balance']")
BOB_COSTS=$(curl -s "$API/users/$BOB_ID/costs")
BOB_LIKE_COST=$(jv "$BOB_COSTS" "d['costs']['like_post']")

# Bob's first post to use up free post
curl -s -X POST "$API/posts?author_id=$BOB_ID" -H 'Content-Type: application/json' \
  -d '{"content":"Bob free post","post_type":"note"}' > /dev/null

curl -s -X POST "$API/posts/$POST_ID/like?user_id=$BOB_ID" > /dev/null
BOB_BAL_AFTER=$(jv "$(curl -s "$API/users/$BOB_ID/balance")" "d['available_balance']")
BOB_DEDUCTED=$((BOB_BAL_BEFORE - BOB_BAL_AFTER))
echo "  Bob like cost expected=$BOB_LIKE_COST, deducted=$BOB_DEDUCTED"
assert "Like deduction matches dynamic cost" "[ $BOB_DEDUCTED -eq $BOB_LIKE_COST ]"

# ── 7. Comment uses dynamic fee ──────────────────────────────────────
echo ""; echo "── 7. Comment uses dynamic fee ──"
BOB_COMMENT_COST=$(jv "$BOB_COSTS" "d['costs']['comment']")
BOB_BAL2=$(jv "$(curl -s "$API/users/$BOB_ID/balance")" "d['available_balance']")
curl -s -X POST "$API/posts/$POST_ID/comments?author_id=$BOB_ID" -H 'Content-Type: application/json' \
  -d '{"content":"Nice post!"}' > /dev/null
BOB_BAL3=$(jv "$(curl -s "$API/users/$BOB_ID/balance")" "d['available_balance']")
COMMENT_DEDUCTED=$((BOB_BAL2 - BOB_BAL3))
echo "  Comment cost expected=$BOB_COMMENT_COST, deducted=$COMMENT_DEDUCTED"
assert "Comment deduction matches dynamic cost" "[ $COMMENT_DEDUCTED -eq $BOB_COMMENT_COST ]"

# ── 8. High-trust user pays less ──────────────────────────────────────
echo ""; echo "── 8. High trust → lower costs ──"
# Set Carol to high trust
CAROL=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' -d "{\"name\":\"Carol\",\"handle\":\"carol_$TS\"}")
CAROL_ID=$(jv "$CAROL" "d['id']")
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET creator_score=900, curator_score=900, juror_score=900, risk_score=0, trust_score=950, available_balance=50000, free_posts_remaining=0 WHERE id=$CAROL_ID;" > /dev/null 2>&1

CAROL_COSTS=$(curl -s "$API/users/$CAROL_ID/costs")
CAROL_POST_COST=$(jv "$CAROL_COSTS" "d['costs']['post']")
CAROL_K=$(jv "$CAROL_COSTS" "d['fee_multiplier']")
echo "  Carol (trust=950): K=$CAROL_K, post=$CAROL_POST_COST sat"
assert "High trust K < 0.7" "python3 -c \"assert $CAROL_K < 0.7, '$CAROL_K'\""
assert "High trust post < 140 sat" "[ $CAROL_POST_COST -lt 140 ]"

# ── 9. Low-trust user pays more ──────────────────────────────────────
echo ""; echo "── 9. Low trust → higher costs ──"
DAVE=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' -d "{\"name\":\"Dave\",\"handle\":\"dave_$TS\"}")
DAVE_ID=$(jv "$DAVE" "d['id']")
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET creator_score=200, curator_score=200, juror_score=200, risk_score=500, trust_score=200, available_balance=50000, free_posts_remaining=0 WHERE id=$DAVE_ID;" > /dev/null 2>&1

DAVE_COSTS=$(curl -s "$API/users/$DAVE_ID/costs")
DAVE_POST_COST=$(jv "$DAVE_COSTS" "d['costs']['post']")
DAVE_K=$(jv "$DAVE_COSTS" "d['fee_multiplier']")
echo "  Dave (trust=200): K=$DAVE_K, post=$DAVE_POST_COST sat"
assert "Low trust K > 1.2" "python3 -c \"assert $DAVE_K > 1.2, '$DAVE_K'\""
# S6: base post cost is 50, so low trust post = 50 * 1.24 ≈ 62
assert "Low trust post > 55 sat" "[ $DAVE_POST_COST -gt 55 ]"

# ── 10. UserResponse includes sub-scores ──────────────────────────────
echo ""; echo "── 10. GET /users/{id} includes sub-scores ──"
# Re-fetch Carol to get latest data
CAROL_FULL=$(curl -s "$API/users/$CAROL_ID")
CAROL_CREATOR=$(jv "$CAROL_FULL" "d['creator_score']")
CAROL_CURATOR=$(jv "$CAROL_FULL" "d['curator_score']")
echo "  Carol creator=$CAROL_CREATOR, curator=$CAROL_CURATOR"
assert "UserResponse has creator_score >= 500" "[ $CAROL_CREATOR -ge 500 ]"
assert "UserResponse has curator_score >= 500" "[ $CAROL_CURATOR -ge 500 ]"

# ── 11. Settlement updates trust scores ───────────────────────────────
echo ""; echo "── 11. Settlement updates CreatorScore ──"

# Create a post by Carol, have Alice like it, then settle immediately
CAROL_POST=$(curl -s -X POST "$API/posts?author_id=$CAROL_ID" -H 'Content-Type: application/json' \
  -d '{"content":"Post to settle for trust update","post_type":"note"}')
CAROL_POST_ID=$(jv "$CAROL_POST" "d['id']")

# Alice likes Carol's post
curl -s -X POST "$API/posts/$CAROL_POST_ID/like?user_id=$ALICE_ID" > /dev/null

# Get Carol's creator_score before settlement
CAROL_CREATOR_BEFORE=$(jv "$(curl -s "$API/users/$CAROL_ID/trust")" "d['creator_score']")
echo "  Carol creator_score before settlement: $CAROL_CREATOR_BEFORE"

# Settle immediately (days_ago=0)
SETTLE_RES=$(curl -s -X POST "$API/rewards/settle?days_ago=0")
SETTLED_COUNT=$(jv "$SETTLE_RES" "d['posts_settled']")
echo "  Settled $SETTLED_COUNT posts"

# Check Carol's creator_score after
CAROL_CREATOR_AFTER=$(jv "$(curl -s "$API/users/$CAROL_ID/trust")" "d['creator_score']")
echo "  Carol creator_score after settlement: $CAROL_CREATOR_AFTER"
assert "Creator score increased after settlement" "[ $CAROL_CREATOR_AFTER -gt $CAROL_CREATOR_BEFORE ]"

# Check Alice's curator_score (she liked a rewarded post)
ALICE_CURATOR_AFTER=$(jv "$(curl -s "$API/users/$ALICE_ID/trust")" "d['curator_score']")
echo "  Alice curator_score after settlement: $ALICE_CURATOR_AFTER"
assert "Curator score increased (liked rewarded post)" "[ $ALICE_CURATOR_AFTER -gt 500 ]"

# ── Summary ───────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo " Results: $PASS/$TOTAL passed, $FAIL failed"
echo "═══════════════════════════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
