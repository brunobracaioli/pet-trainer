---
id: 02-02-evolution-stages
sprint: 2
order: 2
status: not-started
spec_refs: ['§7.3', '§5.1', '§5.2', '§8.2', '§9.2']
depends_on: [01-04-events-edge-handler, 01-01-domain-package]
deliverables:
  - packages/domain/src/schemas/evolution.ts
  - packages/domain/src/schemas/index.ts (updated export)
  - apps/web/app/api/v1/events/route.ts (updated — calls evolveIfEligible)
  - apps/web/app/api/v1/pet/me/route.ts (GET endpoint, Edge runtime)
  - apps/web/public/sprites/stage-1.svg
  - apps/web/public/sprites/stage-2.svg
  - apps/web/public/sprites/stage-3.svg
  - apps/web/public/sprites/stage-4.svg
  - apps/web/public/sprites/stage-5.svg
  - packages/domain/src/schemas/evolution.test.ts
acceptance:
  - 'Unit test: evolveIfEligible(199, 1) returns null'
  - 'Unit test: evolveIfEligible(200, 1) returns 2'
  - 'Unit test: evolveIfEligible(800, 2) returns 3'
  - 'Unit test: evolveIfEligible(6000, 4) returns 5'
  - 'Unit test: evolveIfEligible(6000, 5) returns null (already max stage)'
  - pnpm --filter @specops/domain typecheck exits 0
  - pnpm --filter @specops/domain test exits 0
  - pnpm --filter @specops/web typecheck exits 0
  - 'GET /api/v1/pet/me returns JSON with fields: stage (1-5), sprite_url (string), xp (number)'
  - All 5 SVG files exist and are valid XML (xmllint --noout passes)
---

## Goal

Implement the 5-stage pet evolution system: XP gates, the `evolveIfEligible` pure function, wiring into the events handler post-XP-award, Redis cache invalidation on stage change, the `/api/v1/pet/me` GET endpoint, and placeholder SVG sprites for stages 1-5.

## Context

§7.3 defines the evolution stages:

| Stage | Name       | XP gate | Sprite placeholder          |
| ----- | ---------- | ------- | --------------------------- |
| 1     | Egg        | 0       | Ellipse (egg shape)         |
| 2     | Hatchling  | 200     | Circle with two dots (eyes) |
| 3     | Apprentice | 800     | Standing figure             |
| 4     | Operator   | 2500    | Ninja silhouette            |
| 5     | Architect  | 6000    | Wizard silhouette           |

The events handler (`/api/v1/events/route.ts`) already awards XP and updates `pets.xp` (from step `01-04-events-edge-handler`). This step extends it: after XP is written, call `evolveIfEligible(newXP, currentStage)` — if it returns a new stage, UPDATE `pets.stage` and flush the Redis pet cache.

The `/api/v1/pet/me` GET endpoint is new in this step. It serves the CLI `pet status` command and the web dashboard. It reads from the Redis cache first (key `pet:cache:{user_id}`, TTL 30s per §5.2), falls through to Supabase on cache miss, then repopulates the cache.

§13 Q1 (pet sprite — gh0stnel vs new mascot) is unresolved. SVG files in this step are intentional placeholders with simple geometric shapes. They will be replaced in Sprint 4 once Q1 is decided. The `sprite_url` field returned by the API uses the path `/sprites/stage-{N}.svg` served from Vercel's CDN — no changes needed to the API when sprites are updated.

## Implementation outline

### 1. `packages/domain/src/schemas/evolution.ts`

Define and export:

```typescript
// XP thresholds keyed by stage number (1-5)
export const XP_GATES: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 0,
  2: 200,
  3: 800,
  4: 2500,
  5: 6000,
} as const

export type EvolutionStage = 1 | 2 | 3 | 4 | 5

export const STAGE_NAMES: Record<EvolutionStage, string> = {
  1: 'Egg',
  2: 'Hatchling',
  3: 'Apprentice',
  4: 'Operator',
  5: 'Architect',
} as const

/**
 * Pure function — no side effects, no async.
 * Returns the new stage if XP crosses a gate, null if no change needed.
 */
export function evolveIfEligible(
  currentXP: number,
  currentStage: EvolutionStage
): EvolutionStage | null {
  // Walk stages in descending order — highest gate that XP satisfies wins
  const stages = [5, 4, 3, 2, 1] as const
  for (const stage of stages) {
    if (currentXP >= XP_GATES[stage] && stage > currentStage) {
      return stage
    }
  }
  return null
}
```

