---
id: 03-02-dashboard
sprint: 3
order: 2
status: not-started
spec_refs: ['§9.1', '§9.2', '§5.1', '§5.2', '§8.2', '§7.3']
depends_on: [01-04-events-edge-handler, 01-05-auth-supabase-github]
deliverables:
  - apps/web/app/dashboard/page.tsx
  - apps/web/app/dashboard/xp-chart.tsx
  - apps/web/app/dashboard/pet-card.tsx
  - apps/web/lib/data/pet.ts
---

## Goal

Build the authenticated `/dashboard` page that renders the user's pet stats, active quests, and a 7-day XP timeline — the primary retention surface users return to after completing quests.

## Context

SPEC.md §9.1 designates `/dashboard` as an RSC + client hybrid: server-rendered for initial data, client components only for the XP chart (Recharts) and the "Feed your pet" interactive button. §9.2 mandates `@supabase/ssr` (not the deprecated `@supabase/auth-helpers`) for server-side auth. §5.1 defines the `pets` table columns that drive the stats display, and §7.3 defines the five evolution stages (Egg → Hatchling → Apprentice → Operator → Architect) with XP thresholds and emoji sprites used in the pet card. The dashboard depends on `01-04` (events Edge handler populates `xp_ledger` and `pets`) and `01-05` (auth, without which we cannot resolve `auth.uid()` server-side). This step must ship before `04-03` (E2E Playwright) since the dashboard is one of the three critical E2E flows.

## Implementation outline

- In `apps/web/app/dashboard/page.tsx` (RSC): call `createServerClient()` from `@supabase/ssr` using the request cookies to get the authenticated Supabase client. If `session` is null, call `redirect('/auth')` from `next/navigation`. Fetch pet data by calling `getPetForUser(userId)` from `apps/web/lib/data/pet.ts`. Fetch XP ledger rows for the last 7 days (group by day, sum delta) for the chart. Render `<PetCard pet={pet} />` and `<XpChart data={xpByDay} />` with data as props.
- Add `export const metadata` with `robots: { index: false, follow: false }` to prevent dashboard indexing by search engines (§9.1 notes this must not be indexed).
- Create `apps/web/lib/data/pet.ts` with two exported async functions: `getPetForUser(userId: string): Promise<Pet | null>` — reads from `pets` table using the Supabase server client initialized with the service role key (bypasses RLS since we are already auth-checked in the RSC layer, and the service role is only used in Node Functions per §10.4); `getXpLedgerLast7Days(userId: string): Promise<{ date: string; xp: number }[]>` — queries `xp_ledger` WHERE `user_id = userId AND created_at >= NOW() - INTERVAL '7 days'`, groups by `DATE(created_at)`, sums `delta`. Both functions must return typed values using `Pet` and `XpLedger` from `@specops/domain`.
- Create `apps/web/app/dashboard/pet-card.tsx` as a client component (`"use client"`): renders the pet's SVG sprite for its current stage (inline SVG per §9.2 — "pixel art: SVG inline"). Map `pet.stage` to the emoji from §7.3: 1→🥚, 2→👶, 3→🧒, 4→🥷, 5→🧙. Render pet name + stage label. Render three stat bars for `hunger`, `energy`, `happiness` using shadcn `Progress` component with colour coding (hunger: amber, energy: blue, happiness: green). Render XP total and a progress ring showing percentage toward the next evolution threshold (thresholds: 0/200/800/2500/6000 from §7.3). Render the active quests list: iterate `in_progress` quests passed as a prop, show quest title + category badge + a mini progress indicator. Render a "Feed your pet" `<Button>` that fires a client-side `fetch('POST /api/v1/pet/me/feed')` using the session JWT from Zustand store or a `useSession` hook wrapping `@supabase/ssr`'s browser client.
- Create `apps/web/app/dashboard/xp-chart.tsx` as a client component (`"use client"`): imports `LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer` from `recharts`. Accepts `data: { date: string; xp: number }[]` as prop. If `data.length === 0`, render a centered `<p>No XP yet — complete a quest to start earning!</p>` empty state. Otherwise render `<ResponsiveContainer width="100%" height={200}>` with a line chart. Use Tailwind color tokens for the line stroke so the chart respects dark mode.
- The active quests list in the dashboard needs quest data from `quest_progress` WHERE `user_id = userId AND status = 'in_progress'`. Add a third fetcher function `getActiveQuests(userId: string)` to `apps/web/lib/data/pet.ts` that joins `quest_progress` with `quests` to return `{ quest_id, title, category, started_at }[]`.
- Wire up the "Feed your pet" button: `POST /api/v1/pet/me/feed` is defined in §8.2 as a Node Function. The button handler must read the JWT from the Supabase browser client session (`supabase.auth.getSession()`), attach it as `Authorization: Bearer <jwt>`, and show a toast (shadcn `toast`) on success or error. On success, invalidate the pet card data using Tanstack Query (`queryClient.invalidateQueries(['pet', userId])`).
- Wrap the server-fetched pet and XP data in a Tanstack Query initial data pattern: the RSC fetches data and passes it to a client boundary as `initialData`, so Tanstack Query hydrates from the server snapshot and only re-fetches in the background when the 30-second `pet:cache:{user_id}` Redis TTL expires (§5.2).

