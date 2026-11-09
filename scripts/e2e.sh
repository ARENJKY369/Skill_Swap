#!/usr/bin/env bash
# Curl E2E for the Java service. Run from the repository root after starting the API.
# Requires dev mode (so signup returns devVerificationCode), curl and python3.
# The completion step moves the accepted session's start into the past through
# SQLite because a freshly-created future session cannot be completed under the
# shared sessionStateMachine rule "now >= end".
set -euo pipefail

BASE="${BASE_URL:-http://localhost:8787}"
DB="${SKILLSWAP_DB:-data/skillswap.db}"
PASSWORD='StudentPass123'
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
JAR_A="$WORK/a.cookies"
JAR_B="$WORK/b.cookies"
: > "$JAR_A"
: > "$JAR_B"

BODY=''
STATUS=''

log() { echo "$*" >&2; }

request() {
  local method="$1" jar="$2" path="$3" body="${4:-}" token="${5:-}"
  local out="$WORK/body"
  local -a args=(-sS -o "$out" -w '%{http_code}' -b "$jar" -c "$jar" -X "$method")
  if [[ -n "$token" ]]; then args+=(-H "x-csrf-token: $token"); fi
  if [[ -n "$body" ]]; then args+=(-H 'Content-Type: application/json' -d "$body"); fi
  STATUS="$(curl "${args[@]}" "$BASE$path")"
  BODY="$(cat "$out")"
}

json_get() {
  python3 -c '
import json, sys
obj = json.load(sys.stdin)
for part in sys.argv[1].split("."):
    if part.isdigit() and isinstance(obj, list):
        obj = obj[int(part)]
    else:
        obj = obj[part]
if isinstance(obj, bool):
    print("true" if obj else "false")
elif obj is None:
    print("")
else:
    print(obj)
' "$1" <<< "$BODY"
}

expect() {
  local expected="$1" label="$2"
  if [[ "$STATUS" != "$expected" ]]; then
    log "FAIL: $label (expected $expected, got $STATUS)"
    log "$BODY"
    exit 1
  fi
  log "ok: $label ($STATUS)"
}

expect_any() {
  local label="$1"; shift
  for expected in "$@"; do
    if [[ "$STATUS" == "$expected" ]]; then
      log "ok: $label ($STATUS)"
      return 0
    fi
  done
  log "FAIL: $label (expected one of $*, got $STATUS)"
  log "$BODY"
  exit 1
}

csrf_for() {
  local jar="$1"
  request GET "$jar" /api/auth/csrf '' ''
  expect 200 'csrf token'
  json_get csrfToken
}

signup_and_login() {
  local jar="$1" label="$2" email="$3"
  local token body code
  token="$(csrf_for "$jar")"
  body="$(printf '{"name":"%s","email":"%s","password":"%s","major":"E2E"}' "$label" "$email" "$PASSWORD")"
  request POST "$jar" /api/auth/signup "$body" "$token"
  expect 201 "signup $label"
  code="$(json_get devVerificationCode)"
  if [[ -z "$code" ]]; then
    log 'FAIL: devVerificationCode missing; run the service in dev mode'
    exit 1
  fi
  body="$(printf '{"email":"%s","code":"%s"}' "$email" "$code")"
  request POST "$jar" /api/auth/verify-email "$body" "$token"
  expect 200 "verify $label"
  request POST "$jar" /api/auth/logout '{}' "$token"
  expect 200 "logout $label"
  # logout clears ss_csrf; obtain a fresh double-submit token before logging in.
  token="$(csrf_for "$jar")"
  body="$(printf '{"identifier":"%s","password":"%s","rememberMe":false}' "$email" "$PASSWORD")"
  request POST "$jar" /api/auth/login "$body" "$token"
  expect 200 "login $label"
  json_get user.id
}

STAMP="$(date +%s)"
EMAIL_A="e2e-a-${STAMP}-${RANDOM}@skillswap.test"
EMAIL_B="e2e-b-${STAMP}-${RANDOM}@skillswap.test"
# signup_and_login obtains its own CSRF token and refreshes it after logout.
A_ID="$(signup_and_login "$JAR_A" 'E2E A' "$EMAIL_A")"
B_ID="$(signup_and_login "$JAR_B" 'E2E B' "$EMAIL_B")"
# Refresh the double-submit tokens used for the later mutating API calls.
CSRF_A="$(csrf_for "$JAR_A")"
CSRF_B="$(csrf_for "$JAR_B")"
log "users: $A_ID / $B_ID"

request GET "$JAR_A" /api/admin/stats '' ''
expect 403 'RBAC denial on /api/admin/stats'

request GET "$JAR_A" '/api/skills?q=Java%20OOP' '' ''
expect 200 'skills lookup'
SKILL_ID="$(json_get skills.0.id)"
if [[ -z "$SKILL_ID" ]]; then
  log 'FAIL: Java OOP skill not found; seed the database first'
  exit 1
fi

DATE="$(python3 -c 'import datetime; print((datetime.date.today()+datetime.timedelta(days=1)).isoformat())')"
SESSION_BODY="$(printf '{"recipientId":"%s","skillId":"%s","date":"%s","time":"10:00","durationMin":60,"message":"E2E"}' "$B_ID" "$SKILL_ID" "$DATE")"
request POST "$JAR_A" /api/sessions "$SESSION_BODY" "$CSRF_A"
expect 201 'create 10:00 session'
SESSION_ID="$(json_get id)"

CONFLICT_BODY="$(printf '{"recipientId":"%s","skillId":"%s","date":"%s","time":"10:30","durationMin":60,"message":"E2E conflict"}' "$B_ID" "$SKILL_ID" "$DATE")"
request POST "$JAR_A" /api/sessions "$CONFLICT_BODY" "$CSRF_A"
expect 409 'double-booking at 10:30'

REVIEW_BODY="$(printf '{"sessionId":"%s","punctuality":5,"clarity":5,"engagement":5,"overall":5,"text":"E2E"}' "$SESSION_ID")"
request POST "$JAR_A" /api/reviews "$REVIEW_BODY" "$CSRF_A"
expect 403 'review before completion'

request PATCH "$JAR_B" "/api/sessions/$SESSION_ID" '{"action":"accept"}' "$CSRF_B"
expect 200 'recipient accepts session'

python3 - "$DB" "$SESSION_ID" <<'PY'
import datetime, sqlite3, sys
db, session_id = sys.argv[1], sys.argv[2]
start = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=2)).isoformat().replace('+00:00', 'Z')
con = sqlite3.connect(db)
con.execute('UPDATE sessions SET start = ? WHERE id = ?', (start, session_id))
con.commit()
con.close()
print('moved session start into the past for completion', file=sys.stderr)
PY

request PATCH "$JAR_A" "/api/sessions/$SESSION_ID" '{"action":"complete"}' "$CSRF_A"
expect 200 'requester completes'
request PATCH "$JAR_B" "/api/sessions/$SESSION_ID" '{"action":"complete"}' "$CSRF_B"
expect 200 'recipient completes'
if [[ "$(json_get session.status)" != 'Completed' ]]; then
  log 'FAIL: session did not reach Completed'
  log "$BODY"
  exit 1
fi

request POST "$JAR_A" /api/reviews "$REVIEW_BODY" "$CSRF_A"
expect_any 'review accepted' 200 201
request POST "$JAR_A" /api/reviews "$REVIEW_BODY" "$CSRF_A"
expect 409 'duplicate review rejected'

log 'E2E PASS'