Export `EvolutionStage`, `XP_GATES`, `STAGE_NAMES`, `evolveIfEligible` from `packages/domain/src/schemas/index.ts`.

Add `EvolutionStageSchema` as a Zod schema for use in API response validation:

```typescript
import { z } from 'zod'
export const EvolutionStageSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
])
```

### 2. Unit tests — `packages/domain/src/schemas/evolution.test.ts`

Use Vitest. Cover:

- `evolveIfEligible(0, 1)` → null (at gate, no change)
- `evolveIfEligible(199, 1)` → null (below gate 2)
- `evolveIfEligible(200, 1)` → 2 (exactly at gate 2)
- `evolveIfEligible(201, 1)` → 2 (above gate 2)
- `evolveIfEligible(800, 2)` → 3 (gate 3)
- `evolveIfEligible(2500, 3)` → 4 (gate 4)
- `evolveIfEligible(6000, 4)` → 5 (gate 5)
- `evolveIfEligible(6000, 5)` → null (already max)
- `evolveIfEligible(9999, 5)` → null (over max, no higher stage)
- `evolveIfEligible(6000, 1)` → 5 (multi-stage jump — skipping levels is valid)

### 3. Update `apps/web/app/api/v1/events/route.ts`

After the XP award block (existing code from step 01-04), add:

```typescript
import { evolveIfEligible } from '@specops/domain'
import { redis } from '@/lib/redis'

// --- Evolution check ---
const newStage = evolveIfEligible(updatedXP, currentStage)
if (newStage !== null) {
  await supabaseServiceRole.from('pets').update({ stage: newStage }).eq('owner_id', userId)
  // Flush cache so next GET /pet/me reads fresh data
  await redis.del(`pet:cache:${userId}`)
}
```

`currentStage` is read from the pet row fetched earlier in the handler. `updatedXP` is the pet's XP after the award. Both should already be available from the existing XP-award logic — no extra DB query.

The cache flush must happen after the Postgres UPDATE, not before. If the UPDATE fails, the cache should not be cleared (stale cache is better than a wrong stage being shown).

### 4. `apps/web/app/api/v1/pet/me/route.ts` (new file)

Runtime: Edge (matches §8.2 — GET /pet/me is Edge).

```
export const runtime = 'edge'
```

Flow:

1. Validate JWT from `Authorization: Bearer` header (reuse `validateJwt` from auth utilities).
2. Check Redis: `HGETALL pet:cache:{userId}` — if exists and all required fields present, return immediately.
3. On cache miss: query Supabase `pets` table joined to `profiles` WHERE `owner_id = userId`.
4. Populate Redis cache: `HSET pet:cache:{userId} ...fields... EX 30` (TTL 30s per §5.2).
5. Return response with shape:

```typescript
type PetMeResponse = {
  id: string
  name: string
  species: string
  stage: 1 | 2 | 3 | 4 | 5
  stage_name: string // "Egg" | "Hatchling" | "Apprentice" | "Operator" | "Architect"
  xp: number
  xp_to_next_stage: number | null // null if at max stage
  hunger: number
  energy: number
  happiness: number
  sprite_url: string // "/sprites/stage-{stage}.svg"
  last_seen_at: string | null
}
```

`xp_to_next_stage` = XP_GATES[stage + 1] - currentXP, or null if stage === 5.
`sprite_url` = `/sprites/stage-${stage}.svg` (served from Vercel CDN, no env var needed).

Validate the Supabase response with `PetSchema` from `@specops/domain` before caching.

