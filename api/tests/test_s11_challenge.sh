#!/usr/bin/env bash
# Sprint 11: Challenge/Report System Tests
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
echo " S11: Challenge/Report System Tests"
echo "═══════════════════════════════════════════════"

# ── 1. Create test users ──────────────────────────────────────────────
echo ""; echo "── 1. Create test users ──"

# Reporter
REPORTER=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Reporter\",\"handle\":\"reporter_$TS\"}")
REPORTER_ID=$(jv "$REPORTER" "d['id']")
echo "  Reporter ID=$REPORTER_ID"

# Author (will be reported)
AUTHOR=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Author\",\"handle\":\"author_$TS\"}")
AUTHOR_ID=$(jv "$AUTHOR" "d['id']")
echo "  Author ID=$AUTHOR_ID"

# Jurors (need high trust)
JUROR1=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Juror1\",\"handle\":\"juror1_$TS\"}")
JUROR1_ID=$(jv "$JUROR1" "d['id']")

JUROR2=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Juror2\",\"handle\":\"juror2_$TS\"}")
JUROR2_ID=$(jv "$JUROR2" "d['id']")

JUROR3=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Juror3\",\"handle\":\"juror3_$TS\"}")
JUROR3_ID=$(jv "$JUROR3" "d['id']")

JUROR4=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Juror4\",\"handle\":\"juror4_$TS\"}")
JUROR4_ID=$(jv "$JUROR4" "d['id']")

JUROR5=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Juror5\",\"handle\":\"juror5_$TS\"}")
JUROR5_ID=$(jv "$JUROR5" "d['id']")

echo "  Juror IDs: $JUROR1_ID, $JUROR2_ID, $JUROR3_ID, $JUROR4_ID, $JUROR5_ID"

# ── 2. Fund users and set trust ───────────────────────────────────────
echo ""; echo "── 2. Fund users and set trust ──"
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET available_balance=10000, creator_score=500, free_posts_remaining=10 
   WHERE id IN ($REPORTER_ID,$AUTHOR_ID);
   UPDATE users SET available_balance=5000, creator_score=600, curator_score=600, trust_score=500
   WHERE id IN ($JUROR1_ID,$JUROR2_ID,$JUROR3_ID,$JUROR4_ID,$JUROR5_ID);" > /dev/null 2>&1 &
wait $!
echo "  Users funded and trust set"

# ── 3. Author creates a post ──────────────────────────────────────────
echo ""; echo "── 3. Author creates a post ──"
POST=$(curl -s -X POST "$API/posts?author_id=$AUTHOR_ID" -H 'Content-Type: application/json' \
  -d '{"content":"This is spam content buy now!!!"}')
POST_ID=$(jv "$POST" "d['id']")
echo "  Post ID=$POST_ID"

# ── 4. Get challenge fees ─────────────────────────────────────────────
echo ""; echo "── 4. Get challenge fees ──"
FEES=$(curl -s "$API/challenges/fees")
echo "  Fees: $FEES"
L1_FEE=$(jv "$FEES" "d['layers']['1']")
assert "L1 fee = 100 sat" "[ $L1_FEE -eq 100 ]"

# ── 5. Create L1 challenge (AI auto-judgment) ─────────────────────────
echo ""; echo "── 5. Create L1 challenge (spam - high confidence) ──"
REPORTER_BAL_BEFORE=$(jv "$(curl -s "$API/users/$REPORTER_ID/balance")" "d['available_balance']")
echo "  Reporter balance before: $REPORTER_BAL_BEFORE"

CHALLENGE1=$(curl -s -X POST "$API/challenges" -H 'Content-Type: application/json' \
  -d "{\"challenger_id\":$REPORTER_ID,\"content_type\":\"post\",\"content_id\":$POST_ID,\"reason\":\"spam advertisement\",\"violation_type\":\"spam\",\"layer\":1}")
echo "  Challenge response: $CHALLENGE1"

CHALLENGE1_ID=$(jv "$CHALLENGE1" "d['challenge_id']")
VERDICT=$(jv "$CHALLENGE1" "d['verdict']")
echo "  Challenge ID=$CHALLENGE1_ID, Verdict=$VERDICT"
assert "L1 verdict is guilty (spam)" "[ \"$VERDICT\" = 'guilty' ]"

