#!/usr/bin/env bash
# Sprint 2 — Paid Actions test suite
# Tests: PostLike, CommentLike, comment/reply/answer costs, is_liked, unlike
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

echo "=== Setup: create 2 users ==="
R1=$(api POST "/api/users" -d "{\"name\":\"Alice\",\"handle\":\"alice_$TS\"}")
R2=$(api POST "/api/users" -d "{\"name\":\"Bob\",\"handle\":\"bob_$TS\"}")
U1=$(jval "$R1" "['id']"); U2=$(jval "$R2" "['id']")
echo "  Alice=$U1, Bob=$U2"

echo "=== Setup: give both 2000 sat ==="
docker compose exec -T postgres psql -U bitline -d bitline -t -c "UPDATE users SET available_balance=2000 WHERE id IN ($U1,$U2);" > /dev/null

echo ""
echo "── 1. Post creation (free + paid) ──"
P1=$(api POST "/api/posts?author_id=$U1" -d '{"content":"Hello!","post_type":"note"}')
check "Free post cost_paid=0" "0" "$(jval "$P1" "['cost_paid']")"

P2=$(api POST "/api/posts?author_id=$U1" -d '{"content":"Second post","post_type":"note"}')
check "Paid post cost_paid=200" "200" "$(jval "$P2" "['cost_paid']")"
PID1=$(jval "$P1" "['id']"); PID2=$(jval "$P2" "['id']")

BAL_A=$(jval "$(api GET "/api/users/$U1/balance")" "['available_balance']")
check "Alice balance after 1 paid post = 1800" "1800" "$BAL_A"

echo ""
echo "── 2. Like post (10 sat) ──"
LR=$(api POST "/api/posts/$PID1/like?user_id=$U2")
check "Like returns is_liked=True" "True" "$(jval "$LR" "['is_liked']")"
check "Like count = 1" "1" "$(jval "$LR" "['likes_count']")"

BAL_B=$(jval "$(api GET "/api/users/$U2/balance")" "['available_balance']")
check "Bob balance after like = 1990" "1990" "$BAL_B"

echo ""
echo "── 3. Double-like is idempotent ──"
LR2=$(api POST "/api/posts/$PID1/like?user_id=$U2")
check "Double-like is_liked=True" "True" "$(jval "$LR2" "['is_liked']")"
check "Double-like count still 1" "1" "$(jval "$LR2" "['likes_count']")"
BAL_B2=$(jval "$(api GET "/api/users/$U2/balance")" "['available_balance']")
check "Bob balance unchanged = 1990" "1990" "$BAL_B2"

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
check "Bob no refund = 1990" "1990" "$BAL_B3"

echo ""
echo "── 7. Comment costs 50 sat ──"
CR=$(api POST "/api/posts/$PID1/comments?author_id=$U2" -d '{"content":"Nice post!"}')
check "Comment cost_paid=50" "50" "$(jval "$CR" "['cost_paid']")"
CID=$(jval "$CR" "['id']")
BAL_B4=$(jval "$(api GET "/api/users/$U2/balance")" "['available_balance']")
check "Bob after comment = 1940" "1940" "$BAL_B4"

echo ""
echo "── 8. Reply costs 20 sat ──"
RR=$(api POST "/api/posts/$PID1/comments?author_id=$U1" -d "{\"content\":\"Thanks!\",\"parent_id\":$CID}")
check "Reply cost_paid=20" "20" "$(jval "$RR" "['cost_paid']")"
BAL_A2=$(jval "$(api GET "/api/users/$U1/balance")" "['available_balance']")
check "Alice after reply = 1780" "1780" "$BAL_A2"

echo ""
echo "── 9. Answer (question) costs 200 sat ──"
QP=$(api POST "/api/posts?author_id=$U1" -d '{"content":"How to scale?","post_type":"question"}')
QPID=$(jval "$QP" "['id']")
check "Question cost_paid=300" "300" "$(jval "$QP" "['cost_paid']")"

ANS=$(api POST "/api/posts/$QPID/comments?author_id=$U2" -d '{"content":"Use rollups"}')
check "Answer cost_paid=200" "200" "$(jval "$ANS" "['cost_paid']")"
AID=$(jval "$ANS" "['id']")

echo ""
echo "── 10. Like comment (5 sat) ──"
CLR=$(api POST "/api/posts/$PID1/comments/$CID/like?user_id=$U1")
check "Comment like is_liked=True" "True" "$(jval "$CLR" "['is_liked']")"
check "Comment like count = 1" "1" "$(jval "$CLR" "['likes_count']")"
BAL_A3=$(jval "$(api GET "/api/users/$U1/balance")" "['available_balance']")
check "Alice after comment-like = 1475" "1475" "$BAL_A3"

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
check "Alice no refund = 1475" "1475" "$BAL_A4"

echo ""
echo "── 13. Comments list with is_liked ──"
CLIST=$(api GET "/api/posts/$PID1/comments?user_id=$U1")
FIRST_LIKED=$(echo "$CLIST" | python3 -c "import sys,json; data=json.load(sys.stdin); print(data[0]['is_liked'])")
check "Comment is_liked=False after unlike" "False" "$FIRST_LIKED"

echo ""
echo "── 14. Insufficient balance ──"
docker compose exec -T postgres psql -U bitline -d bitline -t -c "UPDATE users SET available_balance=5 WHERE id=$U2;" > /dev/null
BROKE=$(api POST "/api/posts/$PID2/like?user_id=$U2" 2>&1)
DETAIL=$(echo "$BROKE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('detail',''))" 2>/dev/null || echo "")
check "Insufficient balance on like" "Insufficient balance. Need 10 sat." "$DETAIL"

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