Return `401` if JWT invalid. Return `404` if no pet exists for the user (they haven't run `pet init` yet — direct them to CLI).

### 5. SVG sprite placeholders

Each file must be a self-contained inline SVG (valid XML, no external deps, no binary). Dimensions: 64x64 viewBox. Use simple geometric shapes that are visually distinguishable. These are placeholders per §13 Q1 — final art in Sprint 4.

`stage-1.svg` — Egg: white ellipse with a subtle gradient, rounded oval.
`stage-2.svg` — Hatchling: small circle (head) + two dot eyes + cracked ellipse below.
`stage-3.svg` — Apprentice: stick figure (circle head + rectangle body + four lines for limbs).
`stage-4.svg` — Operator: ninja silhouette — circle head + trapezoid body + diagonal lines suggesting a mask.
`stage-5.svg` — Architect: wizard — tall triangle (robe) + circle head + star accent.

All SVGs must pass `xmllint --noout` (well-formed XML). Keep them under 500 bytes each — they are inline SVGs, not raster images.

## Files to create / modify

| Path                                            | Action | Notes                                                                 |
| ----------------------------------------------- | ------ | --------------------------------------------------------------------- |
| `packages/domain/src/schemas/evolution.ts`      | create | XP_GATES, EvolutionStage type, evolveIfEligible, EvolutionStageSchema |
| `packages/domain/src/schemas/evolution.test.ts` | create | Vitest unit tests (10 cases minimum)                                  |
| `packages/domain/src/schemas/index.ts`          | edit   | Re-export all evolution exports                                       |
| `apps/web/app/api/v1/events/route.ts`           | edit   | Add evolveIfEligible call + cache flush after XP award                |
| `apps/web/app/api/v1/pet/me/route.ts`           | create | GET endpoint, Edge runtime, Redis cache read-through                  |
| `apps/web/public/sprites/stage-1.svg`           | create | Egg placeholder SVG                                                   |
| `apps/web/public/sprites/stage-2.svg`           | create | Hatchling placeholder SVG                                             |
| `apps/web/public/sprites/stage-3.svg`           | create | Apprentice placeholder SVG                                            |
| `apps/web/public/sprites/stage-4.svg`           | create | Operator placeholder SVG                                              |
| `apps/web/public/sprites/stage-5.svg`           | create | Architect placeholder SVG                                             |

## Verification

```bash
# Domain typechecks
pnpm --filter @specops/domain typecheck

# Evolution unit tests
pnpm --filter @specops/domain test --reporter=verbose

# Web typechecks (catches import errors in updated events route + new pet/me route)
pnpm --filter @specops/web typecheck

# SVG files are valid XML
for n in 1 2 3 4 5; do
  xmllint --noout "apps/web/public/sprites/stage-${n}.svg" \
    && echo "OK: stage-${n}.svg" \
    || echo "FAIL: stage-${n}.svg"
done

# GET /pet/me returns correct shape (requires local Supabase + seeded user)
curl -s -H "Authorization: Bearer $TEST_JWT" \
  http://localhost:3000/api/v1/pet/me | jq '{stage, sprite_url, xp}'
# Expected: {"stage": 1, "sprite_url": "/sprites/stage-1.svg", "xp": 0}

# Simulate evolution: set pet xp to 200, call events endpoint, verify stage updates
psql "$DATABASE_URL" -c "UPDATE pets SET xp = 200 WHERE owner_id = '$TEST_USER_ID';"
# Then POST a hook event and check:
psql "$DATABASE_URL" -c "SELECT stage FROM pets WHERE owner_id = '$TEST_USER_ID';"
# Expected: stage = 2

# Verify Redis cache flushes on stage change
redis-cli GET "pet:cache:$TEST_USER_ID"
# Expected: (nil) — flushed by evolveIfEligible path
```

## Notes / Open questions

- `evolveIfEligible` handles multi-stage jumps (e.g., a user that accumulates 6000 XP before any stage check runs will jump directly to stage 5). This is correct behavior — do not clamp to stage + 1.
- The multi-stage jump scenario is most likely for the offline buffer sync path (step 02-04): a user accumulates many events offline, then syncs — all events are processed in sequence and `evolveIfEligible` is called after each XP award. The final stage will be whatever the XP warrants.
- §13 Q1 is explicitly deferred to Sprint 4. The `species` field in the `pets` table defaults to `'gh0stnel'` per §5.1 — the SVG sprite file name does not depend on `species` in MVP (there is only one mascot). When Q1 resolves and a new mascot is added, `sprite_url` logic will need to incorporate `species`.
- Cache key shape `pet:cache:{user_id}` with TTL 30s is fixed by §5.2. Do not change the TTL or key structure — observability tooling and the leaderboard service assume this shape.
- The Redis `HSET ... EX` pattern (hash with expiry) requires Upstash Redis >= 6.2. Confirm the Upstash plan supports hash TTL via `EXPIRE` after `HSET` if `EX` flag is not available on HSET in the current Upstash client version.
- The `GET /api/v1/pet/me` endpoint must handle the case where a pet row does not exist — return 404 with `{"error": "pet_not_found", "message": "Run pet init to create your pet"}`. Never return a 500 for a missing row.
