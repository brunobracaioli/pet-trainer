#!/usr/bin/env bash
# pet-trainer hook H2 — guard the Edge runtime declaration on /api/v1/events.
#
# Why: SPEC.md §3.1 / §8.4 — /api/v1/events is the hot path with P95 < 100ms
# budget. The hook blocks the user's terminal during ingestion, so any move
# off Edge runtime is a load-bearing regression that the build will not catch.
# This hook fires before the write lands, ensuring the runtime declaration
# can't be silently dropped and Edge-incompatible imports can't sneak in.
#
# Trigger: PreToolUse on Edit|Write|MultiEdit; this script filters to files
# under apps/web/app/api/v1/events/.

set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

input="$(cat)"

file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"

case "$file_path" in
  apps/web/app/api/v1/events/*|*/apps/web/app/api/v1/events/*) ;;
  *) exit 0 ;;
esac

case "$file_path" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

tool_name="$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null || true)"

new_content="$(printf '%s' "$input" | jq -r '
  [
    .tool_input.new_string // empty,
    .tool_input.content    // empty,
    (.tool_input.edits // [] | map(.new_string // empty) | join("\n"))
  ] | join("\n")
' 2>/dev/null || true)"

old_content="$(printf '%s' "$input" | jq -r '
  [
    .tool_input.old_string // empty,
    (.tool_input.edits // [] | map(.old_string // empty) | join("\n"))
  ] | join("\n")
' 2>/dev/null || true)"

# Heuristic 1: removing `runtime = 'edge'` via Edit/MultiEdit.
old_has=$(printf '%s' "$old_content" | grep -E -c "runtime[[:space:]]*=[[:space:]]*['\"]edge['\"]" || true)
new_has=$(printf '%s' "$new_content" | grep -E -c "runtime[[:space:]]*=[[:space:]]*['\"]edge['\"]" || true)

if [ "${old_has:-0}" -gt 0 ] && [ "${new_has:-0}" -eq 0 ]; then
  cat >&2 <<'MSG'
[pet-trainer hook] You are removing `runtime = 'edge'` from /api/v1/events.
Per SPEC.md §3.1 / §8.4 this endpoint is the hot path with P95 < 100ms
budget — Edge runtime is contractual. If a Node-only dependency is forcing
your hand, amend ADR-001 first (use /adr-new).
MSG
  exit 2
fi

# Heuristic 2: brand-new file (Write) under /events without the runtime line.
if [ "$tool_name" = "Write" ] && [ "${new_has:-0}" -eq 0 ]; then
  cat >&2 <<'MSG'
[pet-trainer hook] New file under apps/web/app/api/v1/events/ is missing:

    export const runtime = 'edge';

Per SPEC.md §3.1 / §8.4 the events ingest path runs on Edge.
MSG
  exit 2
fi

# Heuristic 3: known Edge-incompatible imports.
if printf '%s' "$new_content" | grep -E -q "from[[:space:]]+['\"](pg|fs|net|child_process|node:fs|node:child_process|node:net|node:dgram|node:cluster)['\"]"; then
  cat >&2 <<'MSG'
[pet-trainer hook] Edge-incompatible import detected in /api/v1/events.
Forbidden on Edge: pg, fs, net, child_process (and node: equivalents).
Use the fetch-based Supabase client and Web Crypto API.
MSG
  exit 2
fi

exit 0
