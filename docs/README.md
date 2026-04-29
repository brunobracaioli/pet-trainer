# pet-trainer — docs/

Structured documentation for the `pet-trainer` project, derived from [`SPEC.md`](../SPEC.md).

## Start here for implementation

**[`implementation-plan.md`](implementation-plan.md)** — master sprint roadmap with all 27 steps, dependencies, and current status.

## How implementation steps work

`docs/steps/` breaks the MVP into ~27 atomic, independently reviewable steps. Each step file:

- Has YAML frontmatter with `status`, `depends_on`, `deliverables`, and `acceptance` criteria
- Has a body with Goal, Context, Implementation outline, Verification commands, and Notes
- Maps to **one PR** (link to the step file in the PR description)
- Status lifecycle: `not-started` → `in-progress` → `done`

Before coding any feature, read the relevant step spec first. See [`CLAUDE.md`](../CLAUDE.md) §Implementation steps for the mandatory workflow.

## Directory structure

```
docs/
├── README.md                         # this file
├── implementation-plan.md            # sprint roadmap + dependency tables
├── STEP-TEMPLATE.md                  # boilerplate for new steps
├── steps/
│   ├── 00-sprint0-bootstrap/         # 5 steps: monorepo → tooling → Supabase → CI → ADRs
│   ├── 01-sprint1-foundation/        # 7 steps: domain → schema → quest engine → events → auth → CLI → seeds
│   ├── 02-sprint2-quest-catalog/     # 5 steps: 20 quests → evolution → CLI cmds → offline → anti-cheat
│   ├── 03-sprint3-web/               # 5 steps: landing → dashboard → leaderboard → profile → docs
│   └── 04-sprint4-launch/            # 5 steps: threat model → RLS tests → E2E → observability → publish
├── adr/                              # ADR-001/002/003 (created in step 00-05)
├── architecture/                     # C4 diagrams + threat model (created in step 04-01)
├── quests/                           # one .md per quest (created by add-quest skill)
├── runbooks/                         # deploy, incident response, rotate secrets
└── api/                              # openapi.yaml (generated from Zod schemas in step 03-05)
```

> `adr/`, `architecture/`, `quests/`, `runbooks/`, and `api/` subdirectories are created by their respective implementation steps. Only `steps/` is pre-populated in Sprint 0.

## SPEC.md is always the source of truth

Step files **reference** SPEC.md sections (e.g., `§5.1`, `§8.4`) — they do not duplicate content. If a step spec and SPEC.md disagree, SPEC.md wins. To change architecture, open a PR that edits SPEC.md (via an ADR amendment), then update the affected step(s).
