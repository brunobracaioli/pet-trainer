# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

**This repo is currently spec-only.** The single source of truth is `SPEC.md` (a Spec-Driven Development document for `pet-trainer`, v1.0 MVP). No application code, monorepo scaffold, or migrations exist yet — the only other artifact is a `venv/` directory left over from earlier exploration. Sprint 0 in SPEC.md §12 has not been executed.

When asked to "implement X" or "build the CLI", expect to be bootstrapping the structure described in SPEC.md §14 from scratch (Turborepo monorepo with `apps/web`, `apps/cli`, `packages/domain`, `packages/quest-engine`). Do not assume any of that exists until you've verified it on disk.

## Product in one sentence

`pet-trainer` is a terminal Tamagotchi distributed via npm + PyPI that gamifies learning Claude Code: every Claude Code tool call is captured by an HTTP hook, sent to a Vercel-hosted API, and used to award XP / evolve a pet / fill a leaderboard at `pet.specops.black`. SPEC.md §0 has the full pitch.

## Architecture (must-read before non-trivial work)

The architecture is fully specified in SPEC.md and is **not negotiable per-task** — it was decided in three ADRs that Claude should respect rather than re-litigate:

- **ADR-001 (§3.1) — Stack:** TypeScript end-to-end. Next.js 15 App Router on Vercel for both frontend and API (Edge Functions for hook ingestion, Node Functions where Edge runtime is incompatible). Supabase Postgres + Auth + RLS. Upstash Redis for rate-limit / leaderboard ZSET / session cache. CLI is Node 20+ on npm; Python wrapper on PyPI shells out to the Node CLI. **Do not propose Python/FastAPI, Cloud Run, GCP, Drizzle, tRPC, or Bun** — all considered and rejected (§3.1, §14.B).
- **ADR-002 (§3.2) — Modular monolith, vertical slices.** Slices: `auth`, `pet`, `quest`, `xp`, `telemetry`, `leaderboard`, `web` (§4.2). No microservices in MVP. Slice extraction criteria are in §3.2 — don't extract before they're met.
- **ADR-003 (§3.3) — HTTP hooks, not command hooks.** Hook ingestion is fire-and-forget, 2s timeout, JWT-authenticated. Server-side detection of quest completion (so logic can update without users upgrading the CLI). Command hooks exist only as offline fallback writing to `~/.pet-trainer/buffer.jsonl`, drained by `pet sync`.

The hot path is `/api/v1/events` (SPEC.md §8.3, §8.4): JWT validate → Redis rate-limit → idempotency check (`Idempotency-Key` header) → persist event → evaluate active match rules → award XP + update leaderboard ZSET, all under ~100ms P95 on Edge runtime. Treat its latency budget as load-bearing: anything that pushes it past 200ms P95 is a regression because the hook blocks the user's terminal.

## Domain model — quick map

