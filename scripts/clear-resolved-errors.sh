#!/usr/bin/env bash
# Clear RESOLVED errors from the MangaMultiVerse error_log.
#
# Deletes only level=error rows (the ones the Error Agent surfaces as bugs).
# Leaves info-level rows (e.g. the sink-verification ping) untouched.
# Reads Supabase creds from .env.local — no secrets on the command line.
#
# Usage:  bash scripts/clear-resolved-errors.sh
set -euo pipefail
cd "$(dirname "$0")/.."

URL="$(grep '^SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '\r')"
SVC="$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '\r')"

if [ -z "$URL" ] || [ -z "$SVC" ]; then
  echo "error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env.local" >&2
  exit 1
fi

code=$(curl -s -o /dev/null -w '%{http_code}' \
  -X DELETE "$URL/rest/v1/error_log?level=eq.error" \
  -H "apikey: $SVC" -H "Authorization: Bearer $SVC" -H "Prefer: return=minimal")

if [ "$code" = "204" ]; then
  echo "Cleared resolved (level=error) rows from error_log. (HTTP 204)"
else
  echo "Delete returned HTTP $code (expected 204)." >&2
  exit 1
fi
