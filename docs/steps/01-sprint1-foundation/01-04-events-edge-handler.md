---
id: 01-04-events-edge-handler
sprint: 1
order: 4
status: done
spec_refs: ['§8.3', '§8.4', '§5.2', '§10.1', '§10.2', '§3.3']
depends_on: [01-01-domain-package, 01-02-supabase-schema-and-rls, 01-03-quest-engine-package]
deliverables:
  - apps/web/app/api/v1/events/route.ts
  - apps/web/app/api/v1/events/route.test.ts
acceptance:
  - pnpm --filter @specops/web typecheck exits 0
  - pnpm vitest run apps/web/app/api/v1/events/route.test.ts passes (all 5 scenario tests)
  - route.ts exports `export const runtime = 'edge'` (grep-verifiable)
  - No SUPABASE_SERVICE_ROLE_KEY string literal present in route.ts (secret never hardcoded)
  - POST with a duplicate Idempotency-Key returns HTTP 200 with accepted:false (not 4xx)
  - POST with an invalid JWT returns HTTP 401
  - POST when rate limit exceeded returns HTTP 429
---

## Goal

Implement the `/api/v1/events` Edge Function — the hot path for hook ingestion — following the exact 7-step sequence from §8.4 so that authenticated hook payloads are rate-limited, deduplicated, persisted, and evaluated for quest completion in under 100ms P95.

## Context

This is the most latency-sensitive endpoint in the entire system (§3.3, §8.4). Every tool call the user makes in Claude Code hits this endpoint via the HTTP hook configured by `pet init` (§6.4). The 2-second fire-and-forget timeout is enforced by the hook config, not the handler — the handler's job is to stay fast and return `200` as quickly as possible. The sequence in §8.4 is the authoritative implementation contract: JWT validation → rate-limit → idempotency → persist → evaluate rules → award XP → respond. Steps 5 and 6 (rule evaluation and XP award) are synchronous within the Edge Function's budget because deferring them to a queue would require a separate infrastructure component not in the MVP (§3.2). Telemetry payload fields must be capped at 1KB per §10.2 before persistence.

## Implementation outline

- Create `apps/web/app/api/v1/events/route.ts` and declare `export const runtime = 'edge'` as the first non-import line — this is load-bearing for Vercel's bundler and must not be removed or moved.
- **Step 1 — JWT validation:** Use Supabase's `createClient` with the `@supabase/ssr` package in Edge-compatible mode (anonymous/public key, not service role). Call `supabase.auth.getUser()` using the Bearer token extracted from the `Authorization` header. On failure, return `Response.json({ error: 'Unauthorized' }, { status: 401 })`. The `user.id` extracted here becomes `user_id` for all subsequent operations.
- **Step 2 — Rate limit:** Use `@upstash/ratelimit` with the `@upstash/redis` HTTP SDK (both Edge-compatible, no TCP). Initialize `Ratelimit.slidingWindow(120, '60 s')` with identifier `rl:events:{user_id}` (key format from §5.2). If `success === false`, return `Response.json({ error: 'Too Many Requests' }, { status: 429 })`.
- **Step 3 — Idempotency:** Read the `Idempotency-Key` header. If missing, return `400`. Use `redis.set('evt:idem:{key}', '1', { nx: true, ex: 86400 })` (§5.2 `evt:idem:` prefix, 24h TTL). If `nx` returns `null` (key existed), return `Response.json({ accepted: false, request_id: null }, { status: 200 })` — do NOT return 4xx for duplicate keys (fire-and-forget semantics: §8.3 says any 5xx triggers retry concern, so duplicates must silently succeed).
- **Step 4 — Parse + validate body:** Call `EventPayloadSchema.safeParse(await req.json())`. On validation failure, return `Response.json({ error: 'Bad Request', issues: result.error.issues }, { status: 400 })`. Before persisting, truncate `tool_input` and `tool_response` values to 1KB total per §10.2: stringify, slice to 1024 chars, parse back. Store the truncated version as the `payload` JSONB column value.
- **Step 5 — Persist to events table:** Use the Supabase client initialized with `SUPABASE_SERVICE_ROLE_KEY` env var (available in Edge Function via Vercel env config — NOT the anon key). Insert into `events`: `{ user_id, session_id, event_type: hook_event_name, tool_name, payload: truncatedPayload, idempotency_key }`. Do NOT `await` a response body — fire off the insert and continue (use `.then()` for error logging only, do not block the main response path).
- **Step 6 — Evaluate active match rules:** Fetch active quests for this user via `supabase.from('quests').select('id, match_rule, xp_reward').eq('is_active', true)` combined with a join on `quest_progress` to exclude already-completed quests. For each quest, call `evaluateMatchRule(quest.match_rule, eventPayload)` from `@specops/quest-engine`. If the rule has `min_count > 1`, use `redis.hincrby('session:{session_id}', quest.id, 1)` (§5.2 session hash, 24h TTL) and compare the returned count to `min_count` before marking completion.
- **Step 7 — Award XP and update leaderboard:** For each newly completed quest: (1) `redis.incrby('xp:user:{user_id}', quest.xp_reward)` as an in-flight counter; (2) insert into `xp_ledger` via service role client; (3) `redis.zadd('lb:global:weekly', { score: xp_reward, member: user_id }, { incr: true })` and same for `lb:global:alltime` (§5.2). Update `quest_progress` row to `status: 'completed'` with `completed_at: NOW()` and `evidence: { event_id }`.
- **Return 200:** `Response.json({ accepted: true, request_id: crypto.randomUUID() })`. The `request_id` is a fresh UUID — not the idempotency key — so callers can correlate logs.
- Create `apps/web/app/api/v1/events/route.test.ts` as a Vitest unit test file. Mock `@supabase/ssr`, `@upstash/redis`, and `@upstash/ratelimit` using `vi.mock()`. Five test scenarios: (1) valid event → 200 `{ accepted: true }`; (2) duplicate idempotency key → 200 `{ accepted: false }`; (3) rate limit exceeded → 429; (4) invalid JWT → 401; (5) malformed body (missing required field) → 400.

