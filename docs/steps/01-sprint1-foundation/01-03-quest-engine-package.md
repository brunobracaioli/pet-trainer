---
id: 01-03-quest-engine-package
sprint: 1
order: 3
status: done
spec_refs: ['§7.1', '§3.3', '§8.4']
depends_on: [01-01-domain-package]
deliverables:
  - packages/quest-engine/src/types.ts
  - packages/quest-engine/src/operators.ts
  - packages/quest-engine/src/evaluator.ts
  - packages/quest-engine/src/index.ts
  - packages/quest-engine/src/evaluator.test.ts
  - packages/quest-engine/tsconfig.json
  - packages/quest-engine/package.json
acceptance:
  - pnpm --filter @specops/quest-engine test passes (all operators covered, no skipped tests)
  - pnpm --filter @specops/quest-engine typecheck exits 0
  - packages/quest-engine/package.json has zero entries in "dependencies" (only devDependencies)
  - evaluateMatchRule returns true for all three example rules from §7.1 against their matching events
---

## Goal

Implement the pure, dependency-free match rule DSL evaluator in `packages/quest-engine` with Vitest coverage of every operator so that the Edge Function in step 01-04 can detect quest completion without importing any runtime-incompatible library.

## Context

SPEC.md §7.1 defines the DSL with 11 operators and provides three concrete example rules (`first-edit`, `configure-posttooluse-hook`, `spawn-subagent`). The evaluator runs inside the `/api/v1/events` Edge Function (§8.4 step 5) and must therefore be free of all runtime dependencies — no npm imports, no Node built-ins that break on Edge. It imports only from `@specops/domain` for the `EventPayload` type (a workspace ref, not an npm dep). Because quest logic lives server-side (ADR-003 §3.3), the evaluator can be updated without users upgrading the CLI, which is one of the core value propositions of the HTTP hook architecture.

## Implementation outline

- Create `packages/quest-engine/src/types.ts` with a `MatchRule` discriminated union covering all 11 operators from §7.1: `equals`, `contains`, `startsWith`, `endsWith`, `regex`, `min_count`, `gte`, `lte`, `in`, `and`, `or`, `not`. Field-level operators (applied to `event_type`, `tool_name`, or nested fields like `tool_input.file_path`) use a flat object shape: `{ field: string; operator: "equals" | "contains" | ...; value: unknown }`. Composite operators (`and`, `or`, `not`) take `{ and: MatchRule[] }`, `{ or: MatchRule[] }`, `{ not: MatchRule }`. `min_count` is a top-level property `{ min_count: number }` — it does not filter by itself, it expresses a cardinality constraint that the caller must satisfy by counting prior matches. Export the `MatchRule` union type.
- Create `packages/quest-engine/src/operators.ts` with one pure function per operator. Each takes `(fieldValue: unknown, ruleValue: unknown): boolean`. Implementations: `opEquals` — strict equality; `opContains` — `String(fieldValue).includes(String(ruleValue))`; `opStartsWith` / `opEndsWith` — String prototype methods; `opRegex` — `new RegExp(String(ruleValue)).test(String(fieldValue))` (do not use the `g` flag — stateful RegExp breaks Edge idempotency); `opGte` / `opLte` — numeric comparison with `Number()` coercion; `opIn` — `Array.isArray(ruleValue) && ruleValue.includes(fieldValue)`.
- Create `packages/quest-engine/src/evaluator.ts` exporting `evaluateMatchRule(rule: MatchRule, event: EventPayload): boolean`. The function resolves nested field paths (e.g., `tool_input.file_path`) by splitting on `.` and walking `event` as a plain object. For composite rules, recurse: `and` requires all children true, `or` requires any child true, `not` inverts. For `min_count`, always return `true` from the evaluator (the caller in step 01-04 maintains a count of how many times this event+rule matched and applies the `min_count` threshold externally). Include a JSDoc comment explaining the `min_count` caller contract.
- Create `packages/quest-engine/src/index.ts` that exports `evaluateMatchRule` and the `MatchRule` type (the only public surface of this package).
- Create `packages/quest-engine/src/evaluator.test.ts` as a Vitest suite. Required test cases: (1) The `first-edit` example rule from §7.1 — verify `evaluateMatchRule` returns `true` for an event `{ hook_event_name: "PostToolUse", tool_name: "Edit" }` and `false` for `{ hook_event_name: "PostToolUse", tool_name: "Bash" }`. (2) The `configure-posttooluse-hook` rule from §7.1 — verify nested field resolution: `tool_input.file_path` endsWith `.claude/settings.json` and `tool_input.new_string` contains `PostToolUse`. (3) The `spawn-subagent` rule from §7.1 — verify `tool_name: "Task"` match. (4) One test per operator for boundary conditions (e.g., `regex` with a failing pattern, `in` with value not in array, `gte` at the boundary value). (5) `and` / `or` / `not` composition tests. Copy the three example rules verbatim from §7.1 into the test file as constants.
- Update `packages/quest-engine/package.json`: set `"devDependencies"` to include `vitest` and `@specops/domain` (workspace ref `"workspace:*"`). The `"dependencies"` block must be `{}` or absent. Add `"scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" }`.
- Add `packages/quest-engine/tsconfig.json` extending root base with `"strict": true`.

