---
id: 03-03-leaderboard
sprint: 3
order: 3
status: not-started
spec_refs: ['§9.1', '§5.2', '§8.2', '§4.2']
depends_on: [01-04-events-edge-handler]
deliverables:
  - apps/web/app/leaderboard/page.tsx
  - apps/web/app/leaderboard/leaderboard-table.tsx
  - apps/web/app/api/v1/leaderboard/route.ts
---

## Goal

Build the public `/leaderboard` page that reads the top-100 weekly and all-time rankings from Upstash Redis ZSETs and renders them as a tabbed table, and the companion Edge API route that serves the same data to the CLI.

## Context

SPEC.md §9.1 designates `/leaderboard` as an RSC route. §5.2 defines the two ZSETs: `lb:global:weekly` (TTL 7 days, resets Sunday 00:00 UTC) and `lb:global:alltime` (no TTL). Score in both ZSETs equals total XP awarded. §8.2 lists `GET /leaderboard?period=weekly` as an Edge Function, meaning the API route must run on the Vercel Edge Runtime. The leaderboard is public (no auth required) and should revalidate every 60 seconds to balance freshness and Redis read costs. This step depends only on `01-04` (which populates the ZSETs on quest completion via `ZADD`), not on auth, making it potentially parallelizable with `03-02` in a team setup.

## Implementation outline