## Files to create / modify

| Path                                       | Action | Notes                                                                                                              |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------ |
| `apps/web/app/api/v1/events/route.ts`      | create | Edge Function, full §8.4 sequence, `export const runtime = 'edge'`                                                 |
| `apps/web/app/api/v1/events/route.test.ts` | create | Vitest unit tests, all 5 scenarios, mocked deps                                                                    |
| `apps/web/package.json`                    | edit   | Add runtime deps: `@upstash/redis`, `@upstash/ratelimit`, `@supabase/ssr`, `@specops/quest-engine` (workspace ref) |

## Verification

```bash
# Typecheck clean
pnpm --filter @specops/web typecheck

# Unit tests pass
pnpm vitest run apps/web/app/api/v1/events/route.test.ts

# Edge runtime declaration present
grep "export const runtime = 'edge'" apps/web/app/api/v1/events/route.ts || echo "FAIL: missing edge runtime"

# No hardcoded service role key
grep -n "SUPABASE_SERVICE_ROLE_KEY" apps/web/app/api/v1/events/route.ts
# Should show env var ACCESS only (process.env.SUPABASE_SERVICE_ROLE_KEY), never a literal string value

# Confirm idempotency-key header is enforced
curl -s -X POST http://localhost:3000/api/v1/events \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{"session_id":"00000000-0000-0000-0000-000000000001","hook_event_name":"PostToolUse","tool_name":"Edit"}' \
  | jq .
# Expected: {"error":"Bad Request"} with status 400 (missing Idempotency-Key)

# Integration: valid request with local Supabase + Upstash
curl -s -X POST http://localhost:3000/api/v1/events \
  -H "Authorization: Bearer $VALID_TEST_JWT" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"session_id":"00000000-0000-0000-0000-000000000001","hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"/tmp/test.ts"}}' \
  | jq .
# Expected: {"accepted":true,"request_id":"<uuid>"}
```

## Notes / Open questions

- The Supabase service role key is needed for the `events` INSERT (RLS policy requires service role bypass per §5.1 `WITH CHECK (false)` policy). On Vercel Edge Functions, env vars set in the Vercel dashboard ARE available via `process.env` — this is different from the restriction that applies to `fetch`-only Edge contexts in some frameworks. Verify with `console.log(typeof process.env.SUPABASE_SERVICE_ROLE_KEY)` during local dev.
- Fire-and-forget for the events INSERT (step 5): do not block the response path on the insert's confirmation. Use a pattern like `const insertPromise = supabaseAdmin.from('events').insert(...); insertPromise.catch(err => console.error('event insert failed', err))` — the response is sent immediately after. This keeps P95 under 100ms even if Supabase is slow on a given request.
- The `session:{session_id}` Redis hash (§5.2, 24h TTL) is used for `min_count` tracking — key: quest ID, value: match count for this session. This prevents double-crediting a `min_count: 1` quest if the same session sends two identical events. The `events_idem_idx` unique index on `(idempotency_key, ingested_at)` handles exact duplicates; the session counter handles "same tool called twice legitimately."
- Payload truncation per §10.2: `JSON.stringify(tool_input).slice(0, 1024)`. If the truncated string is no longer valid JSON, wrap in `{ truncated: true, raw: str.slice(0, 1024) }` before `JSON.parse`. Always store valid JSONB.
- §13 Q5 (devcontainer support): `session_id` comes from `CLAUDE_SESSION_ID` env var in the hook payload. If the value is absent (devcontainer edge case), use `req.headers.get('x-forwarded-for')` + timestamp as a fallback session identifier and log a warning. Do not fail the request.
- 5xx responses from this handler must not trigger automatic retries in the hook config (§8.3 fire-and-forget). The offline buffer (`~/.pet-trainer/buffer.jsonl`) + `pet sync` is the retry path. Add a comment in the handler explaining why it does not set `Retry-After` headers.