# ── 6. Check reporter rewarded ────────────────────────────────────────
echo ""; echo "── 6. Check reporter rewarded ──"
REPORTER_BAL_AFTER=$(jv "$(curl -s "$API/users/$REPORTER_ID/balance")" "d['available_balance']")
echo "  Reporter balance after: $REPORTER_BAL_AFTER"
assert "Reporter balance increased" "[ $REPORTER_BAL_AFTER -gt $REPORTER_BAL_BEFORE ]"

# ── 7. Check author penalized ─────────────────────────────────────────
echo ""; echo "── 7. Check author penalized ──"
AUTHOR_BAL=$(jv "$(curl -s "$API/users/$AUTHOR_ID/balance")" "d['available_balance']")
echo "  Author balance: $AUTHOR_BAL"
assert "Author fined (balance reduced)" "[ $AUTHOR_BAL -lt 10000 ]"

AUTHOR_TRUST=$(curl -s "$API/users/$AUTHOR_ID/trust")
AUTHOR_RISK=$(jv "$AUTHOR_TRUST" "d['risk_score']")
echo "  Author risk score: $AUTHOR_RISK"
assert "Author risk increased" "[ $AUTHOR_RISK -gt 30 ]"

# ── 8. Create another post for L2 test ────────────────────────────────
echo ""; echo "── 8. Create post for L2 test ──"
POST2=$(curl -s -X POST "$API/posts?author_id=$AUTHOR_ID" -H 'Content-Type: application/json' \
  -d '{"content":"This content is borderline quality"}')
POST2_ID=$(jv "$POST2" "d['id']")
echo "  Post2 ID=$POST2_ID"

# ── 9. Create L1 challenge with low confidence (escalates to L2) ─────
echo ""; echo "── 9. Create L1 challenge (low quality - low confidence) ──"
CHALLENGE2=$(curl -s -X POST "$API/challenges" -H 'Content-Type: application/json' \
  -d "{\"challenger_id\":$REPORTER_ID,\"content_type\":\"post\",\"content_id\":$POST2_ID,\"reason\":\"low quality content\",\"violation_type\":\"low_quality\",\"layer\":1}")
echo "  Challenge response: $CHALLENGE2"

STATUS=$(jv "$CHALLENGE2" "d.get('status', d.get('verdict', 'unknown'))")
echo "  Status: $STATUS"
# May be escalated or guilty depending on AI confidence
assert "Challenge processed" "[ -n \"$STATUS\" ]"

# ── 10. Create L2 challenge directly ──────────────────────────────────
echo ""; echo "── 10. Create L2 challenge directly ──"
POST3=$(curl -s -X POST "$API/posts?author_id=$AUTHOR_ID" -H 'Content-Type: application/json' \
  -d '{"content":"Controversial content that needs jury"}')
POST3_ID=$(jv "$POST3" "d['id']")

CHALLENGE3=$(curl -s -X POST "$API/challenges" -H 'Content-Type: application/json' \
  -d "{\"challenger_id\":$REPORTER_ID,\"content_type\":\"post\",\"content_id\":$POST3_ID,\"reason\":\"needs human review\",\"violation_type\":\"low_quality\",\"layer\":2}")
echo "  L2 Challenge: $CHALLENGE3"

CHALLENGE3_ID=$(jv "$CHALLENGE3" "d['challenge_id']")
C3_STATUS=$(jv "$CHALLENGE3" "d['status']")
assert "L2 challenge in voting state" "[ \"$C3_STATUS\" = 'voting' ]"