- Create `apps/web/app/leaderboard/page.tsx` as an RSC with `export const revalidate = 60` (Next.js ISR — revalidates every 60 seconds on request). The page reads both ZSETs in parallel using the Upstash Redis HTTP SDK (`@upstash/redis`): `redis.zrange('lb:global:weekly', 0, 99, { rev: true, withScores: true })` and `redis.zrange('lb:global:alltime', 0, 99, { rev: true, withScores: true })`. Note: `zrange` with `rev: true` returns highest-score-first (descending by XP). The raw result is an array of `[member, score]` pairs where `member` is the `user_id` UUID. Enrich each entry by batch-fetching `username` and `avatar_url` from the `profiles` table using the Supabase service client — use a single `IN (user_ids)` query, not N+1 queries.
- Render a shadcn `<Tabs>` component with two tabs: "This week" and "All time". Tab switching must be client-side with no full page reload — use URL search params (`?period=weekly` / `?period=alltime`) so the URL is shareable and the browser back button works. Read the active tab from `searchParams` in the RSC and pass the correct dataset to `<LeaderboardTable />`.
- If the user is authenticated (check via `@supabase/ssr` server client), highlight their own row in `<LeaderboardTable />` with a different background color (e.g. Tailwind `bg-primary/10`). Pass the current user's `user_id` as a prop to `<LeaderboardTable />` for the comparison.
- Create `apps/web/app/leaderboard/leaderboard-table.tsx` as a server component (no interactivity needed): renders a `<table>` with columns: rank (#1, #2, etc.), avatar (`<img>` from `avatar_url` with `width=32 height=32 rounded-full`), username (link to `/u/[username]`), XP score (formatted with `toLocaleString()`), pet stage emoji (from `pets` table or passed as enriched data). If the `entries` array is empty (leaderboard not yet populated), render an empty state: "No one on the board yet — complete quests to be first!".
- Create `apps/web/app/api/v1/leaderboard/route.ts` as an Edge Function: `export const runtime = 'edge'`. Handle `GET` requests with a `?period=weekly|alltime` query param (default: `weekly`). Read the corresponding ZSET from Upstash Redis, enrich with profile data from Supabase, return a JSON response: `{ period: 'weekly', updated_at: ISO8601, entries: [{ rank, user_id, username, avatar_url, xp, stage }] }`. Set `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` on the response header.
- Add a weekly reset cron job: create `apps/web/app/api/v1/leaderboard/reset/route.ts` as a Node Function (not Edge — requires Redis `DEL` which is destructive and benefits from logging). The route accepts `GET` with a `Authorization: Bearer $CRON_SECRET` header check (validate against `process.env.CRON_SECRET`). On success: `redis.del('lb:global:weekly')`. Add to `vercel.json`: `{ "crons": [{ "path": "/api/v1/leaderboard/reset", "schedule": "0 0 * * 0" }] }` (Sunday 00:00 UTC).
- Add `CRON_SECRET` to the Vercel env vars documented list (add a comment in `.env.example`). The secret must be at least 32 characters, generated with `openssl rand -hex 32`.
- In `supabase/seed.sql`, add 5 test user profiles with varying XP levels (e.g. 6200, 3100, 1500, 400, 80 XP) and populate both Redis ZSETs in a seed script comment, with instructions to run `redis-cli ZADD lb:global:weekly ...` for local dev (Upstash provides a local-compatible REST API via environment variables).

## Files to create / modify

| Path                                             | Action | Notes                                                                                                                                                  |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/app/leaderboard/page.tsx`              | create | RSC; `revalidate = 60`; reads both ZSETs from Upstash; enriches with profile data; renders shadcn Tabs + LeaderboardTable; highlights current user row |
| `apps/web/app/leaderboard/leaderboard-table.tsx` | create | Server component; `<table>` with rank/avatar/username/XP/stage columns; empty state; links `/u/[username]`; highlights `currentUserId` row             |
| `apps/web/app/api/v1/leaderboard/route.ts`       | create | Edge GET; `?period=weekly\|alltime`; reads ZSET, enriches, returns JSON; `Cache-Control: s-maxage=60`                                                  |
| `apps/web/app/api/v1/leaderboard/reset/route.ts` | create | Node GET; bearer token auth via `CRON_SECRET`; runs `redis.del('lb:global:weekly')`; invoked by Vercel Cron                                            |
| `vercel.json`                                    | edit   | Add cron entry: `{ "path": "/api/v1/leaderboard/reset", "schedule": "0 0 * * 0" }`                                                                     |
| `supabase/seed.sql`                              | edit   | Add 5 test profiles with varying XP; add comment block with Redis ZADD commands for local dev                                                          |
| `.env.example`                                   | edit   | Add `CRON_SECRET=` entry with generation instructions                                                                                                  |

## Verification

```bash
# Typecheck
pnpm --filter @specops/web typecheck

# API route returns valid JSON (with seeded data)
curl -s "http://localhost:3000/api/v1/leaderboard?period=weekly" | jq '.entries | length'
# Expected: >= 1 (seeded entries)

curl -s "http://localhost:3000/api/v1/leaderboard?period=alltime" | jq '.period'
# Expected: "alltime"

# Verify Cache-Control header on API response
curl -sI "http://localhost:3000/api/v1/leaderboard?period=weekly" | grep -i cache-control
# Expected: public, s-maxage=60

# Weekly reset route is protected: unauthenticated request must return 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/leaderboard/reset | grep -q "401" \
  && echo "OK: protected" || echo "FAIL: unprotected reset endpoint"

# Weekly reset route: authenticated request succeeds
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/v1/leaderboard/reset | grep -q "200" \
  && echo "OK" || echo "FAIL"

# Leaderboard page renders without auth
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/leaderboard | grep -q "200" \
  && echo "OK: public" || echo "FAIL"

# Verify revalidate config is present
grep "revalidate" apps/web/app/leaderboard/page.tsx | grep -q "60" \
  && echo "OK" || echo "FAIL: revalidate not set to 60"

# Verify vercel.json cron entry exists
cat vercel.json | jq '.crons[] | select(.path == "/api/v1/leaderboard/reset")' | grep -q "schedule" \
  && echo "OK" || echo "FAIL: cron entry missing"
```

## Notes / Open questions

- `@upstash/redis` must be added to `apps/web/package.json`. The Upstash HTTP SDK is Edge-compatible (uses `fetch` internally, not TCP sockets), which is why §3.1 chose Upstash over standard Redis.
- Redis ZSET keys from §5.2: `lb:global:weekly` (TTL 7d, set by `ZADD` in `/events` handler) and `lb:global:alltime` (no TTL). The `ZADD ... INCR` flag increments an existing member's score rather than overwriting — use `ZINCRBY` from the `@upstash/redis` client when awarding XP so concurrent requests are safe.
- The N+1 problem: top-100 entries each need a profile lookup. Solve with a single Supabase `select().in('id', userIds)` query that returns all 100 profiles in one round trip. The result is then joined in memory by `user_id`.
- The `reset` route deletes `lb:global:weekly` entirely (atomic Redis `DEL`) rather than zeroing scores, because deleting and re-seeding is simpler and the ZSET is rebuilt by the `/events` handler as new XP is awarded post-reset. There is no snapshot before deletion in MVP — add `leaderboard_snapshots` Postgres persistence as a future enhancement (§4.2 mentions it as the slice's persistent layer).
- Vercel Cron schedules are UTC. `0 0 * * 0` means midnight Sunday UTC. Document this in `docs/runbooks/deploy.md`.
- Avatar images from GitHub (`avatar_url` in `profiles`) are served by `avatars.githubusercontent.com`. Add this domain to `next.config.js` under `images.remotePatterns` to allow `<Image>` optimization. For the leaderboard table, using a plain `<img>` with `width`/`height` attributes is acceptable to avoid the Next.js Image component complexity.
- The leaderboard does not require auth to view — this is intentional per §9.1. The current user highlight is a progressive enhancement: if not authenticated, all rows render identically.
- §13 has no open questions specifically about the leaderboard, but the weekly reset timing (Sunday 00:00 UTC) was not explicitly discussed in SPEC.md — it is a reasonable convention. If a different reset day is needed, it is a one-line change to the cron schedule.