## Files to create / modify

| Path                                  | Action | Notes                                                                                                                                               |
| ------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/dashboard/page.tsx`     | create | RSC; auth guard via `@supabase/ssr`; fetches pet + XP + active quests server-side; passes to client components as props; `metadata.robots: noindex` |
| `apps/web/app/dashboard/pet-card.tsx` | create | `"use client"` — pet sprite, stat bars (shadcn Progress), XP ring, active quests list, Feed button with POST to `/api/v1/pet/me/feed`               |
| `apps/web/app/dashboard/xp-chart.tsx` | create | `"use client"` — Recharts LineChart with empty state; accepts `data` prop                                                                           |
| `apps/web/lib/data/pet.ts`            | create | Server-side data fetchers: `getPetForUser`, `getXpLedgerLast7Days`, `getActiveQuests`; uses Supabase server client                                  |

## Verification

```bash
# Typecheck must pass
pnpm --filter @specops/web typecheck

# Unauthenticated request to /dashboard must redirect to /auth
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard | grep -q "307\|302\|308" \
  && echo "OK: redirect" || echo "FAIL: no redirect for unauth user"

# robots noindex meta tag present in dashboard HTML
curl -s http://localhost:3000/dashboard | grep -q 'noindex' \
  && echo "OK" || echo "WARN: check auth redirect prevents HTML render"

# With seeded user session cookie: dashboard renders pet data
# (run after seeding a test user + pet in supabase/seed.sql)
# Manually verify in browser after supabase db reset && pnpm dev

# XP chart renders empty state when no XP ledger rows exist
# Manually verify in browser: new user with 0 xp_ledger rows shows "No XP yet" message

# No z.any() or untyped returns in data fetchers
grep -n "any" apps/web/lib/data/pet.ts && echo "WARN: untyped usage" || echo "OK"

# Recharts and @supabase/ssr installed in apps/web
cat apps/web/package.json | grep -E '"recharts"|"@supabase/ssr"' | wc -l | grep -q "2" \
  && echo "OK: both deps present" || echo "FAIL: missing dep"

# Feed button: verify /api/v1/pet/me/feed endpoint exists (implemented in step 01-04 or 02-03)
# If not yet implemented, dashboard must gracefully handle 404 with an error toast
```

## Notes / Open questions

- Use `@supabase/ssr`, not `@supabase/auth-helpers` — the latter is deprecated and does not support Next.js 15 App Router correctly. The `createServerClient` import path is `@supabase/ssr`.
- The service role key used in `apps/web/lib/data/pet.ts` must only be accessed server-side. Never import or reference `SUPABASE_SERVICE_ROLE_KEY` in any file that contains `"use client"`. Next.js will throw a build error if a server-only env var is referenced in a client component — this is the correct behavior; do not work around it.
- The Recharts `LineChart` is a client component because it uses DOM APIs. It must be in a separate file with `"use client"` and receive data as a serializable prop (plain `{ date: string; xp: number }[]`), not a Supabase query result object.
- §5.2 documents `pet:cache:{user_id}` as a Redis Hash with 30s TTL. The `getPetForUser` function in `lib/data/pet.ts` should implement a read-through cache pattern: check Redis first (`hgetall pet:cache:{user_id}`), fall through to Postgres on miss, write back to Redis on hit. This is optional in the first implementation pass — add a TODO comment if skipping for now.
- The XP progress ring in `<PetCard />` should display the percentage toward the next evolution threshold, not toward the maximum XP. Example: if the user has 500 XP (stage 3, threshold 800), the ring should show 500/800 = 62.5%. Use the thresholds array from §7.3: `[0, 200, 800, 2500, 6000]`.
- The dashboard `page.tsx` must NOT be inside the `(marketing)` route group, as it uses a different layout (app shell with sidebar or top nav for authenticated users). If a separate authenticated layout is needed, create `apps/web/app/(app)/layout.tsx` as a group — verify against the monorepo folder structure in §14.A.
- Active quests query joins `quest_progress` with `quests` — both tables exist after step 01-02. In dev, the seed must have at least one `in_progress` quest for the list to render non-empty. Add a test user seed row in `supabase/seed.sql` during this step.
