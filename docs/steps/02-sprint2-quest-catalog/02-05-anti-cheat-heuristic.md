---
id: 02-05-anti-cheat-heuristic
sprint: 2
order: 5
status: not-started
spec_refs: ['§10.1', '§5.1', '§5.2', '§8.4']
depends_on: [01-04-events-edge-handler, 02-01-quest-catalog-mvp]
deliverables:
  - apps/web/lib/anti-cheat.ts
  - apps/web/lib/anti-cheat.test.ts
  - apps/web/app/api/v1/events/route.ts (updated — calls checkVelocity before XP award)
  - supabase/migrations/20260429000004_anti_cheat_index.sql
acceptance:
  - All anti-cheat unit tests pass (pnpm --filter @specops/web test)
  - "Manual test: POST /api/v1/events 10x with same quest ID in <1s results in at least some rows in xp_ledger with reason containing 'anti-cheat'"
  - 'xp_ledger rows with delta=0 exist for blocked events (no XP awarded but audit trail present)'
  - pnpm --filter @specops/web typecheck exits 0
  - "SELECT COUNT(*) FROM xp_ledger WHERE reason LIKE 'anti-cheat:%' returns > 0 after the manual test"
---

## Goal

Add XP velocity caps and suspicious-event flagging to the events handler. After this step, the `xp_ledger` audit trail distinguishes normal XP awards from anti-cheat blocks and warnings, and the Redis session set prevents double-crediting the same quest within a session.

## Context

§10.1 identifies XP farming (scripted `/events` calls) as the primary abuse vector. The mitigation is:

1. **Rate-limit** (already implemented in step 01-04 via `rl:events:{user_id}` Redis key, 120 events/min).
2. **Session-scoped deduplication** (`session:{session_id}` Redis hash, TTL 24h per §5.2) — prevents the same quest from being awarded multiple times in a single session.
3. **Velocity heuristic** — if XP is being accumulated too fast (>500 XP in 60s), flag it.

This step adds items 2 and 3. Item 1 is already live.

The anti-cheat system is **heuristic, not cryptographic**. False positives are acceptable. Hard blocks (`'block'`) should be rare and auditable. Soft flags (`'warn'`) award XP but leave a trail for manual review. No automated banning in MVP — a human reviews `xp_ledger WHERE reason LIKE 'anti-cheat:%'` periodically.

The `session:{session_id}` Redis key already exists in §5.2 for the purpose of tracking which tools were used in a session (the quest engine uses it to prevent double-credit). This step aligns with that design — `checkVelocity` reads and writes this same key.

## Implementation outline

### `apps/web/lib/anti-cheat.ts`

```typescript
import { redis } from '@/lib/redis'

export type VelocityResult = 'ok' | 'warn' | 'block'

const XP_BURST_WINDOW_SECONDS = 60
const XP_BURST_THRESHOLD = 500 // XP earned in one window → block
const QUEST_REPEAT_THRESHOLD = 3 // same quest in one session → warn after 3rd

/**
 * Check whether a given (userId, sessionId, questId, xpAmount) combination
 * looks suspicious. Returns:
 *   'ok'    — normal, award XP
 *   'warn'  — suspicious, award XP but log reason='anti-cheat:suspect'
 *   'block' — clearly abusive, do NOT award XP, log reason='anti-cheat:blocked' with delta=0
 */
export async function checkVelocity(
  userId: string,
  sessionId: string,
  questId: string,
  xpAmount: number
): Promise<VelocityResult> {
  const sessionKey = `session:${sessionId}`
  const xpBurstKey = `rl:xp:${userId}`

  // --- Check 1: Quest repeat within session ---
  // HINCRBY session:{session_id} quest:{questId} 1
  const questCount = await redis.hincrby(sessionKey, `quest:${questId}`, 1)
  // Ensure TTL is set (24h per §5.2) — use EXPIRE only if key just created
  await redis.expire(sessionKey, 24 * 60 * 60)

  if (questCount > QUEST_REPEAT_THRESHOLD) {
    return 'block'
  }
  if (questCount === QUEST_REPEAT_THRESHOLD) {
    return 'warn'
  }

  // --- Check 2: XP velocity burst ---
  // Accumulate XP earned in the last 60s using a sliding counter
  // INCRBY rl:xp:{userId} {xpAmount} with EX 60 reset on first call
  const currentBurst = await redis.incrby(xpBurstKey, xpAmount)
  if (currentBurst === xpAmount) {
    // First entry in this window — set TTL
    await redis.expire(xpBurstKey, XP_BURST_WINDOW_SECONDS)
  }

  if (currentBurst > XP_BURST_THRESHOLD) {
    return 'block'
  }
  if (currentBurst > XP_BURST_THRESHOLD * 0.8) {
    // Within 80% of the burst limit — warn
    return 'warn'
  }

  return 'ok'
}
```

