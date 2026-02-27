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

# ── 2. Default trust breakdown (S8 values) ─────────────────────────────
echo ""; echo "── 2. Default trust breakdown (S8) ──"
TRUST=$(curl -s "$API/users/$ALICE_ID/trust")
echo "  $TRUST"
# S8: new defaults - creator=150, curator=150, juror=300, risk=30, trust~135
assert "Default creator_score=150" "[ $(jv "$TRUST" "d['creator_score']") -eq 150 ]"
assert "Default curator_score=150" "[ $(jv "$TRUST" "d['curator_score']") -eq 150 ]"
assert "Default juror_score=300"   "[ $(jv "$TRUST" "d['juror_score']") -eq 300 ]"
assert "Default risk_score=30"     "[ $(jv "$TRUST" "d['risk_score']") -eq 30 ]"
assert "Composite trust~135"       "[ $(jv "$TRUST" "d['trust_score']") -ge 130 ] && [ $(jv "$TRUST" "d['trust_score']") -le 140 ]"
assert "Tier=white"                "[ \"$(jv "$TRUST" "d['tier']")\" = 'white' ]"

# ── 3. Set trust~470 for K testing (S8 formula) ────────────────────────
echo ""; echo "── 3. Set users to trust~470 for K testing ──"
# S8: creator=500, curator=500, juror=500, risk=0 → trust = 500*0.6 + 500*0.3 + (500-300)*0.1 = 470
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET creator_score=500, curator_score=500, juror_score=500, risk_score=0 WHERE id IN ($ALICE_ID,$BOB_ID);" >/dev/null 2>&1 &
wait $!
echo "  Set Alice & Bob to trust~470 (S8 formula)"

COSTS=$(curl -s "$API/users/$ALICE_ID/costs")
echo "  $COSTS"
K=$(jv "$COSTS" "d['fee_multiplier']")
TRUST_SCORE=$(jv "$COSTS" "d['trust_score']")
echo "  Trust=$TRUST_SCORE, K=$K"
# trust=470 → K = 1.4 - 470/1250 ≈ 1.02
assert "Fee multiplier ~1.02 (trust~470)" "python3 -c \"assert 0.95 < $K < 1.1, '$K not in range'\""
POST_COST=$(jv "$COSTS" "d['costs']['post']")
# S6: base post cost = 50 * 1.02 ≈ 51
assert "Post cost ~51 (K~1.02)" "[ $POST_COST -ge 49 ] && [ $POST_COST -le 55 ]"

# ── 4. Give users balance for testing (keep trust scores from step 3) ───
echo ""; echo "── 4. Fund test users ──"
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET available_balance=50000, free_posts_remaining=1 WHERE id IN ($ALICE_ID,$BOB_ID);" >/dev/null 2>&1 &
wait $!
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
assert "Post cost == K*50 (dynamic)" "[ $PAID_COST -eq $POST_COST ]"

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
# Set Carol to high trust (S8: creator=1000, curator=800 → trust ~870)
CAROL=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' -d "{\"name\":\"Carol\",\"handle\":\"carol_$TS\"}")
CAROL_ID=$(jv "$CAROL" "d['id']")
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET creator_score=1000, curator_score=800, juror_score=500, risk_score=0, available_balance=50000, free_posts_remaining=0 WHERE id=$CAROL_ID;" >/dev/null 2>&1 &
wait $!

CAROL_COSTS=$(curl -s "$API/users/$CAROL_ID/costs")
CAROL_POST_COST=$(jv "$CAROL_COSTS" "d['costs']['post']")
CAROL_K=$(jv "$CAROL_COSTS" "d['fee_multiplier']")
CAROL_TRUST=$(jv "$CAROL_COSTS" "d['trust_score']")
echo "  Carol (trust=$CAROL_TRUST): K=$CAROL_K, post=$CAROL_POST_COST sat"
# S8: 1000*0.6 + 800*0.3 + 20 = 860 → K = 1.4 - 860/1250 ≈ 0.71
assert "High trust K < 0.75" "python3 -c \"assert $CAROL_K < 0.75, '$CAROL_K'\""
assert "High trust post < 40 sat" "[ $CAROL_POST_COST -lt 40 ]"

# ── 9. Low-trust user pays more ──────────────────────────────────────
echo ""; echo "── 9. Low trust → higher costs ──"
# S8: creator=100, curator=100, risk=100 → trust ~80 - risk_penalty
DAVE=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' -d "{\"name\":\"Dave\",\"handle\":\"dave_$TS\"}")
DAVE_ID=$(jv "$DAVE" "d['id']")
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET creator_score=100, curator_score=100, juror_score=300, risk_score=100, available_balance=50000, free_posts_remaining=0 WHERE id=$DAVE_ID;" >/dev/null 2>&1 &
wait $!

DAVE_COSTS=$(curl -s "$API/users/$DAVE_ID/costs")
DAVE_POST_COST=$(jv "$DAVE_COSTS" "d['costs']['post']")
DAVE_K=$(jv "$DAVE_COSTS" "d['fee_multiplier']")
DAVE_TRUST=$(jv "$DAVE_COSTS" "d['trust_score']")
echo "  Dave (trust=$DAVE_TRUST): K=$DAVE_K, post=$DAVE_POST_COST sat"
# S8: 100*0.6 + 100*0.3 - (100/50)^2 = 60 + 30 - 4 = 86 → K ≈ 1.33
assert "Low trust K > 1.3" "python3 -c \"assert $DAVE_K > 1.3, '$DAVE_K'\""
assert "Low trust post > 65 sat" "[ $DAVE_POST_COST -gt 65 ]"

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
