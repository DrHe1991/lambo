#!/usr/bin/env bash
# Sprint 2 — Paid Actions test suite (updated for S6 costs)
# Tests: PostLike, CommentLike, comment/reply/answer costs, is_liked, unlike
# NOTE: Costs updated in S6: post=50, like=20, comment=20, reply=10, etc.
# NOTE: 80/20 split means author gets 80% of likes/comments
set -euo pipefail

BASE="http://localhost:8001"
PASS=0; FAIL=0; TOTAL=0

ok() { ((PASS++)); ((TOTAL++)); echo "  ✅ $1"; }
fail() { ((FAIL++)); ((TOTAL++)); echo "  ❌ $1 (got: $2)"; }
check() { local desc=$1 expected=$2 actual=$3; [ "$actual" = "$expected" ] && ok "$desc" || fail "$desc — expected $expected" "$actual"; }

jval() { echo "$1" | python3 -c "import sys,json; print(json.load(sys.stdin)$2)"; }

api() {
  local method=$1 url=$2; shift 2
  curl -s -X "$method" "${BASE}${url}" -H "Content-Type: application/json" "$@"
}

TS=$(date +%s)

# ── New costs (S6) ──
# Post: 50 (base) × 0.92 (K=600 trust) = 46
# Question: 100 × 0.92 = 92
# Answer: 50 × 0.92 = 46
# Comment: 20 × 0.92 = 18
# Reply: 10 × 0.92 = 9
# Like Post: 20 × 0.92 = 18
# Like Comment: 10 × 0.92 = 9

echo "=== Setup: create 2 users ==="
R1=$(api POST "/api/users" -d "{\"name\":\"Alice\",\"handle\":\"alice_$TS\"}")
R2=$(api POST "/api/users" -d "{\"name\":\"Bob\",\"handle\":\"bob_$TS\"}")
U1=$(jval "$R1" "['id']"); U2=$(jval "$R2" "['id']")
echo "  Alice=$U1, Bob=$U2"

echo "=== Setup: give both 2000 sat and set trust~600 (for K=0.92) ==="
# S8 formula: trust = creator*0.6 + curator*0.3 + juror_bonus - risk_penalty
# For trust=600: creator=680, curator=610, juror=400, risk=0 → 408 + 183 + 10 = 601
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET available_balance=2000, creator_score=680, curator_score=610, juror_score=400, risk_score=0 WHERE id IN ($U1,$U2);" > /dev/null 2>&1 &
wait $!

echo ""
echo "── 1. Post creation (free + paid) ──"
P1=$(api POST "/api/posts?author_id=$U1" -d '{"content":"Hello!","post_type":"note"}')
check "Free post cost_paid=0" "0" "$(jval "$P1" "['cost_paid']")"

P2=$(api POST "/api/posts?author_id=$U1" -d '{"content":"Second post","post_type":"note"}')
# Post cost = 50 × 0.92 = 46
check "Paid post cost_paid=46" "46" "$(jval "$P2" "['cost_paid']")"
PID1=$(jval "$P1" "['id']"); PID2=$(jval "$P2" "['id']")

BAL_A=$(jval "$(api GET "/api/users/$U1/balance")" "['available_balance']")
# 2000 - 46 = 1954
check "Alice balance after 1 paid post = 1954" "1954" "$BAL_A"

echo ""
echo "── 2. Like post (20 sat base → 18 with K) ──"
LR=$(api POST "/api/posts/$PID1/like?user_id=$U2")
check "Like returns is_liked=True" "True" "$(jval "$LR" "['is_liked']")"
check "Like count = 1" "1" "$(jval "$LR" "['likes_count']")"

# Bob spends 18, Alice gets 80% = 14
BAL_B=$(jval "$(api GET "/api/users/$U2/balance")" "['available_balance']")
check "Bob balance after like = 1982" "1982" "$BAL_B"  # 2000 - 18

echo ""
echo "── 3. Double-like is idempotent ──"
LR2=$(api POST "/api/posts/$PID1/like?user_id=$U2")
check "Double-like is_liked=True" "True" "$(jval "$LR2" "['is_liked']")"
check "Double-like count still 1" "1" "$(jval "$LR2" "['likes_count']")"
BAL_B2=$(jval "$(api GET "/api/users/$U2/balance")" "['available_balance']")
check "Bob balance unchanged = 1982" "1982" "$BAL_B2"

echo ""
echo "── 4. Cannot like own post ──"
SELF_LIKE=$(api POST "/api/posts/$PID1/like?user_id=$U1")
check "Self-like blocked" "Cannot like your own post" "$(jval "$SELF_LIKE" "['detail']")"

echo ""
echo "── 5. is_liked on GET posts ──"
POST_BOB=$(api GET "/api/posts/$PID1?user_id=$U2")
check "is_liked=True for Bob" "True" "$(jval "$POST_BOB" "['is_liked']")"
POST_ALICE=$(api GET "/api/posts/$PID1?user_id=$U1")
check "is_liked=False for Alice" "False" "$(jval "$POST_ALICE" "['is_liked']")"

