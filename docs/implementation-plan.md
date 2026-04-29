# pet-trainer — Implementation Plan

> Operational roadmap derived from SPEC.md §12. Each sprint is a 2-week cycle targeting 8 weeks total.
> **Source of truth for step ordering and dependency tracking.**

## How to use this plan

1. Always execute steps **in order within each sprint**; respect `depends_on` fields in step files.
2. Before coding, read `docs/steps/<sprint>/<step-id>.md`.
3. Update `status:` in the step's frontmatter: `not-started` → `in-progress` → `done`.
4. Verify all `acceptance` criteria before marking `done`.
5. Each step ships as **one PR**; link to `docs/steps/<step-id>.md` in the PR description.
6. For complex steps, delegate to agent teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set).

---

## Sprint 0 — Bootstrap (Week 0)

**Goal:** Working monorepo, tooling baseline, Supabase local, Vercel linked, CI skeleton, ADRs committed.

**Demo checkpoint:** `pnpm install` and `pnpm typecheck` green across workspace; `supabase start` running.

| Step                      | Spec file                                                                           | Status      | Depends on   |
| ------------------------- | ----------------------------------------------------------------------------------- | ----------- | ------------ |
| 00-01 · Monorepo scaffold | [00-01-monorepo-scaffold.md](steps/00-sprint0-bootstrap/00-01-monorepo-scaffold.md) | done        | —            |
| 00-02 · Tooling baseline  | [00-02-tooling-baseline.md](steps/00-sprint0-bootstrap/00-02-tooling-baseline.md)   | done        | 00-01        |
| 00-03 · Supabase init     | [00-03-supabase-init.md](steps/00-sprint0-bootstrap/00-03-supabase-init.md)         | in-progress | 00-01        |
| 00-04 · Vercel + CI       | [00-04-vercel-and-ci.md](steps/00-sprint0-bootstrap/00-04-vercel-and-ci.md)         | in-progress | 00-02, 00-03 |
| 00-05 · ADRs + docs       | [00-05-adrs-and-docs.md](steps/00-sprint0-bootstrap/00-05-adrs-and-docs.md)         | done        | 00-01        |

---

## Sprint 1 — Foundation (Weeks 1–2)

**Goal:** Auth + hook ingestion working end-to-end. CLI installable and reporting events.

**Demo checkpoint:** Bruno runs `npx @specops/pet-trainer init`, makes an Edit, sees XP rise.

| Step                                        | Spec file                                                                                        | Status      | Depends on          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------- | ------------------- |
| 01-01 · Domain package (Zod schemas)        | [01-01-domain-package.md](steps/01-sprint1-foundation/01-01-domain-package.md)                   | done        | 00-02               |
| 01-02 · Supabase schema + RLS               | [01-02-supabase-schema-and-rls.md](steps/01-sprint1-foundation/01-02-supabase-schema-and-rls.md) | in-progress | 00-03, 01-01        |
| 01-03 · Quest engine package                | [01-03-quest-engine-package.md](steps/01-sprint1-foundation/01-03-quest-engine-package.md)       | done        | 01-01               |
| 01-04 · /events Edge handler                | [01-04-events-edge-handler.md](steps/01-sprint1-foundation/01-04-events-edge-handler.md)         | done        | 01-01, 01-02, 01-03 |
| 01-05 · Auth (GitHub OAuth + CLI endpoints) | [01-05-auth-supabase-github.md](steps/01-sprint1-foundation/01-05-auth-supabase-github.md)       | done        | 00-04, 01-02        |
| 01-06 · CLI init + status                   | [01-06-cli-init-status.md](steps/01-sprint1-foundation/01-06-cli-init-status.md)                 | done        | 01-05               |
| 01-07 · Seed quests — basics                | [01-07-seed-quests-basics.md](steps/01-sprint1-foundation/01-07-seed-quests-basics.md)           | in-progress | 01-02, 01-03        |

---

## Sprint 2 — Quest catalog complete (Weeks 3–4)

**Goal:** All 20 MVP quests live, CLI fully operational, offline buffer working.