Notes on this implementation:

- The `session:{session_id}` hash field `quest:{questId}` tracks how many times this quest has been awarded per session. The quest engine in step 01-05 uses the same hash for tool tracking — they coexist as different fields within the same hash. No key conflict.
- `INCRBY rl:xp:{userId}` uses a new key distinct from the existing `rl:events:{userId}` rate-limit key. The event rate-limit caps events per minute; the XP burst key caps XP earned per minute. They measure different things.
- The `EXPIRE` after `INCRBY` is not atomic — there is a small race where two concurrent calls both do INCRBY and then both try to EXPIRE. This is acceptable: worst case, the TTL gets reset slightly. Using `SET ... EX ... INCRBY` (Lua script) would be more correct but adds complexity. For MVP heuristics, the race is acceptable.
- If Upstash supports Lua scripts via `EVAL`, consider replacing the INCRBY+EXPIRE pair with a Lua script for correctness. Document as a Sprint 4 hardening item.

### `apps/web/lib/anti-cheat.test.ts`

Use Vitest. Mock the `redis` module. Test the three outcomes:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkVelocity } from './anti-cheat'

// Mock redis
vi.mock('@/lib/redis', () => ({
  redis: {
    hincrby: vi.fn(),
    expire: vi.fn(),
    incrby: vi.fn(),
  },
}))

import { redis } from '@/lib/redis'

describe('checkVelocity', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns ok for first quest completion in a session with low XP', async () => {
    vi.mocked(redis.hincrby).mockResolvedValue(1) // first time this quest in session
    vi.mocked(redis.incrby).mockResolvedValue(100) // 100 XP accumulated this minute
    const result = await checkVelocity('user-1', 'session-1', 'first-edit', 50)
    expect(result).toBe('ok')
  })

  it('returns warn when quest is completed 3rd time in same session', async () => {
    vi.mocked(redis.hincrby).mockResolvedValue(3) // 3rd completion
    vi.mocked(redis.incrby).mockResolvedValue(150)
    const result = await checkVelocity('user-1', 'session-1', 'first-edit', 50)
    expect(result).toBe('warn')
  })

  it('returns block when quest is completed more than 3 times in same session', async () => {
    vi.mocked(redis.hincrby).mockResolvedValue(4) // 4th completion
    vi.mocked(redis.incrby).mockResolvedValue(200)
    const result = await checkVelocity('user-1', 'session-1', 'first-edit', 50)
    expect(result).toBe('block')
  })

  it('returns warn when XP burst approaches threshold (80%)', async () => {
    vi.mocked(redis.hincrby).mockResolvedValue(1)
    vi.mocked(redis.incrby).mockResolvedValue(401) // 80.2% of 500
    const result = await checkVelocity('user-1', 'session-1', 'first-bash', 200)
    expect(result).toBe('warn')
  })

  it('returns block when XP burst exceeds threshold', async () => {
    vi.mocked(redis.hincrby).mockResolvedValue(1)
    vi.mocked(redis.incrby).mockResolvedValue(501) // exceeds 500 XP/min
    const result = await checkVelocity('user-1', 'session-1', 'posttool-hook', 200)
    expect(result).toBe('block')
  })

  it('returns ok for normal velocity across multiple quests', async () => {
    vi.mocked(redis.hincrby).mockResolvedValue(1)
    vi.mocked(redis.incrby).mockResolvedValue(200) // 200 XP in the window — fine
    const result = await checkVelocity('user-1', 'session-1', 'allow-rule', 100)
    expect(result).toBe('ok')
  })

  it('uses different session keys for different sessions', async () => {
    vi.mocked(redis.hincrby).mockResolvedValue(1)
    vi.mocked(redis.incrby).mockResolvedValue(50)
    await checkVelocity('user-1', 'session-A', 'first-edit', 50)
    expect(redis.hincrby).toHaveBeenCalledWith('session:session-A', 'quest:first-edit', 1)
    await checkVelocity('user-1', 'session-B', 'first-edit', 50)
    expect(redis.hincrby).toHaveBeenCalledWith('session:session-B', 'quest:first-edit', 1)
  })
})
```

### Update `apps/web/app/api/v1/events/route.ts`

Insert the anti-cheat check **after** quest matching but **before** XP award:

```typescript
import { checkVelocity } from '@/lib/anti-cheat'

