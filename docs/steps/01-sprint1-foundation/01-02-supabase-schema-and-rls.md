---
id: 01-02-supabase-schema-and-rls
sprint: 1
order: 2
status: not-started
spec_refs: ['§5.1', '§5.2', '§10.3']
depends_on: [00-03-supabase-init, 01-01-domain-package]
deliverables:
  - supabase/migrations/20260429000001_schema.sql
  - supabase/migrations/20260429000002_rls.sql
  - supabase/migrations/20260429000003_events_partition.sql
  - supabase/seed.sql
  - packages/domain/src/database.types.ts
acceptance:
  - supabase db reset applies all three migrations without errors (exit 0)
  - supabase db diff shows clean state (no pending changes)
  - SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name returns exactly profiles, pets, quests, quest_progress, events, xp_ledger, leaderboard_snapshots
  - SELECT relrowsecurity FROM pg_class WHERE relname = 'pets' returns true for all user-data tables
  - supabase gen types typescript --local writes packages/domain/src/database.types.ts without errors
---

## Goal

Write the complete Postgres schema, RLS policies, and initial partition setup from §5.1 as three ordered migration files so that `supabase db reset` produces a fully typed, secured database ready for event ingestion and pet state management.

## Context

SPEC.md §5.1 is the authoritative Postgres schema — copy SQL from there directly rather than redesigning. The schema is the foundation for every slice: `telemetry` (events table), `pet` (pets table), `quest` (quests + quest_progress), `xp` (xp_ledger), `leaderboard` (leaderboard_snapshots). The split into three migration files (schema → RLS → partitions) follows the Supabase convention of ordered, idempotent migrations and allows the RLS step to depend on tables existing without mixing DDL concerns. The generated `database.types.ts` is the bridge between Postgres column types and the Zod schemas in `@specops/domain` — both must agree; generated types win on column nullability.

## Implementation outline

- Create `supabase/migrations/20260429000001_schema.sql` with `CREATE TABLE` statements for all 7 tables in dependency order (profiles → pets → quests → quest_progress → events → xp_ledger → leaderboard_snapshots). Copy column definitions and constraints verbatim from §5.1. Add `leaderboard_snapshots` table: `id BIGSERIAL PRIMARY KEY`, `period TEXT NOT NULL` (e.g. `'2026-W18'`), `snapshot JSONB NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. Do NOT include `PARTITION BY` on events here — that is migration 3.
- The `events` table in migration 1 must be declared with `PARTITION BY RANGE (ingested_at)` on its `CREATE TABLE` statement (§5.1) and must include `CREATE UNIQUE INDEX events_idem_idx ON public.events (idempotency_key, ingested_at)` — the idempotency check in §8.4 step 3 relies on this index for correctness and performance.
- Create `supabase/migrations/20260429000002_rls.sql` that: (1) runs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for all user-data tables (profiles, pets, quest_progress, events, xp_ledger — NOT quests or leaderboard_snapshots, which are public catalog / append-only system data), (2) creates all 6 policies from §5.1 verbatim. The `events` INSERT policy must use `WITH CHECK (false)` — only service_role JWT bypasses RLS for inserts (§10.4).
- Create `supabase/migrations/20260429000003_events_partition.sql` that creates two concrete monthly partitions: `events_2026_04` for `ingested_at >= '2026-04-01' AND ingested_at < '2026-05-01'` and `events_2026_05` for May. Wrap each `CREATE TABLE IF NOT EXISTS` in a `DO $$ BEGIN ... EXCEPTION WHEN duplicate_table THEN NULL; END $$` block so the migration is idempotent in CI (running `supabase db reset` multiple times must not error).
- Update `supabase/seed.sql`: add a comment block `-- Quest seeds (added by step 01-07)` as a placeholder so step 01-07 has a clear insertion point. Do not add actual quest INSERTs here — that is step 01-07's responsibility.
- After migrations pass, run `supabase gen types typescript --local > packages/domain/src/database.types.ts` and commit the result. This file is auto-generated; add a `// @generated` header comment and a note that it must be regenerated whenever migrations change.
- Add a Makefile or `package.json` script in the repo root (under the `db:types` key) that re-runs the `supabase gen types` command so any developer can regenerate types without memorizing the full command.

