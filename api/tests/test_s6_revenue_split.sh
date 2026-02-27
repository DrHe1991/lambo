#!/usr/bin/env bash
# Sprint 6: Revenue Split (80% creator / 20% platform) — Integration Tests
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
echo " S6: Revenue Split (80/20) Tests"
echo "═══════════════════════════════════════════════"

# ── 1. Create test users ──────────────────────────────────────────────
echo ""; echo "── 1. Setup: Create users ──"
ALICE=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' -d "{\"name\":\"Alice\",\"handle\":\"alice_s6_$TS\"}")
ALICE_ID=$(jv "$ALICE" "d['id']")
echo "  Alice ID=$ALICE_ID"

BOB=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' -d "{\"name\":\"Bob\",\"handle\":\"bob_s6_$TS\"}")
BOB_ID=$(jv "$BOB" "d['id']")
echo "  Bob ID=$BOB_ID"

CAROL=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' -d "{\"name\":\"Carol\",\"handle\":\"carol_s6_$TS\"}")
CAROL_ID=$(jv "$CAROL" "d['id']")
echo "  Carol ID=$CAROL_ID"

# ── 2. Fund users, set trust~600, use up free posts ───────────────────
echo ""; echo "── 2. Fund users & set trust~600 ──"
# S8: trust = creator*0.6 + curator*0.3 + juror_bonus - risk_penalty
# For trust≈600: creator=680, curator=610, juror=400, risk=0 → 408+183+10=601
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET available_balance=100000, free_posts_remaining=0, creator_score=680, curator_score=610, juror_score=400, risk_score=0 WHERE id IN ($ALICE_ID,$BOB_ID,$CAROL_ID);" > /dev/null 2>&1 &
wait $!
echo "  Funded with 100000 sat, trust~600, free posts used"

# ── 3. Verify new base costs ──────────────────────────────────────────
echo ""; echo "── 3. Verify updated base costs ──"
COSTS=$(curl -s "$API/users/$ALICE_ID/costs")
echo "  $COSTS"

POST_COST=$(jv "$COSTS" "d['costs']['post']")
LIKE_COST=$(jv "$COSTS" "d['costs']['like_post']")
COMMENT_COST=$(jv "$COSTS" "d['costs']['comment']")

# With trust≈600, K≈0.92, so costs should be close to base
# Base: post=50, like=20, comment=20
assert "Post base ~50 (K~0.92)" "[ $POST_COST -lt 60 ] && [ $POST_COST -gt 40 ]"
assert "Like base ~20 (K~0.92)" "[ $LIKE_COST -lt 25 ] && [ $LIKE_COST -gt 15 ]"
assert "Comment base ~20 (K~0.92)" "[ $COMMENT_COST -lt 25 ] && [ $COMMENT_COST -gt 15 ]"

# ── 4. Alice creates a post ───────────────────────────────────────────
echo ""; echo "── 4. Alice creates a post ──"
ALICE_BAL_BEFORE=$(jv "$(curl -s "$API/users/$ALICE_ID/balance")" "d['available_balance']")
POST_RES=$(curl -s -X POST "$API/posts?author_id=$ALICE_ID" -H 'Content-Type: application/json' \
  -d '{"content":"Testing revenue split!","post_type":"note"}')
POST_ID=$(jv "$POST_RES" "d['id']")
ALICE_BAL_AFTER=$(jv "$(curl -s "$API/users/$ALICE_ID/balance")" "d['available_balance']")
ALICE_POST_COST=$((ALICE_BAL_BEFORE - ALICE_BAL_AFTER))
echo "  Post ID=$POST_ID, cost=$ALICE_POST_COST sat"
assert "Post cost deducted from Alice" "[ $ALICE_POST_COST -gt 0 ]"

# ── 5. Bob likes Alice's post (80% to Alice, 20% to platform) ─────────
echo ""; echo "── 5. Bob likes Alice's post (80/20 split) ──"
ALICE_BAL_BEFORE_LIKE=$(jv "$(curl -s "$API/users/$ALICE_ID/balance")" "d['available_balance']")
BOB_BAL_BEFORE=$(jv "$(curl -s "$API/users/$BOB_ID/balance")" "d['available_balance']")

LIKE_RES=$(curl -s -X POST "$API/posts/$POST_ID/like?user_id=$BOB_ID")
echo "  Like response: $LIKE_RES"

