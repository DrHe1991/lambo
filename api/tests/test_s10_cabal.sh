#!/usr/bin/env bash
# Sprint 10: Cabal Detection & Penalties Tests
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
echo " S10: Cabal Detection & Penalties Tests"
echo "═══════════════════════════════════════════════"

# Clean up previous test data
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "DELETE FROM cabal_members; DELETE FROM cabal_groups; 
   DELETE FROM interaction_logs WHERE interaction_type='like';" > /dev/null 2>&1 || true
echo "  Cleaned up previous test data"

# ── 1. Create test users ──────────────────────────────────────────────
echo ""; echo "── 1. Create test users ──"

# Create 4 users for cabal testing
ALICE=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Alice\",\"handle\":\"alice_cabal_$TS\"}")
ALICE_ID=$(jv "$ALICE" "d['id']")
echo "  Alice ID=$ALICE_ID"

BOB=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Bob\",\"handle\":\"bob_cabal_$TS\"}")
BOB_ID=$(jv "$BOB" "d['id']")
echo "  Bob ID=$BOB_ID"

CAROL=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Carol\",\"handle\":\"carol_cabal_$TS\"}")
CAROL_ID=$(jv "$CAROL" "d['id']")
echo "  Carol ID=$CAROL_ID"

DAVE=$(curl -s -X POST "$API/users" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Dave\",\"handle\":\"dave_cabal_$TS\"}")
DAVE_ID=$(jv "$DAVE" "d['id']")
echo "  Dave ID=$DAVE_ID"

# ── 2. Fund users ─────────────────────────────────────────────────────
echo ""; echo "── 2. Fund users ──"
docker compose exec -T postgres psql -U bitlink -d bitlink -c \
  "UPDATE users SET available_balance=50000, creator_score=500, curator_score=500, free_posts_remaining=100 
   WHERE id IN ($ALICE_ID,$BOB_ID,$CAROL_ID,$DAVE_ID);" > /dev/null 2>&1 &
wait $!
echo "  Funded with 50000 sat each"

# ── 3. Check user cabal status (should be clean) ─────────────────────
echo ""; echo "── 3. Check initial cabal status ──"
STATUS=$(curl -s "$API/rewards/cabal/user/$ALICE_ID")
echo "  Status: $STATUS"
IS_MEMBER=$(jv "$STATUS" "d['is_cabal_member']")
assert "Alice not in cabal initially" "[ \"$IS_MEMBER\" = 'False' ]"

# ── 4. Run cabal detection (should find nothing) ─────────────────────
echo ""; echo "── 4. Run cabal detection (should find nothing) ──"
DETECT=$(curl -s -X POST "$API/rewards/cabal/detect")
echo "  Result: $DETECT"
CABALS=$(jv "$DETECT" "d['cabals_detected']")
assert "No cabals detected initially" "[ $CABALS -eq 0 ]"

# ── 5. Simulate cabal-like behavior (via direct DB) ──────────────────
echo ""; echo "── 5. Simulate cabal interactions ──"
# Create many interactions within the group
docker compose exec -T postgres psql -U bitlink -d bitlink -c "
  -- Create lots of internal interactions
  INSERT INTO interaction_logs (actor_id, target_user_id, interaction_type, created_at)
  SELECT $ALICE_ID, $BOB_ID, 'like', NOW() - (random() * interval '20 days') 
  FROM generate_series(1, 60);
  
  INSERT INTO interaction_logs (actor_id, target_user_id, interaction_type, created_at)
  SELECT $BOB_ID, $ALICE_ID, 'like', NOW() - (random() * interval '20 days') 
  FROM generate_series(1, 60);
  
  INSERT INTO interaction_logs (actor_id, target_user_id, interaction_type, created_at)
  SELECT $CAROL_ID, $ALICE_ID, 'like', NOW() - (random() * interval '20 days') 
  FROM generate_series(1, 60);
  
  INSERT INTO interaction_logs (actor_id, target_user_id, interaction_type, created_at)
  SELECT $ALICE_ID, $CAROL_ID, 'like', NOW() - (random() * interval '20 days') 
  FROM generate_series(1, 60);
  
  INSERT INTO interaction_logs (actor_id, target_user_id, interaction_type, created_at)
  SELECT $BOB_ID, $CAROL_ID, 'like', NOW() - (random() * interval '20 days') 
  FROM generate_series(1, 60);
  
  INSERT INTO interaction_logs (actor_id, target_user_id, interaction_type, created_at)
  SELECT $CAROL_ID, $BOB_ID, 'like', NOW() - (random() * interval '20 days') 
  FROM generate_series(1, 60);