## Files to create / modify

| Path                                                      | Action | Notes                                                           |
| --------------------------------------------------------- | ------ | --------------------------------------------------------------- |
| `supabase/migrations/20260429000001_schema.sql`           | create | All 7 tables, indexes, partitioning declaration for events      |
| `supabase/migrations/20260429000002_rls.sql`              | create | `ENABLE ROW LEVEL SECURITY` + 6 policies from §5.1              |
| `supabase/migrations/20260429000003_events_partition.sql` | create | Idempotent monthly partition creation for 2026-04 and 2026-05   |
| `supabase/seed.sql`                                       | edit   | Add placeholder comment for quest seeds (step 01-07 fills this) |
| `packages/domain/src/database.types.ts`                   | create | Auto-generated via `supabase gen types typescript --local`      |
| `package.json` (root)                                     | edit   | Add `"db:types"` script under scripts                           |

## Verification

```bash
# Apply migrations from scratch
supabase db reset

# Confirm all 7 tables exist
psql "$DATABASE_URL" -c "
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name;
"
# Expected rows: events, leaderboard_snapshots, pets, profiles, quest_progress, quests, xp_ledger

# Confirm RLS is enabled on user-data tables
psql "$DATABASE_URL" -c "
  SELECT relname, relrowsecurity
  FROM pg_class
  WHERE relname IN ('profiles','pets','quest_progress','events','xp_ledger')
  ORDER BY relname;
"
# All relrowsecurity values must be true (t)

# Confirm events INSERT policy blocks direct inserts (anon role)
psql "$DATABASE_URL" -c "
  INSERT INTO public.events (user_id, session_id, event_type, payload, idempotency_key)
  VALUES (gen_random_uuid(), 'sess', 'PostToolUse', '{}', 'test-idem-key');
"
# Expected: ERROR  new row violates row-level security policy for table "events"

# Confirm partition exists
psql "$DATABASE_URL" -c "
  SELECT inhrelid::regclass AS partition
  FROM pg_inherits
  WHERE inhparent = 'public.events'::regclass;
"
# Expected: events_2026_04, events_2026_05

# Generate types and confirm file was written
supabase gen types typescript --local > packages/domain/src/database.types.ts
head -5 packages/domain/src/database.types.ts
# Expected: // @generated ... export type Json = ...

# Confirm diff is clean
supabase db diff
# Expected: No changes
```

## Notes / Open questions

- pgTAP tests for every RLS policy are NOT in scope for this step — they land in step 04-02. This step only creates the policies. CI will not enforce pgTAP green until Sprint 4.
- The `events` table is partitioned by RANGE on `ingested_at`. All queries against `events` must include `ingested_at` in the WHERE clause or Postgres will do a full partition scan. Document this constraint in a code comment inside the migration and in the route handler (step 01-04).
- `leaderboard_snapshots` is not in §5.1 literally but is described in §4.2 as the persistence layer for the `leaderboard` slice. Adding it here avoids a mid-sprint migration and keeps the schema coherent.
- `database.types.ts` is committed to git even though it is generated — this mirrors the Supabase convention and avoids requiring every dev to have a local Supabase instance before they can typecheck. Add it to `.prettierignore` and `.eslintignore` to prevent lint noise on generated code.
- §10.4: Supabase service role key is available only in Node Function environment variables (Vercel), NOT in Edge Functions. The events insert in step 01-04 must happen via the Supabase client initialized with the service role key in a way that does not expose the key to Edge context — review the Supabase Edge-compatible client docs before implementing step 01-04.
- When adding new monthly partitions in production, use a cron job or Supabase pg_cron extension to create the next month's partition before the first of the month. Document this in `docs/runbooks/deploy.md`.
