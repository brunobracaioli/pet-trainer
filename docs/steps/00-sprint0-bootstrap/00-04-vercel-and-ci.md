---
id: 00-04-vercel-and-ci
sprint: 0
order: 4
status: in-progress
spec_refs: ['§10.3', '§3.1', '§10.4', '§3.3']
depends_on: ['00-02-tooling-baseline', '00-03-supabase-init']
deliverables:
  - vercel.json
  - .github/workflows/ci.yml
  - .github/workflows/deploy.yml
  - .env.example
acceptance:
  - yamllint .github/workflows/ci.yml exits 0 (valid YAML)
  - yamllint .github/workflows/deploy.yml exits 0
  - gh workflow list shows ci.yml and deploy.yml after pushing to GitHub
  - .env.example contains all required variable names with empty values
  - .vercel/project.json is listed in .gitignore
---

## Goal

Link the project to Vercel and scaffold the full GitHub Actions CI + deploy pipeline so that every PR gets type-checked, linted, tested, and preview-deployed automatically from the first merge.

## Context

SPEC.md §10.3 defines the exact CI/CD pipeline stages — pre-commit (local, already done in step 00-02) and `ci.yml` (PR-level) and `deploy.yml` (on merge to main). This step wires those stages as GitHub Actions workflows. Several jobs are created as `if: false` placeholders (integration tests, RLS tests, E2E smoke) because their dependencies (Supabase schema, pgTAP, Playwright) are not yet installed; they will be activated in Sprint 1 and Sprint 4 respectively. The Vercel link (`vercel link`) is an interactive manual step documented in the Verification section because it cannot be scripted.

## Implementation outline

- Create `vercel.json` at repo root setting `"framework": "nextjs"`, `"buildCommand": "cd ../.. && pnpm turbo build --filter=@specops/web"`, `"outputDirectory": "apps/web/.next"`, and `"installCommand": "pnpm install --frozen-lockfile"` — the build command uses Turborepo's `--filter` flag so Vercel only builds `apps/web` and its workspace dependencies, not the CLI (§3.1 Vercel + Turborepo setup).
- Create `.github/workflows/ci.yml` with jobs (each depends on `install` job via `needs:`): `install` (pnpm cache + `pnpm install --frozen-lockfile`), `typecheck` (`pnpm turbo typecheck`), `lint` (`pnpm turbo lint`), `test` (`pnpm turbo test`), `integration` (`if: false` placeholder — will run `supabase start` + integration suite in Sprint 1), `rls-tests` (`if: false` placeholder — pgTAP in Sprint 4), `preview-deploy` (runs `vercel deploy --prebuilt` using `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` from GitHub Actions secrets), `e2e-smoke` (`if: false` placeholder — Playwright against preview URL in Sprint 4). Trigger on `push` to all branches and `pull_request` targeting `main`.
- Create `.github/workflows/deploy.yml` triggered on `push` to `main` only, with sequential steps: (1) `supabase db push` using `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` secrets, (2) `vercel deploy --prod` using `VERCEL_TOKEN`, (3) `pnpm semantic-release` (publishes CLI to npm + PyPI per §10.3 deploy step 3), (4) Sigstore signing via `sigstore sign` on the release artifacts, (5) production smoke (`curl https://pet.specops.black/api/v1/health` → assert HTTP 200). Keep steps 3 and 4 as `if: false` placeholders until Sprint 4; include them as commented skeleton so the shape is visible.
- Create `.env.example` at repo root documenting every required environment variable with empty values and inline comments explaining where each comes from. Required vars: `PET_TRAINER_TOKEN` (CLI JWT, set by `pet init`), `NEXT_PUBLIC_SUPABASE_URL` (Supabase project URL, safe for client), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase anon key, safe for client), `SUPABASE_SERVICE_ROLE_KEY` (server-only, Node Functions only — see SPEC §3.3 and §10.4), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (local dev OAuth App only).
- Add `.vercel/project.json` to `.gitignore` — this file is created by `vercel link` and contains the `projectId` and `orgId` in plaintext; while not secret, it should not be committed as it ties the repo to a specific Vercel account.
- Add a `pnpm-lock.yaml` cache step in the `install` job using `actions/cache` keyed on `hashFiles('pnpm-lock.yaml')` to match the §10.3 pipeline note on "install + cache (pnpm)".
- Add `CODEQL` analysis job in `ci.yml` using `github/codeql-action/analyze` for TypeScript — this is §10.3 step 7 (SAST). Set it to run only on PRs targeting `main` to avoid slowing down feature branch pushes.