// Existing: evaluate match rules → find completed quest
// ...
if (completedQuest) {
  const velocityResult = await checkVelocity(
    userId,
    sessionId,
    completedQuest.id,
    completedQuest.xp_reward
  )

  const xpDelta = velocityResult === 'block' ? 0 : completedQuest.xp_reward
  const ledgerReason =
    velocityResult === 'ok'
      ? `quest:${completedQuest.id}`
      : velocityResult === 'warn'
        ? `anti-cheat:suspect:quest:${completedQuest.id}`
        : `anti-cheat:blocked:quest:${completedQuest.id}`

  // Always insert xp_ledger row — even for blocks (delta=0)
  await supabaseServiceRole.from('xp_ledger').insert({
    user_id: userId,
    delta: xpDelta,
    reason: ledgerReason,
    ref_id: completedQuest.id,
  })

  if (velocityResult !== 'block') {
    // Award XP only if not blocked
    await supabaseServiceRole
      .from('pets')
      .update({ xp: existingXP + xpDelta })
      .eq('owner_id', userId)

    // Update leaderboard ZSET
    await redis.zadd('lb:global:weekly', { score: existingXP + xpDelta, member: userId })
    await redis.zadd('lb:global:alltime', { score: existingXP + xpDelta, member: userId })

    // Evolution check (step 02-02)
    const newStage = evolveIfEligible(existingXP + xpDelta, currentStage)
    if (newStage !== null) {
      await supabaseServiceRole.from('pets').update({ stage: newStage }).eq('owner_id', userId)
      await redis.del(`pet:cache:${userId}`)
    }
  }
}
```

The order of operations matters:

1. `checkVelocity` — reads Redis session state
2. `xp_ledger` insert — always, regardless of block/warn/ok (audit trail)
3. Pets XP update — only if not blocked
4. Leaderboard update — only if not blocked
5. Evolution check — only if not blocked

### `supabase/migrations/20260429000004_anti_cheat_index.sql`

```sql
-- Index on xp_ledger for anti-cheat velocity queries and admin review
-- Covers: SELECT ... FROM xp_ledger WHERE user_id = ? AND created_at > ?
CREATE INDEX IF NOT EXISTS xp_ledger_user_created_idx
  ON public.xp_ledger (user_id, created_at DESC);

-- Index for finding suspicious rows (admin review dashboard, Sprint 3)
CREATE INDEX IF NOT EXISTS xp_ledger_reason_idx
  ON public.xp_ledger (reason)
  WHERE reason LIKE 'anti-cheat:%';

-- Partial index on xp_ledger for delta=0 rows (blocked events)
CREATE INDEX IF NOT EXISTS xp_ledger_blocked_idx
  ON public.xp_ledger (user_id, created_at DESC)
  WHERE delta = 0;