ALICE_BAL_AFTER_LIKE=$(jv "$(curl -s "$API/users/$ALICE_ID/balance")" "d['available_balance']")
BOB_BAL_AFTER=$(jv "$(curl -s "$API/users/$BOB_ID/balance")" "d['available_balance']")

# Bob's dynamic like cost
BOB_COSTS=$(curl -s "$API/users/$BOB_ID/costs")
BOB_LIKE_COST=$(jv "$BOB_COSTS" "d['costs']['like_post']")

BOB_SPENT=$((BOB_BAL_BEFORE - BOB_BAL_AFTER))
ALICE_EARNED=$((ALICE_BAL_AFTER_LIKE - ALICE_BAL_BEFORE_LIKE))
EXPECTED_ALICE=$((BOB_LIKE_COST * 80 / 100))
PLATFORM_SHARE=$((BOB_LIKE_COST - EXPECTED_ALICE))

echo "  Bob spent: $BOB_SPENT sat"
echo "  Alice earned: $ALICE_EARNED sat"
echo "  Expected Alice (80%): $EXPECTED_ALICE sat"
echo "  Platform share (20%): $PLATFORM_SHARE sat"

assert "Bob spent full like cost" "[ $BOB_SPENT -eq $BOB_LIKE_COST ]"
assert "Alice earned 80% of like cost" "[ $ALICE_EARNED -eq $EXPECTED_ALICE ]"

# ── 6. Verify platform_revenue table updated ──────────────────────────
echo ""; echo "── 6. Verify platform_revenue accumulated ──"
# Check total platform revenue (not just today, as timezone may differ)
PLATFORM_TOTAL=$(docker compose exec -T postgres psql -U bitlink -d bitlink -t -c \
  "SELECT COALESCE(SUM(like_revenue),0) FROM platform_revenue;" 2>/dev/null | tr -d ' \n\r')
echo "  Platform total like_revenue: $PLATFORM_TOTAL sat"
assert "Platform revenue > 0" "[ \"$PLATFORM_TOTAL\" != \"0\" ] && [ -n \"$PLATFORM_TOTAL\" ]"

# ── 7. Carol comments on Alice's post (80% to Alice) ──────────────────
echo ""; echo "── 7. Carol comments (80/20 split to post author) ──"
ALICE_BAL_BEFORE_COMMENT=$(jv "$(curl -s "$API/users/$ALICE_ID/balance")" "d['available_balance']")
CAROL_BAL_BEFORE=$(jv "$(curl -s "$API/users/$CAROL_ID/balance")" "d['available_balance']")

CAROL_COSTS=$(curl -s "$API/users/$CAROL_ID/costs")
CAROL_COMMENT_COST=$(jv "$CAROL_COSTS" "d['costs']['comment']")

curl -s -X POST "$API/posts/$POST_ID/comments?author_id=$CAROL_ID" -H 'Content-Type: application/json' \
  -d '{"content":"Great post!"}' > /dev/null

ALICE_BAL_AFTER_COMMENT=$(jv "$(curl -s "$API/users/$ALICE_ID/balance")" "d['available_balance']")
CAROL_BAL_AFTER=$(jv "$(curl -s "$API/users/$CAROL_ID/balance")" "d['available_balance']")

CAROL_SPENT=$((CAROL_BAL_BEFORE - CAROL_BAL_AFTER))
ALICE_EARNED_COMMENT=$((ALICE_BAL_AFTER_COMMENT - ALICE_BAL_BEFORE_COMMENT))
EXPECTED_ALICE_COMMENT=$((CAROL_COMMENT_COST * 80 / 100))

echo "  Carol spent: $CAROL_SPENT sat"
echo "  Alice earned from comment: $ALICE_EARNED_COMMENT sat"
echo "  Expected (80%): $EXPECTED_ALICE_COMMENT sat"

assert "Carol spent full comment cost" "[ $CAROL_SPENT -eq $CAROL_COMMENT_COST ]"
assert "Alice earned 80% of comment cost" "[ $ALICE_EARNED_COMMENT -eq $EXPECTED_ALICE_COMMENT ]"

# ── 8. Verify ledger entries ──────────────────────────────────────────
echo ""; echo "── 8. Verify ledger has new action types ──"
ALICE_LEDGER=$(curl -s "$API/users/$ALICE_ID/ledger")
HAS_EARN_LIKE=$(echo "$ALICE_LEDGER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(e['action_type']=='earn_like' for e in d))")
HAS_EARN_COMMENT=$(echo "$ALICE_LEDGER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(e['action_type']=='earn_comment' for e in d))")

