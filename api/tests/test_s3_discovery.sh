#!/usr/bin/env bash
# Sprint 3 — Discovery Score & Reward Settlement test suite
set -euo pipefail

BASE="http://localhost:8001"
PASS=0; FAIL=0; TOTAL=0

ok() { ((PASS++)); ((TOTAL++)); echo "  ✅ $1"; }
fail() { ((FAIL++)); ((TOTAL++)); echo "  ❌ $1 (got: $2)"; }
check() { local desc=$1 expected=$2 actual=$3; [ "$actual" = "$expected" ] && ok "$desc" || fail "$desc — expected $expected" "$actual"; }
check_gt() { local desc=$1 min=$2 actual=$3; [ "$(echo "$actual > $min" | bc -l)" = "1" ] && ok "$desc" || fail "$desc — expected > $min" "$actual"; }

jval() { echo "$1" | python3 -c "import sys,json; print(json.load(sys.stdin)$2)"; }

api() { local method=$1 url=$2; shift 2; curl -s -X "$method" "${BASE}${url}" -H "Content-Type: application/json" "$@"; }

TS=$(date +%s)

echo "╔══════════════════════════════════════════════╗"
echo "║   Sprint 3 — Discovery Score & Settlement    ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

echo "── Setup: create users with different trust levels ──"
# Alice = author (trust 500 Green)
# Bob = stranger Blue (trust 650)
# Carol = stranger Orange (trust 950)
# Dave = follower Green (trust 450)
R_A=$(api POST "/api/users" -d "{\"name\":\"Alice\",\"handle\":\"alice_$TS\"}")
R_B=$(api POST "/api/users" -d "{\"name\":\"Bob\",\"handle\":\"bob_$TS\"}")
R_C=$(api POST "/api/users" -d "{\"name\":\"Carol\",\"handle\":\"carol_$TS\"}")
R_D=$(api POST "/api/users" -d "{\"name\":\"Dave\",\"handle\":\"dave_$TS\"}")
UA=$(jval "$R_A" "['id']"); UB=$(jval "$R_B" "['id']")
UC=$(jval "$R_C" "['id']"); UD=$(jval "$R_D" "['id']")
echo "  Alice=$UA, Bob=$UB, Carol=$UC, Dave=$UD"

# Set trust scores & balances
docker compose exec -T postgres psql -U bitlink -d bitlink -t -c "
  UPDATE users SET trust_score=500, available_balance=5000 WHERE id=$UA;
  UPDATE users SET trust_score=650, available_balance=5000 WHERE id=$UB;
  UPDATE users SET trust_score=950, available_balance=5000 WHERE id=$UC;
  UPDATE users SET trust_score=450, available_balance=5000 WHERE id=$UD;
" > /dev/null

# Dave follows Alice (follower_id=Dave, user being followed = Alice)
api POST "/api/users/$UA/follow?follower_id=$UD" > /dev/null
echo "  Dave follows Alice"

echo ""
echo "── 1. Alice creates a post ──"
P1=$(api POST "/api/posts?author_id=$UA" -d '{"content":"Deep analysis on L2 scaling","post_type":"note"}')
PID=$(jval "$P1" "['id']")
echo "  post_id=$PID"

echo ""
echo "── 2. Strangers and follower like the post ──"
# Bob (Blue 650, stranger, first interaction) → W=2.0, N=1.0, S=1.0 = 2.0
api POST "/api/posts/$PID/like?user_id=$UB" > /dev/null
echo "  Bob liked (Blue stranger)"

# Carol (Orange 950, stranger, first interaction) → W=6.0, N=1.0, S=1.0 = 6.0
api POST "/api/posts/$PID/like?user_id=$UC" > /dev/null
echo "  Carol liked (Orange stranger)"

# Dave (Green 450, follower, first interaction) → W=1.0, N=1.0, S=0.15 = 0.15
api POST "/api/posts/$PID/like?user_id=$UD" > /dev/null
echo "  Dave liked (Green follower)"

echo ""
echo "── 3. Check Discovery Score ──"
DISC=$(api GET "/api/rewards/posts/$PID/discovery")
SCORE=$(jval "$DISC" "['discovery_score']")
echo "  Discovery Score = $SCORE"
# Expected: 2.0 + 6.0 + 0.15 = 8.15
check_gt "Score > 8.0 (Bob 2.0 + Carol 6.0 + Dave 0.15)" "8.0" "$SCORE"

# Check individual breakdown
LIKES_COUNT=$(echo "$DISC" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['likes']))")
check "3 likes in breakdown" "3" "$LIKES_COUNT"

echo ""
echo "── 4. Bob also comments (creates interaction history) ──"
api POST "/api/posts/$PID/comments?author_id=$UB" -d '{"content":"Great analysis!"}' > /dev/null
echo "  Bob commented"