- **Postgres schema** is fully defined in SPEC.md §5.1 (don't redesign from scratch — copy it). Key tables: `profiles`, `pets` (1:1 with user in MVP, `UNIQUE(owner_id)`), `quests` (catalog, seed-driven, with `match_rule` JSONB DSL), `quest_progress`, `events` (partitioned by `ingested_at` month), `xp_ledger` (audit trail).
- **RLS is on for every user-data table.** Policies are listed in §5.1 and must be covered by pgTAP tests in CI (§10.3 step 6). `events` inserts go through the Supabase service role key — never from the client.
- **Redis keys** are enumerated in §5.2 with TTLs. Stick to the documented key shape (`rl:events:{user_id}`, `lb:global:weekly`, `pet:cache:{user_id}`, etc.) so observability and rate-limit logic stay coherent.
- **Quest match-rule DSL** (§7.1) supports `equals`, `contains`, `startsWith`, `endsWith`, `regex`, `min_count`, `gte`, `lte`, `in`, `and`, `or`, `not`. The evaluator lives in `packages/quest-engine` and must remain pure / dependency-free so it can be unit-tested in isolation and run on Edge.
- **Evolution stages** (§7.3) are XP gates: 0 / 200 / 800 / 2 500 / 6 000. New quests must be slotted into the right stage's unlock graph (`unlocks_after`).

## CLI surface (target shape, not built yet)

User-facing commands and slash commands are fixed by SPEC.md §6.2 / §6.3. When implementing, match these names exactly — they're already in the marketing material:

- `pet init` (device-code OAuth + writes `.claude/settings.json` + appends to `CLAUDE.md`), `pet status`, `pet quests`, `pet feed`, `pet train <quest-id>`, `pet sync`, `pet logout`, `pet --version`.
- Slash commands installed into the user's `.claude/commands/`: `/pet`, `/quest`, `/feed`.
- Generated `.claude/settings.json` template is in §6.4. The token must come from `$PET_TRAINER_TOKEN` (env var), never inlined into the JSON — `pet init` is responsible for adding the export to the user's shell rc.

## API contract

- Base URL `https://pet.specops.black/api/v1`, Bearer JWT, `Idempotency-Key` required on all POSTs (SPEC.md §8.1).
- Endpoint inventory + which runtime (Edge vs Node) is in §8.2. Don't move an endpoint between runtimes without checking — Edge-incompatible SDKs are the reason some are Node-only.
- Versioning is in the URL (`/v1` → `/v2` for breaking changes); never break `/v1` shape.
- OpenAPI 3.1 is **generated** from Zod schemas via `zod-to-openapi` (§11) — keep the Zod schemas authoritative.

## Security & privacy invariants

These come from SPEC.md §10 and the user's global rules (`~/.claude/CLAUDE.md`); both agree, so treat them as hard constraints:

- Auth → authorization → input validation (Zod) → business logic, in that order, on every protected handler.
- No secrets in code or in versioned `.env`. Tokens live in env vars or Vercel env config; rotation is quarterly (§10.4).
- RLS stays on; bypass only through service-role JWT in Node functions for `events` inserts.
- Telemetry has three modes: `--telemetry=full` (default, payloads truncated to 1 KB), `--telemetry=minimal` (tool name + hashed file path only), `--telemetry=off` (hooks become no-ops). Never log raw payloads beyond the 1 KB cap; they may contain user code.
- Rate-limit every public endpoint, especially auth flows. Use the Upstash counter keys defined in §5.2.
- Fire-and-forget on `/events`: 5xx must not be retried by the hook (the offline buffer + `pet sync` is the retry path).

## Common commands (planned, not yet wired)

The repo has **no `package.json`, `pnpm-workspace.yaml`, or `turbo.json` yet**, so none of these run today. They are the commands SPEC.md commits to once Sprint 0 lands; use these names when scaffolding so muscle memory and CI configs match the spec:

- Package manager: **pnpm** (Turborepo monorepo per §14.A).
- Type-check: `pnpm typecheck` → `tsc --noEmit` across the workspace.
- Lint / format: ESLint + Prettier (pre-commit via husky + secretlint/gitleaks per §10.3).
- Unit tests: **Vitest** (run a single test with `pnpm vitest run path/to/file.test.ts -t "test name"` once Vitest is installed).
- Integration tests: against a local Supabase (`supabase start`).
- RLS policy tests: **pgTAP** — required to be green in CI for every PR that touches a policy.
- E2E: **Playwright** against the Vercel preview deploy.
- DB migrations: `supabase db push` (run from `supabase/migrations/`).
- Local dev: `pnpm dev` from the repo root will run all apps via Turborepo once `apps/web` and `apps/cli` exist.

If a user asks to run any of these before the scaffold exists, say so and offer to bootstrap Sprint 0 instead of inventing commands.

## CI/CD shape

Pipeline stages (SPEC.md §10.3) are the source of truth for what "green" means:

1. pre-commit: secretlint (gitleaks), eslint, prettier
2. PR CI: install (pnpm cache) → typecheck → lint → vitest → integration tests (supabase local) → pgTAP RLS tests → CodeQL → `npm audit` + Snyk → Vercel preview deploy → Playwright smoke against preview
3. On merge to `main`: `supabase db push` → `vercel deploy --prod` → `semantic-release` to npm + PyPI with provenance + Sigstore signing → prod smoke

Don't skip stages 5 (integration) or 6 (RLS) — they're the ones that actually catch the dangerous bugs in this design.

## Working agreements specific to this repo

- **The spec is binding.** When SPEC.md and an instinct disagree, change the spec via an ADR amendment (PR that edits SPEC.md), don't drift the code. Open Questions live in §13 — pick those off rather than inventing new decisions.
- **Quest catalog is docs-as-code.** Every quest has both a row in `quests` (seed) and a `docs/quests/<id>.md`. PRs that touch quest code without updating the .md should be rejected (CODEOWNERS-enforced once the repo is scaffolded).
- **English everywhere in code; pt-BR allowed in spec / marketing copy.** SPEC.md is bilingual on purpose; identifiers, comments, and commit messages stay English (matches the user's global rule).
- **Vertical slice or it doesn't merge.** New domain code lands as the full slice (Zod validator → service in `lib/services/` or `packages/<slice>` → route handler), per the user's global rules and ADR-002.