```

Migration filename uses the date of this spec (`20260429`) and sequence number `000004` — verify this is the correct next sequence after migrations from Sprint 1.

## Files to create / modify

| Path                                                      | Action | Notes                                                         |
| --------------------------------------------------------- | ------ | ------------------------------------------------------------- |
| `apps/web/lib/anti-cheat.ts`                              | create | checkVelocity function — Redis velocity check + session dedup |
| `apps/web/lib/anti-cheat.test.ts`                         | create | Vitest unit tests, 7 test cases minimum                       |
| `apps/web/app/api/v1/events/route.ts`                     | edit   | Insert checkVelocity call between quest match and XP award    |
| `supabase/migrations/20260429000004_anti_cheat_index.sql` | create | Indexes on xp_ledger for velocity queries and admin review    |

## Verification

```bash
# Unit tests
pnpm --filter @specops/web test apps/web/lib/anti-cheat.test.ts
# Expected: all tests pass

# Typecheck
pnpm --filter @specops/web typecheck

# Manual: run migration
supabase db push

# Verify indexes created
psql "$DATABASE_URL" -c "\d public.xp_ledger"
# Expected: shows xp_ledger_user_created_idx, xp_ledger_reason_idx, xp_ledger_blocked_idx

# Manual: flood test (requires local Supabase + seeded user with TEST_JWT)
for i in $(seq 1 10); do
  curl -s -X POST http://localhost:3000/api/v1/events \
    -H "Authorization: Bearer $TEST_JWT" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: flood-test-$(uuidgen)" \
    -d '{"session_id":"flood-session-1","hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"test.txt","new_string":"x"}}'
  done

# Check xp_ledger for anti-cheat rows
psql "$DATABASE_URL" -c "
  SELECT reason, delta, created_at
  FROM public.xp_ledger
  WHERE reason LIKE 'anti-cheat:%'
  ORDER BY created_at DESC
  LIMIT 10;
"
# Expected: rows with reason='anti-cheat:suspect:...' or 'anti-cheat:blocked:...'
# and delta=0 for blocked rows

# Verify XP was only awarded for ok/warn rows (not blocked)
psql "$DATABASE_URL" -c "
  SELECT delta, COUNT(*) FROM public.xp_ledger
  WHERE user_id = '$TEST_USER_ID'
  GROUP BY delta;
"
```

## Notes / Open questions

- The `XP_BURST_THRESHOLD` of 500 XP/60s is calibrated against the MVP quest catalog: the highest single quest reward is 300 XP (`configure-mcp`, `mcp-tool-call`). A legitimate user completing two high-value quests back-to-back reaches 600 XP — this would trigger a block. Consider raising the threshold to 600 or using a sliding window with per-quest cooldown instead of a flat burst limit. Flag this for tuning after first week of production data.
- False positive risk: a user with fast internet who completes multiple quests in quick succession may be flagged. The `warn` path still awards XP — only `block` withholds it. For MVP, `block` is reserved for clearly mechanical behavior (quest > 3x per session, or >500 XP/min).
- Admin review: Sprint 3 web dashboard should include an admin page at `/admin/xp-ledger?reason=anti-cheat` that lists flagged rows. In MVP, Bruno reviews manually via SQL. No automated ban.
- The `session:{session_id}` key TTL is 24h (§5.2). This means a quest completed in one session cannot be re-credited in the same session even if the user takes a break and comes back. Different sessions (different `session_id`) start fresh. This is correct behavior — Claude Code issues a new `session_id` for each new conversation.
- `checkVelocity` is async (Redis calls) and must not add more than 5ms to the events handler P95 latency. Upstash HTTP latency from Vercel Edge is typically 1-3ms. Two sequential Redis calls (hincrby + incrby) add ~6ms worst case. If profiling shows this is too slow, batch the calls with a Redis pipeline (`redis.pipeline()`).
- The anti-cheat logic is placed in `apps/web/lib/` (not `packages/quest-engine`) because it depends on Redis and Supabase — it is not a pure function and cannot run on the quest-engine package (which must remain dependency-free per §4.2). Keep the separation: quest-engine evaluates match rules (pure), web lib handles side effects (anti-cheat, XP writing).
- Migration sequence: verify `000004` is correct. Sprint 1 migrations are `000001` (initial schema), `000002` (RLS policies), `000003` (partitions or indexes from step 01-04). Adjust the sequence number if migrations were numbered differently.