| Step                                      | Spec file                                                                                     | Status      | Depends on   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | ----------- | ------------ |
| 02-01 · Quest catalog MVP (16 quests)     | [02-01-quest-catalog-mvp.md](steps/02-sprint2-quest-catalog/02-01-quest-catalog-mvp.md)       | not-started | 01-07        |
| 02-02 · Evolution stages                  | [02-02-evolution-stages.md](steps/02-sprint2-quest-catalog/02-02-evolution-stages.md)         | not-started | 01-04        |
| 02-03 · CLI feed / train / slash commands | [02-03-cli-feed-train-slash.md](steps/02-sprint2-quest-catalog/02-03-cli-feed-train-slash.md) | not-started | 01-06, 01-07 |
| 02-04 · Offline buffer + pet sync         | [02-04-offline-buffer-sync.md](steps/02-sprint2-quest-catalog/02-04-offline-buffer-sync.md)   | not-started | 01-06        |
| 02-05 · Anti-cheat heuristic              | [02-05-anti-cheat-heuristic.md](steps/02-sprint2-quest-catalog/02-05-anti-cheat-heuristic.md) | not-started | 01-04, 02-01 |

---

## Sprint 3 — Web dashboard (Weeks 5–6)

**Goal:** Public web live: landing, dashboard, leaderboard, public profile, docs.

| Step                                 | Spec file                                                               | Status      | Depends on   |
| ------------------------------------ | ----------------------------------------------------------------------- | ----------- | ------------ |
| 03-01 · Landing page                 | [03-01-landing-page.md](steps/03-sprint3-web/03-01-landing-page.md)     | not-started | 01-05        |
| 03-02 · Dashboard                    | [03-02-dashboard.md](steps/03-sprint3-web/03-02-dashboard.md)           | not-started | 01-04, 01-05 |
| 03-03 · Leaderboard                  | [03-03-leaderboard.md](steps/03-sprint3-web/03-03-leaderboard.md)       | not-started | 01-04        |
| 03-04 · Public profile + badge SVG   | [03-04-public-profile.md](steps/03-sprint3-web/03-04-public-profile.md) | not-started | 01-05        |
| 03-05 · Docs as code (MDX + OpenAPI) | [03-05-docs-as-code.md](steps/03-sprint3-web/03-05-docs-as-code.md)     | not-started | 02-01        |

---

## Sprint 4 — Hardening + Launch (Weeks 7–8)

**Goal:** Security review, 100% RLS pgTAP coverage, E2E, observability, npm + PyPI publish, launch.

| Step                     | Spec file                                                                    | Status      | Depends on                 |
| ------------------------ | ---------------------------------------------------------------------------- | ----------- | -------------------------- |
| 04-01 · Threat model     | [04-01-threat-model.md](steps/04-sprint4-launch/04-01-threat-model.md)       | not-started | 02-05                      |
| 04-02 · RLS pgTAP tests  | [04-02-rls-pgtap-tests.md](steps/04-sprint4-launch/04-02-rls-pgtap-tests.md) | not-started | 01-02                      |
| 04-03 · E2E Playwright   | [04-03-e2e-playwright.md](steps/04-sprint4-launch/04-03-e2e-playwright.md)   | not-started | 03-01, 03-02, 03-03        |
| 04-04 · Observability    | [04-04-observability.md](steps/04-sprint4-launch/04-04-observability.md)     | not-started | 00-04                      |
| 04-05 · Publish + launch | [04-05-publish-launch.md](steps/04-sprint4-launch/04-05-publish-launch.md)   | not-started | 04-01, 04-02, 04-03, 04-04 |

---

## Cross-sprint dependency graph (summary)

```
00-01 → 00-02 → 01-01 → 01-02 → 01-04 → 02-02 → ...
              ↘ 01-03 ↗           ↘ 02-05 → 04-01
00-01 → 00-03 ↗
00-02 + 00-03 → 00-04 → 01-05 → 01-06 → 02-03, 02-04
                                       → 03-01, 03-02, 03-04
01-02 + 01-03 → 01-07 → 02-01 → 02-05, 03-05
01-02 → 04-02 (can start any time after schema is done)
03-01 + 03-02 + 03-03 → 04-03 → 04-05
```

---

> **SPEC.md §12 is the upstream for sprint goals. Any milestone change must be reflected in both SPEC.md and this plan.**