echo ""
echo "── 6. Unlike (no refund) ──"
ULR=$(api DELETE "/api/posts/$PID1/like?user_id=$U2")
check "Unlike is_liked=False" "False" "$(jval "$ULR" "['is_liked']")"
check "Unlike count = 0" "0" "$(jval "$ULR" "['likes_count']")"
BAL_B3=$(jval "$(api GET "/api/users/$U2/balance")" "['available_balance']")
check "Bob no refund = 1982" "1982" "$BAL_B3"

echo ""
echo "── 7. Comment costs 20 sat (18 with K) ──"
CR=$(api POST "/api/posts/$PID1/comments?author_id=$U2" -d '{"content":"Nice post!"}')
# Comment = 20 × 0.92 = 18
check "Comment cost_paid=18" "18" "$(jval "$CR" "['cost_paid']")"
CID=$(jval "$CR" "['id']")
BAL_B4=$(jval "$(api GET "/api/users/$U2/balance")" "['available_balance']")
# 1982 - 18 = 1964
check "Bob after comment = 1964" "1964" "$BAL_B4"

echo ""
echo "── 8. Reply costs 10 sat (9 with K) ──"
# Alice replies to Bob's comment
# Alice current: 1954 + 14 (from Bob's like) = 1968
# Alice pays: 9 (self-comment on own post, goes to platform)
RR=$(api POST "/api/posts/$PID1/comments?author_id=$U1" -d "{\"content\":\"Thanks!\",\"parent_id\":$CID}")
check "Reply cost_paid=9" "9" "$(jval "$RR" "['cost_paid']")"
BAL_A2=$(jval "$(api GET "/api/users/$U1/balance")" "['available_balance']")
# 1954 + 14 (like) + 14 (comment) - 9 (self reply, 100% to platform) = 1973
check "Alice after reply = 1973" "1973" "$BAL_A2"

echo ""
echo "── 9. Answer (question) costs 50 sat (46 with K) ──"
QP=$(api POST "/api/posts?author_id=$U1" -d '{"content":"How to scale?","post_type":"question"}')
QPID=$(jval "$QP" "['id']")
# Question = 100 × 0.92 = 92
check "Question cost_paid=92" "92" "$(jval "$QP" "['cost_paid']")"

ANS=$(api POST "/api/posts/$QPID/comments?author_id=$U2" -d '{"content":"Use rollups"}')
# Answer = 50 × 0.92 = 46
check "Answer cost_paid=46" "46" "$(jval "$ANS" "['cost_paid']")"
AID=$(jval "$ANS" "['id']")

echo ""
echo "── 10. Like comment (10 sat base → 9 with K) ──"
# Alice current: 1973 - 92 (question) + 36 (Bob answer 80%) = 1917
# Alice likes Bob's comment (CID), pays 9, Bob gets 7
CLR=$(api POST "/api/posts/$PID1/comments/$CID/like?user_id=$U1")
check "Comment like is_liked=True" "True" "$(jval "$CLR" "['is_liked']")"
check "Comment like count = 1" "1" "$(jval "$CLR" "['likes_count']")"
BAL_A3=$(jval "$(api GET "/api/users/$U1/balance")" "['available_balance']")
# 1917 - 9 = 1908
check "Alice after comment-like = 1908" "1908" "$BAL_A3"

echo ""
echo "── 11. Cannot like own comment ──"
SELF_CL=$(api POST "/api/posts/$PID1/comments/$CID/like?user_id=$U2")
check "Self-comment-like blocked" "Cannot like your own comment" "$(jval "$SELF_CL" "['detail']")"

echo ""
echo "── 12. Unlike comment (no refund) ──"
UCLR=$(api DELETE "/api/posts/$PID1/comments/$CID/like?user_id=$U1")
check "Comment unlike is_liked=False" "False" "$(jval "$UCLR" "['is_liked']")"
check "Comment unlike count = 0" "0" "$(jval "$UCLR" "['likes_count']")"
BAL_A4=$(jval "$(api GET "/api/users/$U1/balance")" "['available_balance']")
check "Alice no refund = 1908" "1908" "$BAL_A4"

echo ""
echo "── 13. Comments list with is_liked ──"
CLIST=$(api GET "/api/posts/$PID1/comments?user_id=$U1")
FIRST_LIKED=$(echo "$CLIST" | python3 -c "import sys,json; data=json.load(sys.stdin); print(data[0]['is_liked'])")
check "Comment is_liked=False after unlike" "False" "$FIRST_LIKED"

echo ""
echo "── 14. Insufficient balance ──"
docker compose exec -T postgres psql -U bitlink -d bitlink -t -c "UPDATE users SET available_balance=5 WHERE id=$U2;" > /dev/null
BROKE=$(api POST "/api/posts/$PID2/like?user_id=$U2" 2>&1)
DETAIL=$(echo "$BROKE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('detail',''))" 2>/dev/null || echo "")
check "Insufficient balance on like" "Insufficient balance. Need 18 sat." "$DETAIL"

echo ""
echo "── 15. Ledger entries ──"
LEDGER=$(api GET "/api/users/$U2/ledger?limit=20")
ENTRY_COUNT=$(echo "$LEDGER" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
check "Bob has ledger entries" "True" "$([ "$ENTRY_COUNT" -ge 3 ] && echo True || echo False)"

echo ""
echo "══════════════════════════════════════"
echo "  Results: $PASS/$TOTAL passed, $FAIL failed"
echo "══════════════════════════════════════"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
