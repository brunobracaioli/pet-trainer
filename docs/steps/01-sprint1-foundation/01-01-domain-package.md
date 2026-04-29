---
id: 01-01-domain-package
sprint: 1
order: 1
status: not-started
spec_refs: ['§5.1', '§8.3', '§7.1', '§11']
depends_on: [00-02-tooling-baseline]
deliverables:
  - packages/domain/src/schemas/event.ts
  - packages/domain/src/schemas/pet.ts
  - packages/domain/src/schemas/quest.ts
  - packages/domain/src/schemas/profile.ts
  - packages/domain/src/schemas/xp-ledger.ts
  - packages/domain/src/schemas/index.ts
  - packages/domain/src/index.ts
  - packages/domain/package.json
  - packages/domain/tsconfig.json
acceptance:
  - pnpm --filter @specops/domain typecheck exits 0
  - All schemas importable from @specops/domain (import { PetSchema, EventPayloadSchema } from '@specops/domain')
  - No z.any() present anywhere in packages/domain/src/
  - Every schema file exports both a Zod schema and a TypeScript type via z.infer
---

## Goal

Create `packages/domain` with all Zod schemas for every domain entity so that `apps/web`, `apps/cli`, and `packages/quest-engine` share a single authoritative type layer without duplicating definitions.

## Context

SPEC.md §5.1 defines the full Postgres schema — every table column and constraint is the source of truth for the corresponding Zod schema. These schemas double as the OpenAPI 3.1 source per §11 (generated via `zod-to-openapi` in a later step). The `@specops/domain` package must be the first Sprint 1 deliverable because step 01-02 (`supabase gen types`) outputs into it, step 01-03 (quest-engine) imports `EventPayload` from it, and step 01-04 (events route) validates every inbound hook payload against `EventPayloadSchema`. Nothing in Sprint 1 can type-check cleanly until this package has non-stub content.

## Implementation outline

- Replace the `export {}` stub in `packages/domain/src/index.ts` with re-exports from `./schemas/index` — this keeps the barrel as the sole public interface (§11 OpenAPI generation imports from here).
- Create `packages/domain/src/schemas/event.ts` with `EventPayloadSchema`: all five fields from §8.3 (`session_id: z.string().uuid()`, `hook_event_name: z.string()`, `tool_name: z.string().optional()`, `tool_input: z.record(z.unknown()).optional()`, `tool_response: z.record(z.unknown()).optional()`). Export `type EventPayload = z.infer<typeof EventPayloadSchema>`.
- Create `packages/domain/src/schemas/pet.ts` matching §5.1 `pets` table exactly: `id: z.string().uuid()`, `owner_id: z.string().uuid()`, `name: z.string()`, `species: z.string().default('gh0stnel')`, `stage: z.number().int().min(1).max(5)`, `xp: z.number().int().min(0)`, `hunger: z.number().int().min(0).max(100)`, `energy: z.number().int().min(0).max(100)`, `happiness: z.number().int().min(0).max(100)`, `last_seen_at: z.string().datetime().optional()`, `created_at: z.string().datetime().optional()`. Export `type Pet = z.infer<typeof PetSchema>`.
- Create `packages/domain/src/schemas/quest.ts` matching §5.1 `quests` table: `id: z.string()` (slug format, e.g. `"first-edit"`), `title: z.string()`, `description: z.string()`, `difficulty: z.number().int().min(1).max(5)`, `xp_reward: z.number().int().positive()`, `required_tool: z.string().optional()`, `match_rule: z.record(z.unknown())` (opaque — evaluator in step 01-03 owns shape validation), `category: z.enum(['basics','permissions','hooks','slash-commands','subagents','skills-mcp'])` (§7.2 categories), `unlocks_after: z.array(z.string()).default([])`, `is_active: z.boolean().default(true)`, `created_at: z.string().datetime().optional()`. Export `type Quest = z.infer<typeof QuestSchema>`.
- Create `packages/domain/src/schemas/profile.ts` matching §5.1 `profiles` table: `id: z.string().uuid()`, `username: z.string().min(1).max(39)` (GitHub username max), `github_login: z.string()`, `avatar_url: z.string().url().optional()`, `created_at: z.string().datetime().optional()`, `preferences: z.record(z.unknown()).default({})`. Export `type Profile = z.infer<typeof ProfileSchema>`.
- Create `packages/domain/src/schemas/xp-ledger.ts` matching §5.1 `xp_ledger` table: `id: z.number().int().optional()` (BIGSERIAL, omitted on insert), `user_id: z.string().uuid()`, `delta: z.number().int()`, `reason: z.string()` (format: `"quest:<quest-id>"`), `ref_id: z.string().optional()`, `created_at: z.string().datetime().optional()`. Export `type XpLedger = z.infer<typeof XpLedgerSchema>`.
- Create `packages/domain/src/schemas/index.ts` as a barrel that re-exports all schema constants and inferred types: one named export per schema object + one named export per inferred type.
- Add `zod` to `packages/domain/package.json` dependencies (only runtime dep allowed in this package); update `"exports"` field to `{ ".": "./src/index.ts" }` for workspace consumption. Add `tsconfig.json` that `extends` the root `tsconfig.base.json` with `"strict": true` and `"noUncheckedIndexedAccess": true`.