## Files to create / modify

| Path                           | Action | Notes                                                                                                                      |
| ------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `vercel.json`                  | create | framework: nextjs, Turborepo --filter build, frozen-lockfile install                                                       |
| `.github/workflows/ci.yml`     | create | 8 jobs: install, typecheck, lint, test, integration (if:false), rls-tests (if:false), preview-deploy, e2e-smoke (if:false) |
| `.github/workflows/deploy.yml` | create | Sequential: db push → prod deploy → semantic-release (if:false) → sigstore (if:false) → smoke                              |
| `.env.example`                 | create | All required var names, empty values, inline comments                                                                      |
| `.gitignore`                   | edit   | Add .vercel/project.json                                                                                                   |

## Verification

```bash
# Validate YAML syntax (install yamllint if needed: pip install yamllint)
yamllint .github/workflows/ci.yml
yamllint .github/workflows/deploy.yml

# Confirm .env.example has all required vars (none should have a value)
grep -E "^[A-Z_]+=$" .env.example | wc -l
# Expected: 8 lines (one per required var)

# Confirm .vercel/project.json is gitignored
git check-ignore -v .vercel/project.json
# Expected: .gitignore:N:.vercel/project.json

# After pushing to GitHub:
gh workflow list
# Expected output includes:
#   CI             push  ci.yml
#   Deploy         push  deploy.yml

# Verify ci.yml triggers on pull_request events
gh workflow view ci.yml
```

### Manual steps (interactive, not scriptable)

1. Install Vercel CLI: `pnpm add -g vercel`
2. From repo root run: `vercel link` → authenticate, select scope `specops`, create new project named `pet-trainer`.
3. Copy the generated `VERCEL_PROJECT_ID` and `VERCEL_ORG_ID` from `.vercel/project.json` into GitHub repository secrets (Settings → Secrets → Actions).
4. Generate a Vercel deploy token at `vercel.com/account/tokens` and add it as `VERCEL_TOKEN` in GitHub secrets.
5. After step 01-02 (Supabase schema), run `supabase link --project-ref <ref>` and add `SUPABASE_PROJECT_REF` + `SUPABASE_DB_PASSWORD` to GitHub secrets.

## Notes / Open questions

- `SUPABASE_SERVICE_ROLE_KEY` is critically important: it bypasses RLS and must only be present in Node Functions runtime (§3.3 ADR-003, §10.4). Document this in `.env.example` with the comment `# SERVER ONLY — never expose to Edge Runtime or client`. The `events` insert in `/api/v1/events` uses this key via the Supabase admin client but only in the Node-runtime portion (step 6 of §8.4 logic).
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are safe for the client bundle — they are public by Supabase's design (RLS is the actual security layer, per §5.1). `NEXT_PUBLIC_` prefix is required for Next.js App Router to inline them.
- The `preview-deploy` job in `ci.yml` should output the preview URL as a job output so that `e2e-smoke` (when activated in Sprint 4) can consume it via `needs.preview-deploy.outputs.preview-url`.
- Do not add `npm audit` and Snyk steps to `ci.yml` in this sprint (§10.3 step 8). Add them as `if: false` placeholders to document intent without blocking the green pipeline — they require `SNYK_TOKEN` secret which is not provisioned at Sprint 0.
- The `deploy.yml` `supabase db push` step runs **before** Vercel deploy (§10.3 deploy order). This is intentional: the API code must never deploy against a stale schema. If `db push` fails, the deploy is aborted.
- SPEC §3.1 explicitly rejects Bun — the `ci.yml` must use `pnpm` throughout. Do not use `npm ci` or `yarn` anywhere in the workflow files.
