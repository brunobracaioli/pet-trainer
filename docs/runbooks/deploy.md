# Deploy runbook

> Operational reference for promoting pet-trainer changes to production.

## Secrets inventory

Every secret below must be set as a Vercel environment variable (Project Settings → Environment Variables) **and** as a GitHub Actions repository secret (Settings → Secrets → Actions). Local development uses `.env.local` (never committed).

| Variable                         | Where used                                                                    | Source                                          |
| -------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| `SUPABASE_PROJECT_REF`           | `.github/workflows/deploy.yml` (supabase db push)                             | Supabase project dashboard URL                  |
| `SUPABASE_DB_PASSWORD`           | `.github/workflows/deploy.yml`                                                | Supabase project — Database → Connection string |
| `NEXT_PUBLIC_SUPABASE_URL`       | apps/web (browser + edge)                                                     | Supabase project — API → Project URL            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | apps/web (browser + edge)                                                     | Supabase project — API → anon public key        |
| `SUPABASE_SERVICE_ROLE_KEY`      | apps/web Node functions only — bypasses RLS for `events` insert (§3.3, §10.4) | Supabase project — API → service_role key       |
| `SUPABASE_AUTH_GITHUB_CLIENT_ID` | `supabase/config.toml` `[auth.external.github]`                               | github.com/settings/developers — OAuth App      |
| `SUPABASE_AUTH_GITHUB_SECRET`    | `supabase/config.toml` `[auth.external.github]`                               | github.com/settings/developers — OAuth App      |
| `UPSTASH_REDIS_REST_URL`         | apps/web (rate-limit, leaderboard, idempotency)                               | Upstash console — REST API                      |
| `UPSTASH_REDIS_REST_TOKEN`       | apps/web (rate-limit, leaderboard, idempotency)                               | Upstash console — REST API                      |
| `VERCEL_TOKEN`                   | `.github/workflows/{ci,deploy}.yml`                                           | vercel.com/account/tokens                       |
| `VERCEL_ORG_ID`                  | CI/CD                                                                         | `.vercel/project.json` (after `vercel link`)    |
| `VERCEL_PROJECT_ID`              | CI/CD                                                                         | `.vercel/project.json` (after `vercel link`)    |

## Rotation policy

Per SPEC.md §10.4, secrets are rotated **quarterly** (at minimum). The Supabase service role key and Upstash Redis token are the highest-value targets — rotate them on a 30-day cadence in addition to quarterly.

When rotating:

1. Generate the new value at the source (Supabase, Upstash, GitHub OAuth, Vercel).
2. Set the new value in Vercel + GitHub Actions secrets **before** revoking the old one.
3. Trigger a redeploy so production picks up the new value.
4. Revoke the old value at the source.
5. Audit recent logs for any stray usage of the old credential.

## Production deploy flow (`.github/workflows/deploy.yml`)

Triggered by every push to `main`:

1. **`supabase db push`** — applies any new migrations against production Supabase (`SUPABASE_PROJECT_REF` + `SUPABASE_DB_PASSWORD`). Fails fast if migrations don't apply cleanly; the rest of the deploy aborts.
2. **`vercel deploy --prod`** — only runs if step 1 succeeded. Deploys apps/web to pet.specops.black.
3. **`semantic-release`** _(currently `if: false`, lands in Sprint 4)_ — publishes the CLI to npm + PyPI.
4. **`sigstore sign`** _(currently `if: false`, Sprint 4)_ — signs release artifacts with cosign.
5. **`prod-smoke`** — `curl https://pet.specops.black/api/v1/health` must return HTTP 200.

## Partition rotation (events table)

The `events` table is partitioned by `ingested_at` per SPEC.md §5.1. The Sprint 1 schema migration creates partitions for 2026-04 and 2026-05. Before May 31, 2026, run:

```sql
CREATE TABLE IF NOT EXISTS public.events_2026_06
  PARTITION OF public.events
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
```

A pg_cron job is the right long-term home for this — schedule for the 25th of each month, creating the next month's partition.

## Manual one-time setup

These steps are not automated; run them once when the repo is first linked to production infra.

1. **Vercel link**: `vercel link` from repo root → select org `specops` → create or pick project `pet-trainer`. Commit the resulting `.vercel/project.json` is gitignored.
2. **Supabase link**: `supabase link --project-ref <ref>`.
3. **GitHub OAuth app**: Create at github.com/settings/developers with callback `https://<supabase-project>.supabase.co/auth/v1/callback`. Paste the client ID + secret into Vercel + GitHub Actions secrets as `SUPABASE_AUTH_GITHUB_CLIENT_ID` / `SUPABASE_AUTH_GITHUB_SECRET`.
4. **Vercel env**: copy every row of the secrets inventory above into Vercel project env vars (Production + Preview environments).
5. **GitHub Actions secrets**: same set, plus `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