" > /dev/null 2>&1 &
wait $!
echo "  Created 360 internal interactions"

# ── 6. Run cabal detection again ─────────────────────────────────────
echo ""; echo "── 6. Run cabal detection (should find cabal) ──"
DETECT2=$(curl -s -X POST "$API/rewards/cabal/detect")
echo "  Result: $DETECT2"
CABALS2=$(jv "$DETECT2" "d['cabals_detected']")
assert "Cabal detected" "[ $CABALS2 -ge 1 ]"

# Get group ID
GROUP_ID=$(jv "$DETECT2" "d['groups'][0]['id']" 2>/dev/null || echo "0")
echo "  Group ID: $GROUP_ID"

if [ "$GROUP_ID" != "0" ]; then
  # ── 7. Apply penalties ─────────────────────────────────────────────
  echo ""; echo "── 7. Apply penalties ──"
  ALICE_BAL_BEFORE=$(jv "$(curl -s "$API/users/$ALICE_ID/balance")" "d['available_balance']")
  echo "  Alice balance before: $ALICE_BAL_BEFORE"
  
  PENALTY=$(curl -s -X POST "$API/rewards/cabal/$GROUP_ID/penalize")
  echo "  Penalty result: $PENALTY"
  
  PENALIZED=$(jv "$PENALTY" "d['members_penalized']")
  CONFISCATED=$(jv "$PENALTY" "d['total_confiscated']")
  assert "Members penalized" "[ $PENALIZED -ge 1 ]"
  assert "Assets confiscated" "[ $CONFISCATED -gt 0 ]"
  
  # ── 8. Check user status after penalty ─────────────────────────────
  echo ""; echo "── 8. Check user status after penalty ──"
  ALICE_BAL_AFTER=$(jv "$(curl -s "$API/users/$ALICE_ID/balance")" "d['available_balance']")
  echo "  Alice balance after: $ALICE_BAL_AFTER"
  assert "Alice balance reduced" "[ $ALICE_BAL_AFTER -lt $ALICE_BAL_BEFORE ]"
  
  STATUS2=$(curl -s "$API/rewards/cabal/user/$ALICE_ID")
  echo "  Cabal status: $STATUS2"
  IS_MEMBER2=$(jv "$STATUS2" "d['is_cabal_member']")
  MULT=$(jv "$STATUS2" "d['penalty_multiplier']")
  assert "Alice now in cabal" "[ \"$IS_MEMBER2\" = 'True' ]"
  assert "Penalty multiplier = 0.3" "python3 -c \"assert $MULT == 0.3, '$MULT'\""
  
  # ── 9. Check trust scores reduced ──────────────────────────────────
  echo ""; echo "── 9. Check trust scores reduced ──"
  ALICE_TRUST=$(curl -s "$API/users/$ALICE_ID/trust")
  CREATOR=$(jv "$ALICE_TRUST" "d['creator_score']")
  RISK=$(jv "$ALICE_TRUST" "d['risk_score']")
  echo "  Alice creator=$CREATOR, risk=$RISK"
  assert "Creator score reduced" "[ $CREATOR -lt 500 ]"
  assert "Risk score increased" "[ $RISK -gt 0 ]"
else
  echo "  Skipping penalty tests (no group detected)"
fi

# ── 10. Check ledger entry ───────────────────────────────────────────
echo ""; echo "── 10. Check ledger entries ──"
LEDGER=$(curl -s "$API/users/$ALICE_ID/ledger?limit=5")
HAS_PENALTY=$(echo "$LEDGER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(e['action_type']=='cabal_penalty' for e in d))" 2>/dev/null || echo "False")
echo "  Has penalty entry: $HAS_PENALTY"
assert "Ledger has cabal_penalty entry" "[ \"$HAS_PENALTY\" = 'True' ]"

# ── Summary ───────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo " Results: $PASS/$TOTAL passed, $FAIL failed"
echo "═══════════════════════════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
