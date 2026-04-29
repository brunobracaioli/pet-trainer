#!/usr/bin/env bash
# pet-trainer hook H1 — guard against literal tokens in .claude/settings.json
#
# Why: SPEC.md §10.1 lists "Token leak via repo público" as the #1 supply-chain
# threat for this product. SPEC.md §6.4 mandates the token come from env var
# $PET_TRAINER_TOKEN, never inlined into the JSON. This hook fails BEFORE the
# write hits disk, instead of relying on gitleaks to catch it after the fact.
#
# Trigger: PreToolUse on Edit|Write|MultiEdit targeting .claude/settings.json
# (matcher in .claude/settings.json filters by tool; this script filters by path).
# Exit 2 with stderr blocks the tool call.

set -uo pipefail

# Defensive: if jq is missing, do not block dev.
command -v jq >/dev/null 2>&1 || exit 0

input="$(cat)"

file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"

case "$file_path" in
  */.claude/settings.json|*/.claude/settings.local.json|.claude/settings.json|.claude/settings.local.json) ;;
  *) exit 0 ;;
esac

# Aggregate every string the tool will write into the file.
content="$(printf '%s' "$input" | jq -r '
  [
    .tool_input.new_string // empty,
    .tool_input.content    // empty,
    (.tool_input.edits // [] | map(.new_string // empty) | join("\n"))
  ] | join("\n")
' 2>/dev/null || true)"

[ -z "$content" ] && exit 0

# Match `Bearer ` followed by anything whose first non-space char is NOT `$`.
# This passes "Bearer $PET_TRAINER_TOKEN" / "Bearer ${PET_TRAINER_TOKEN}"
# and blocks "Bearer abc123" / "Bearer xyz".
if printf '%s' "$content" | grep -E -i -q 'Bearer[[:space:]]+[^$[:space:]]'; then
  cat >&2 <<'MSG'
[pet-trainer hook] Literal token detected in .claude/settings.json.
Per SPEC.md §6.4 / §10.1, the token MUST come from the env var
$PET_TRAINER_TOKEN. Use:

    "Authorization": "Bearer $PET_TRAINER_TOKEN"

Note: this is exactly what the pet-trainer product teaches its users to
avoid. The dev repo can't be the first to leak.
MSG
  exit 2
fi

exit 0