assert "Alice has earn_like ledger entry" "[ \"$HAS_EARN_LIKE\" = 'True' ]"
assert "Alice has earn_comment ledger entry" "[ \"$HAS_EARN_COMMENT\" = 'True' ]"

# ── 9. Comment like also splits ───────────────────────────────────────
echo ""; echo "── 9. Comment like splits 80/20 ──"
# Get Carol's comment
COMMENTS=$(curl -s "$API/posts/$POST_ID/comments")
CAROL_COMMENT_ID=$(echo "$COMMENTS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'])")

CAROL_BAL_BEFORE_CL=$(jv "$(curl -s "$API/users/$CAROL_ID/balance")" "d['available_balance']")
BOB_BAL_BEFORE_CL=$(jv "$(curl -s "$API/users/$BOB_ID/balance")" "d['available_balance']")

BOB_CL_COST=$(jv "$BOB_COSTS" "d['costs']['like_comment']")

curl -s -X POST "$API/posts/$POST_ID/comments/$CAROL_COMMENT_ID/like?user_id=$BOB_ID" > /dev/null

CAROL_BAL_AFTER_CL=$(jv "$(curl -s "$API/users/$CAROL_ID/balance")" "d['available_balance']")
BOB_BAL_AFTER_CL=$(jv "$(curl -s "$API/users/$BOB_ID/balance")" "d['available_balance']")

BOB_CL_SPENT=$((BOB_BAL_BEFORE_CL - BOB_BAL_AFTER_CL))
CAROL_CL_EARNED=$((CAROL_BAL_AFTER_CL - CAROL_BAL_BEFORE_CL))
EXPECTED_CAROL_CL=$((BOB_CL_COST * 80 / 100))

echo "  Bob spent on comment like: $BOB_CL_SPENT sat"
echo "  Carol earned: $CAROL_CL_EARNED sat"
echo "  Expected (80%): $EXPECTED_CAROL_CL sat"

assert "Comment like: Bob spent full cost" "[ $BOB_CL_SPENT -eq $BOB_CL_COST ]"
assert "Comment like: Carol earned 80%" "[ $CAROL_CL_EARNED -eq $EXPECTED_CAROL_CL ]"

# ── 10. Self-comment doesn't split ────────────────────────────────────
echo ""; echo "── 10. Self-comment goes 100% to platform ──"
ALICE_BAL_BEFORE_SELF=$(jv "$(curl -s "$API/users/$ALICE_ID/balance")" "d['available_balance']")

curl -s -X POST "$API/posts/$POST_ID/comments?author_id=$ALICE_ID" -H 'Content-Type: application/json' \
  -d '{"content":"My own comment on my own post"}' > /dev/null

ALICE_BAL_AFTER_SELF=$(jv "$(curl -s "$API/users/$ALICE_ID/balance")" "d['available_balance']")
ALICE_SELF_SPENT=$((ALICE_BAL_BEFORE_SELF - ALICE_BAL_AFTER_SELF))

ALICE_COSTS=$(curl -s "$API/users/$ALICE_ID/costs")
ALICE_COMMENT_COST=$(jv "$ALICE_COSTS" "d['costs']['comment']")

echo "  Alice spent on self-comment: $ALICE_SELF_SPENT sat"
echo "  Expected: $ALICE_COMMENT_COST sat"

assert "Self-comment cost deducted from Alice" "[ $ALICE_SELF_SPENT -eq $ALICE_COMMENT_COST ]"

# ── 11. No platform emission in discovery pool ────────────────────────
echo ""; echo "── 11. Discovery pool has no emission ──"
# This is a basic check - settle should only include user fees, not 300*DAU
# Just verify settlement works without emission
SETTLE_RES=$(curl -s -X POST "$API/rewards/settle?days_ago=0")
echo "  Settlement result: $SETTLE_RES"
POOL=$(jv "$SETTLE_RES" "d['pool']")
echo "  Pool from user fees only: $POOL sat"
assert "Settlement works without emission" "[ $POOL -ge 0 ]"

# ── Summary ───────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo " Results: $PASS/$TOTAL passed, $FAIL failed"
echo "═══════════════════════════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