## Files to create / modify

| Path                                          | Action | Notes                                                            |
| --------------------------------------------- | ------ | ---------------------------------------------------------------- |
| `packages/quest-engine/package.json`          | edit   | Add vitest + @specops/domain as devDeps; zero runtime deps       |
| `packages/quest-engine/tsconfig.json`         | create | Extends root base, strict mode                                   |
| `packages/quest-engine/src/types.ts`          | create | MatchRule discriminated union (11 operators from §7.1)           |
| `packages/quest-engine/src/operators.ts`      | create | One pure function per leaf operator                              |
| `packages/quest-engine/src/evaluator.ts`      | create | evaluateMatchRule + nested field path resolution                 |
| `packages/quest-engine/src/index.ts`          | edit   | Replace `export {}` stub with public exports                     |
| `packages/quest-engine/src/evaluator.test.ts` | create | Vitest suite — all 3 example rules + per-operator boundary tests |

## Verification

```bash
# All tests pass
pnpm --filter @specops/quest-engine test

# Zero runtime dependencies
node -e "
  const pkg = require('./packages/quest-engine/package.json');
  const deps = Object.keys(pkg.dependencies || {});
  if (deps.length > 0) { console.error('FAIL: runtime deps found:', deps); process.exit(1); }
  console.log('OK: no runtime deps');
"

# Typecheck clean
pnpm --filter @specops/quest-engine typecheck

# Smoke: first-edit example rule passes
node --input-type=module <<'EOF'
import { evaluateMatchRule } from './packages/quest-engine/src/index.ts'
const rule = { event_type: 'PostToolUse', tool_name: 'Edit', min_count: 1 }
const event = { session_id: '00000000-0000-0000-0000-000000000001', hook_event_name: 'PostToolUse', tool_name: 'Edit' }
const result = evaluateMatchRule(rule, event)
if (!result) throw new Error('first-edit rule should match')
console.log('OK: first-edit matches')
EOF
```

## Notes / Open questions

- `min_count` semantics: the evaluator returns `true` when a single event matches the structural part of the rule. The caller (step 01-04, `apps/web/app/api/v1/events/route.ts`) is responsible for counting prior matches using the `session:{session_id}` Redis hash (§5.2) and comparing to `min_count`. Document this contract prominently in a JSDoc on `evaluateMatchRule` so future contributors do not re-implement counting inside the evaluator.
- The `regex` operator must not use RegExp with the `g` flag — stateful `lastIndex` breaks repeated calls in the same Edge Function invocation for different events. Use `new RegExp(pattern).test(value)` (creates a fresh RegExp each time).
- Nested field paths like `tool_input.file_path` assume `event.tool_input` is a plain object. If the field is absent, the operator must return `false` (not throw). Defensive `?.` chaining on path resolution is required.
- The `@specops/domain` dependency is a devDependency (workspace ref) because the `EventPayload` type is only needed at compile time — `evaluateMatchRule` accepts a plain object at runtime and the TypeScript type just provides the call-site signature.
- Do not add `zod` to this package — rule schemas are not validated by Zod here. The API route validates the inbound event payload with `EventPayloadSchema` before calling `evaluateMatchRule`. Match rules themselves come from the database and are trusted (they were inserted via the service role at seed time).