echo ""
echo "── 5. Carol likes Bob's comment ──"
COMMENTS=$(api GET "/api/posts/$PID/comments")
CID=$(echo "$COMMENTS" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
api POST "/api/posts/$PID/comments/$CID/like?user_id=$UC" > /dev/null
echo "  Carol liked Bob's comment"

echo ""
echo "── 6. Check pending rewards ──"
PENDING=$(api GET "/api/rewards/users/$UA/pending-rewards")
PCOUNT=$(echo "$PENDING" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['pending']))")
check "Alice has 1 pending post" "1" "$PCOUNT"

P_SCORE=$(echo "$PENDING" | python3 -c "import sys,json; print(json.load(sys.stdin)['pending'][0]['discovery_score'])")
# After Bob's comment, his N_novelty decays → score drops from 8.15 to ~7.35
check_gt "Pending score > 7.0" "7.0" "$P_SCORE"

echo ""
echo "── 7. Trigger settlement (override to days_ago=0 for testing) ──"
SETTLE=$(api POST "/api/rewards/settle?days_ago=0")
echo "  Result: $(echo "$SETTLE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'posts={d[\"posts_settled\"]}, pool={d[\"pool\"]}, distributed={d[\"total_distributed\"]}')")"

POSTS_SETTLED=$(jval "$SETTLE" "['posts_settled']")
check_gt "At least 1 post settled" "0" "$POSTS_SETTLED"

POOL=$(jval "$SETTLE" "['pool']")
check_gt "Pool > 0" "0" "$POOL"

DISTRIBUTED=$(jval "$SETTLE" "['total_distributed']")
check_gt "Distributed > 0" "0" "$DISTRIBUTED"

echo ""
echo "── 8. Check Alice got rewarded ──"
BAL_A=$(jval "$(api GET "/api/users/$UA/balance")" "['available_balance']")
echo "  Alice balance = $BAL_A"
check_gt "Alice balance > 5000 (got reward)" "5000" "$BAL_A"

echo ""
echo "── 9. Check rewards history ──"
REWARDS=$(api GET "/api/rewards/users/$UA/rewards")
TOTAL_EARNED=$(jval "$REWARDS" "['total_earned']")
check_gt "Total earned > 0" "0" "$TOTAL_EARNED"

REWARD_COUNT=$(echo "$REWARDS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['rewards']))")
check "1 reward entry" "1" "$REWARD_COUNT"

echo ""
echo "── 10. Idempotent settlement (running again should not double pay) ──"
SETTLE2=$(api POST "/api/rewards/settle?days_ago=0")
POSTS2=$(jval "$SETTLE2" "['posts_settled']")
check "No new posts settled" "0" "$POSTS2"

echo ""
echo "── 11. Discovery breakdown includes settlement info ──"
DISC2=$(api GET "/api/rewards/posts/$PID/discovery")
SETTLE_STATUS=$(echo "$DISC2" | python3 -c "import sys,json; print(json.load(sys.stdin)['settlement']['status'])")
check "Settlement status = settled" "settled" "$SETTLE_STATUS"

echo ""
echo "── 12. Check Bob got comment reward ──"
BAL_B=$(jval "$(api GET "/api/users/$UB/balance")" "['available_balance']")
echo "  Bob balance = $BAL_B (started 5000 - 10 like - 50 comment = 4940 + comment reward)"

echo ""
echo "── 13. Reward pool list ──"
POOLS=$(api GET "/api/rewards/pools")
POOL_COUNT=$(echo "$POOLS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
check_gt "At least 1 pool" "0" "$POOL_COUNT"

echo ""
echo "── 14. N_novelty decay test ──"
# Alice makes another post, Bob likes it again → N should be lower
P2=$(api POST "/api/posts?author_id=$UA" -d '{"content":"Another great take","post_type":"note"}')
PID2=$(jval "$P2" "['id']")
api POST "/api/posts/$PID2/like?user_id=$UB" > /dev/null
DISC3=$(api GET "/api/rewards/posts/$PID2/discovery")
SCORE2=$(jval "$DISC3" "['discovery_score']")
echo "  2nd post score (Bob only, with interaction history) = $SCORE2"
# Bob interacted 3 times now (like + comment + like), N should be ~0.60, W=2.0, S=1.0 → ~1.2
check_gt "Score > 0 (Bob's repeat like)" "0" "$SCORE2"
# It should be less than 2.0 (first interaction weight) due to novelty decay
LESS_THAN=$(echo "$SCORE2 < 2.0" | bc -l)
check "Score < 2.0 (novelty decay)" "1" "$LESS_THAN"

echo ""
echo "══════════════════════════════════════"
echo "  Results: $PASS/$TOTAL passed, $FAIL failed"
echo "══════════════════════════════════════"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