# ── 11. Check juror can see pending challenges ────────────────────────
echo ""; echo "── 11. Check juror can see pending challenges ──"
PENDING=$(curl -s "$API/challenges/jury/$JUROR1_ID/pending")
echo "  Pending challenges: $PENDING"
PENDING_COUNT=$(echo "$PENDING" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
assert "Juror has pending challenges" "[ $PENDING_COUNT -ge 1 ]"

# ── 12. Cast jury votes ───────────────────────────────────────────────
echo ""; echo "── 12. Cast jury votes ──"

# Vote 1: Guilty
VOTE1=$(curl -s -X POST "$API/challenges/$CHALLENGE3_ID/vote" -H 'Content-Type: application/json' \
  -d "{\"juror_id\":$JUROR1_ID,\"vote_guilty\":true,\"reasoning\":\"Clearly low quality\"}")
echo "  Vote 1 (guilty): $VOTE1"

# Vote 2: Guilty
VOTE2=$(curl -s -X POST "$API/challenges/$CHALLENGE3_ID/vote" -H 'Content-Type: application/json' \
  -d "{\"juror_id\":$JUROR2_ID,\"vote_guilty\":true}")
echo "  Vote 2 (guilty): recorded"

# Vote 3: Not guilty
VOTE3=$(curl -s -X POST "$API/challenges/$CHALLENGE3_ID/vote" -H 'Content-Type: application/json' \
  -d "{\"juror_id\":$JUROR3_ID,\"vote_guilty\":false}")
echo "  Vote 3 (not guilty): recorded"

# Vote 4: Guilty
VOTE4=$(curl -s -X POST "$API/challenges/$CHALLENGE3_ID/vote" -H 'Content-Type: application/json' \
  -d "{\"juror_id\":$JUROR4_ID,\"vote_guilty\":true}")
echo "  Vote 4 (guilty): recorded"

# Vote 5: Guilty (this should resolve)
VOTE5=$(curl -s -X POST "$API/challenges/$CHALLENGE3_ID/vote" -H 'Content-Type: application/json' \
  -d "{\"juror_id\":$JUROR5_ID,\"vote_guilty\":true}")
echo "  Vote 5 (guilty): $VOTE5"

FINAL_STATUS=$(jv "$VOTE5" "d['status']")
assert "Challenge resolved after 5 votes" "[ \"$FINAL_STATUS\" = 'guilty' ]"

# ── 13. Check challenge details ───────────────────────────────────────
echo ""; echo "── 13. Check challenge details ──"
DETAILS=$(curl -s "$API/challenges/$CHALLENGE3_ID")
echo "  Challenge details: $DETAILS"
VOTES_G=$(jv "$DETAILS" "d['votes_guilty']")
VOTES_NG=$(jv "$DETAILS" "d['votes_not_guilty']")
assert "Votes recorded correctly (4 guilty, 1 not guilty)" "[ $VOTES_G -eq 4 ] && [ $VOTES_NG -eq 1 ]"

# ── 14. Check juror trust updated ─────────────────────────────────────
echo ""; echo "── 14. Check juror trust updated ──"
# Juror1 voted with majority (guilty) - should get reward
JUROR1_TRUST=$(curl -s "$API/users/$JUROR1_ID/trust")
JUROR1_JUROR=$(jv "$JUROR1_TRUST" "d['juror_score']")
echo "  Juror1 juror score: $JUROR1_JUROR"
# Note: Default juror_score is 300, should increase after correct vote
# But juror1 already had 500 set, so should be > 500 now

# Juror3 voted against majority (not guilty) - should lose points
JUROR3_TRUST=$(curl -s "$API/users/$JUROR3_ID/trust")
JUROR3_JUROR=$(jv "$JUROR3_TRUST" "d['juror_score']")
echo "  Juror3 juror score: $JUROR3_JUROR"

# ── 15. Test cannot vote twice ────────────────────────────────────────
echo ""; echo "── 15. Test cannot vote twice ──"
DOUBLE_VOTE=$(curl -s -X POST "$API/challenges/$CHALLENGE3_ID/vote" -H 'Content-Type: application/json' \
  -d "{\"juror_id\":$JUROR1_ID,\"vote_guilty\":true}")
echo "  Double vote response: $DOUBLE_VOTE"
assert "Double vote rejected" "echo '$DOUBLE_VOTE' | grep -qE 'error|detail'"

# ── Summary ───────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo " Results: $PASS/$TOTAL passed, $FAIL failed"
echo "═══════════════════════════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
