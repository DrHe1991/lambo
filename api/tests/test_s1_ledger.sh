#!/bin/bash
# Sprint 1 — Ledger Foundation: Test Script (v2 — no bonuses, 1 free post)
# Run: bash api/tests/test_s1_ledger.sh
# Requires: API running on localhost:8001

API="http://localhost:8001/api"
PASS=0
FAIL=0

green() { echo -e "\033[32m✅ $1\033[0m"; PASS=$((PASS+1)); }
red()   { echo -e "\033[31m❌ $1\033[0m"; FAIL=$((FAIL+1)); }
sep()   { echo -e "\n\033[1;34m━━━ $1 ━━━\033[0m"; }

do_curl() {
  local tmpfile=$(mktemp)
  HTTP_CODE=$(curl -s -w "%{http_code}" -o "$tmpfile" "$@")
  HTTP_BODY=$(cat "$tmpfile")
  rm -f "$tmpfile"
}

json_field() {
  echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$2)" 2>/dev/null
}

assert_eq() {
  if [ "$1" = "$2" ]; then green "$3"; else red "$3 (expected '$2', got '$1')"; fi
}

assert_contains() {
  if echo "$1" | grep -q "$2"; then green "$3"; else red "$3 (missing '$2')"; fi
}

assert_status() {
  if [ "$1" = "$2" ]; then green "$3"; else red "$3 (expected HTTP $2, got HTTP $1)"; fi
}

# =========================================
sep "1. CREATE NEW USER → 0 sat, 1 free post"
# =========================================
HANDLE="tester_$(date +%s)"
do_curl -X POST "$API/users" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"Test User\", \"handle\": \"$HANDLE\"}"

assert_status "$HTTP_CODE" "201" "Create user returns 201"

USER_ID=$(json_field "$HTTP_BODY" "['id']")
BALANCE=$(json_field "$HTTP_BODY" "['available_balance']")
FREE_POSTS=$(json_field "$HTTP_BODY" "['free_posts_remaining']")

assert_eq "$BALANCE" "0" "New user starts with 0 sat"
assert_eq "$FREE_POSTS" "1" "New user gets 1 free post"
echo "  → Created user ID: $USER_ID, handle: $HANDLE"

# =========================================
sep "2. GET BALANCE → 0 sat"
# =========================================
do_curl "$API/users/$USER_ID/balance"

assert_status "$HTTP_CODE" "200" "GET /balance returns 200"
BAL=$(json_field "$HTTP_BODY" "['available_balance']")
assert_eq "$BAL" "0" "Balance endpoint shows 0 sat"

# =========================================
sep "3. GET BALANCE — nonexistent user"
# =========================================
do_curl "$API/users/999999/balance"
assert_status "$HTTP_CODE" "404" "Nonexistent user balance → 404"

# =========================================
sep "4. LEDGER HISTORY — empty for new user"
# =========================================
do_curl "$API/users/$USER_ID/ledger"

assert_status "$HTTP_CODE" "200" "GET /ledger returns 200"
ENTRY_COUNT=$(json_field "$HTTP_BODY" ".__len__()")
assert_eq "$ENTRY_COUNT" "0" "Ledger is empty (no signup bonus)"

# =========================================
sep "5. LEDGER HISTORY — nonexistent user"
# =========================================
do_curl "$API/users/999999/ledger"
assert_status "$HTTP_CODE" "404" "Nonexistent user ledger → 404"

# =========================================
sep "6. DAILY REWARD — endpoint removed"
# =========================================
do_curl -X POST "$API/users/$USER_ID/daily-reward"
assert_status "$HTTP_CODE" "404" "Daily reward endpoint no longer exists → 404"

# =========================================
sep "7. GET USER — includes free_posts_remaining"
# =========================================
do_curl "$API/users/$USER_ID"
BAL=$(json_field "$HTTP_BODY" "['available_balance']")
FP=$(json_field "$HTTP_BODY" "['free_posts_remaining']")
assert_eq "$BAL" "0" "GET /users/{id} balance = 0"
assert_eq "$FP" "1" "GET /users/{id} free_posts_remaining = 1"

# =========================================
sep "8. CREATE USER — duplicate handle"
# =========================================
do_curl -X POST "$API/users" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"Duplicate\", \"handle\": \"$HANDLE\"}"
assert_status "$HTTP_CODE" "400" "Duplicate handle → 400"

# =========================================
sep "9. LEDGER PAGINATION — empty"
# =========================================
do_curl "$API/users/$USER_ID/ledger?limit=1&offset=0"
COUNT=$(json_field "$HTTP_BODY" ".__len__()")
assert_eq "$COUNT" "0" "Empty ledger with limit=1 → 0 entries"

# =========================================
sep "10. SECOND USER — independent"
# =========================================
HANDLE2="tester2_$(date +%s)"
do_curl -X POST "$API/users" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"User Two\", \"handle\": \"$HANDLE2\"}"
USER2_ID=$(json_field "$HTTP_BODY" "['id']")

do_curl "$API/users/$USER2_ID/balance"
BAL2=$(json_field "$HTTP_BODY" "['available_balance']")
assert_eq "$BAL2" "0" "User 2 starts with 0 sat"

do_curl "$API/users/$USER2_ID"
FP2=$(json_field "$HTTP_BODY" "['free_posts_remaining']")
assert_eq "$FP2" "1" "User 2 has 1 free post"

# =========================================
# SUMMARY
# =========================================
echo ""
echo -e "\033[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
if [ $FAIL -eq 0 ]; then
  echo -e "\033[1;32m  ALL $PASS TESTS PASSED ✅\033[0m"
else
  echo -e "\033[1;31m  RESULTS: $PASS passed, $FAIL failed\033[0m"
fi
echo -e "\033[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"

[ $FAIL -gt 0 ] && exit 1 || exit 0