## Files to create / modify

| Path                                       | Action | Notes                                                               |
| ------------------------------------------ | ------ | ------------------------------------------------------------------- |
| `packages/domain/package.json`             | edit   | Add `"dependencies": { "zod": "^3" }`, keep zero other runtime deps |
| `packages/domain/tsconfig.json`            | create | Extends root base, strict mode on                                   |
| `packages/domain/src/index.ts`             | edit   | Replace `export {}` stub with `export * from './schemas/index'`     |
| `packages/domain/src/schemas/event.ts`     | create | EventPayloadSchema + EventPayload type (§8.3 body shape)            |
| `packages/domain/src/schemas/pet.ts`       | create | PetSchema + Pet type (§5.1 pets table)                              |
| `packages/domain/src/schemas/quest.ts`     | create | QuestSchema + Quest type (§5.1 quests table, §7.2 categories enum)  |
| `packages/domain/src/schemas/profile.ts`   | create | ProfileSchema + Profile type (§5.1 profiles table)                  |
| `packages/domain/src/schemas/xp-ledger.ts` | create | XpLedgerSchema + XpLedger type (§5.1 xp_ledger table)               |
| `packages/domain/src/schemas/index.ts`     | create | Barrel re-exporting all schemas and types                           |

## Verification

```bash
# Typecheck passes with zero errors
pnpm --filter @specops/domain typecheck

# No z.any() escaping anywhere in the schema files
grep -r "z\.any()" packages/domain/src/ && echo "FAIL: z.any() found" || echo "OK"

# All schema names importable (smoke-test via node --input-type=module)
node --input-type=module <<'EOF'
import {
  EventPayloadSchema, PetSchema, QuestSchema,
  ProfileSchema, XpLedgerSchema
} from './packages/domain/src/index.ts'
console.log('all schemas importable')
EOF

# Stage enum values match §7.2 categories exactly
node --input-type=module <<'EOF'
import { QuestSchema } from './packages/domain/src/schemas/quest.ts'
const cat = QuestSchema.shape.category
console.log(cat._def.values) // should list all 6 category strings
EOF
```

## Notes / Open questions

- `match_rule` in `QuestSchema` is typed as `z.record(z.unknown())` intentionally — the evaluator in `packages/quest-engine` (step 01-03) owns the discriminated union for match rule operators (§7.1). Widening here avoids a circular dep between `domain` and `quest-engine`.
- `tool_input` and `tool_response` in `EventPayloadSchema` are `z.record(z.unknown()).optional()` because their shape varies by tool (Edit has `file_path`/`old_string`/`new_string`; Bash has `command`; etc.) — the quest engine reads nested fields via the DSL at runtime.
- The `supabase gen types typescript --local` command in step 01-02 writes generated types to `packages/domain/src/database.types.ts`. That file is auto-generated and must NOT be edited manually; Zod schemas remain the hand-authored authoritative layer on top of it.
- §13 Q2 (username derivation): `ProfileSchema.username` validation length is set to 39 chars (GitHub max) — no custom username logic yet; that resolves in Sprint 1 per Q2.
- Do not add `zod-to-openapi` to this package — the OpenAPI generation pipeline lives in `apps/web` and imports from `@specops/domain`. Adding it here creates a circular concern.
