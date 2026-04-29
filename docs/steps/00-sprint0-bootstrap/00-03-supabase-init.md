---
id: 00-03-supabase-init
sprint: 0
order: 3
status: in-progress
spec_refs: ['§5.1', '§3.1']
depends_on: ['00-01-monorepo-scaffold']
deliverables:
  - supabase/config.toml
  - supabase/migrations/20260429000000_init.sql
  - supabase/.gitignore
  - supabase/seed.sql
acceptance:
  - supabase start completes without errors and prints Studio URL
  - supabase db diff shows no schema drift (clean output)
  - supabase status prints API URL, DB URL, and Studio URL
---

## Goal

Initialize the local Supabase project with a baseline config (GitHub Auth enabled, correct site URL) and an empty migration so that the local Postgres + Auth + Studio stack can be verified before any schema work begins in step 01-02.

## Context

SPEC.md §5.1 defines the full Postgres schema (profiles, pets, quests, quest_progress, events, xp_ledger) with RLS policies. That schema is not created in this step — it lands entirely in step 01-02. This step only establishes the local Supabase CLI toolchain, the `config.toml`, and a baseline migration so that `supabase start` works and the team can confirm local infrastructure before writing a single table. Step 00-04 (Vercel + CI) depends on this step being green because the deploy pipeline includes `supabase db push` (§10.3, deploy.yml step 1).

## Implementation outline

- Install the Supabase CLI globally if not already present: `brew install supabase/tap/supabase` (macOS) or via the official install script for Linux — this is a dev machine dependency, not a `package.json` devDependency, because Supabase CLI is incompatible with pnpm hoisting (§3.1 note: Supabase CLI must be installed globally).
- Run `supabase init` from the repo root to generate the `supabase/` directory skeleton; then edit `supabase/config.toml` to set `project_id = "pet-trainer"`, `[auth] site_url = "http://localhost:3000"`, enable the GitHub OAuth provider (`[auth.external.github] enabled = true`), and confirm `[api] port = 54321` and `[db] port = 54322` (Supabase CLI defaults — confirm no port conflicts in the dev environment).
- Set `[auth.external.github] client_id = "env(GITHUB_CLIENT_ID)"` and `client_secret = "env(GITHUB_CLIENT_SECRET)"` in `config.toml` — never hardcode credentials; values are read from environment at `supabase start` time per §10.4 secrets policy. Document required env vars in `.env.example` (step 00-04).
- Create `supabase/migrations/20260429000000_init.sql` containing only `SET search_path TO public;` — this is a zero-schema baseline migration that proves the migration pipeline works end-to-end without creating any tables yet. All tables defined in §5.1 land in step 01-02 migration `20260429000001_schema.sql`.
- Create `supabase/seed.sql` as an empty file with commented section headers: `-- profiles`, `-- pets`, `-- quests`, `-- quest_progress`. Quest seed data (5 basics quests from §7.2) is populated in step 01-07; this placeholder ensures `supabase db reset` does not error on a missing seed file.
- Create `supabase/.gitignore` with entries for `.branches/` and `.temp/` — these directories are created by `supabase start` and contain local state that must not be committed.
- Update the root `.gitignore` to include `supabase/.branches` and `supabase/.temp` as additional lines (belt-and-suspenders alongside the supabase-local `.gitignore`).

## Files to create / modify

| Path                                          | Action | Notes                                                                   |
| --------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `supabase/config.toml`                        | create | project_id: pet-trainer, GitHub OAuth enabled, site_url: localhost:3000 |
| `supabase/migrations/20260429000000_init.sql` | create | Baseline: SET search_path TO public only                                |
| `supabase/.gitignore`                         | create | Ignores .branches/ and .temp/                                           |
| `supabase/seed.sql`                           | create | Empty skeleton with commented section headers                           |
| `.gitignore`                                  | edit   | Add supabase/.branches and supabase/.temp entries                       |

## Verification

```bash
# Bring up local Supabase stack (Postgres, Auth, Studio, Edge Functions emulator)
supabase start

# Confirm no schema drift vs. migrations
supabase db diff
# Expected: empty output (no diff)

# Confirm all services are running and URLs are printed
supabase status
# Expected output includes: API URL, GraphQL URL, DB URL, Studio URL, Inbucket URL

# Verify GitHub auth provider is listed as enabled
supabase status | grep -i github
# Expected: github: enabled

# Confirm migration was applied
supabase db diff --schema public
# Expected: empty output (baseline migration sets search_path only, no tables)

# Confirm Studio is accessible
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:54323
# Expected: 200
```

## Notes / Open questions

- The Supabase CLI must be installed globally (`brew install supabase/tap/supabase` or equivalent). It is not listed in `package.json` devDependencies because the Supabase CLI is a standalone binary and pnpm cannot manage it. Document the install prerequisite in the repo README (or in the CLAUDE.md project instructions).
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` for local dev: create a GitHub OAuth App at `https://github.com/settings/developers` with callback URL `http://localhost:3000/auth/callback`. Values go in a local `.env` file (not committed). The `.env.example` in step 00-04 lists these var names with empty values.
- Full schema (all six tables + RLS policies from §5.1) is intentionally deferred to step 01-02. This step only validates the local toolchain. Running `supabase db push` against production without the full schema will produce a no-op (only `search_path` set) — this is expected behavior at Sprint 0.
- SPEC §5.1 requires RLS on every user-data table. pgTAP tests to verify RLS policies are set up in step 04-02 and activated in the CI pipeline via `if: false` placeholder in step 00-04.
- SPEC §13 OQ-5: "Support for Claude Code running inside devcontainers." If the dev environment is a devcontainer, map the Supabase CLI ports in `devcontainer.json` (`54321`, `54322`, `54323`, `54324`). This does not block Sprint 0.
- Do not run `supabase link` in this step. Linking to the remote Supabase project (production) happens as part of the Vercel + CI setup in step 00-04 and requires a `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` that are not yet provisioned.
