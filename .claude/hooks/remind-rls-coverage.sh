#!/usr/bin/env bash
# pet-trainer hook H3 — soft reminder that RLS policy edits need pgTAP coverage.
#
# Why: SPEC.md §10.3 step 6 makes pgTAP RLS policy tests a CI gate. SPEC.md §5.1
# enables RLS on every user-data table. The gap this hook closes is between
# "Claude edited a migration that touches a policy" and "Claude remembered to
# write/update the corresponding pgTAP test before pushing".
#
# Soft (does NOT block) — sometimes the test legitimately lands in the next
# commit. Stderr-only reminder. Trigger: PostToolUse on Edit|Write|MultiEdit
# of supabase/migrations/*.sql.

set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

input="$(cat)"

file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"

case "$file_path" in
  supabase/migrations/*.sql|*/supabase/migrations/*.sql) ;;
  *) exit 0 ;;
esac

new_content="$(printf '%s' "$input" | jq -r '
  [
    .tool_input.new_string // empty,
    .tool_input.content    // empty,
    (.tool_input.edits // [] | map(.new_string // empty) | join("\n"))
  ] | join("\n")
' 2>/dev/null || true)"

# Only fire if the change actually mentions RLS / a policy.
if ! printf '%s' "$new_content" | grep -E -i -q "POLICY|ENABLE[[:space:]]+ROW[[:space:]]+LEVEL[[:space:]]+SECURITY|FORCE[[:space:]]+ROW[[:space:]]+LEVEL[[:space:]]+SECURITY"; then
  exit 0
fi

cwd="$(printf '%s' "$input" | jq -r '.cwd // "."' 2>/dev/null || echo .)"
tests_dir="$cwd/supabase/tests"

recent=0
if [ -d "$tests_dir" ]; then
  recent=$(find "$tests_dir" -type f -name "*.sql" -mmin -60 2>/dev/null | wc -l | tr -d ' ')
fi

if [ "${recent:-0}" -eq 0 ]; then
  cat >&2 <<MSG
[pet-trainer hook] RLS policy change detected in:
  $file_path
No pgTAP test edited recently in supabase/tests/. Per SPEC.md §10.3 step 6,
every policy change must ship with pgTAP coverage. Helpers available in
your global .claude/: subagent migration-reviewer, skill
supabase-postgres-best-practices.
MSG
fi

exit 0
