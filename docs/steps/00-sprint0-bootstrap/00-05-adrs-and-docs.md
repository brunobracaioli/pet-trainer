---
id: 00-05-adrs-and-docs
sprint: 0
order: 5
status: done
spec_refs: ['§3.1', '§3.2', '§3.3', '§11']
depends_on: ['00-01-monorepo-scaffold']
deliverables:
  - docs/adr/0001-stack.md
  - docs/adr/0002-no-microservices.md
  - docs/adr/0003-http-hooks.md
acceptance:
  - All 3 ADR files exist under docs/adr/
  - Each file contains "Status: Accepted"
  - grep -r "Status: Accepted" docs/adr/ returns 3 matches
  - Content faithfully reflects SPEC.md §3.1/§3.2/§3.3 (verify by diffing key decisions)
---

## Goal

Extract the three architecture decision records from SPEC.md §3 into canonical `docs/adr/` files so that ADRs are machine-parseable, linkable from PRs, and accessible to tools like the `/adr-new` slash command.

## Context

SPEC.md §11 defines the docs-as-code structure for the repo, including `docs/adr/` as the canonical location for ADRs (0001-stack.md, 0002-no-microservices.md, 0003-http-hooks.md are explicitly listed). These three ADRs capture decisions that are binding on all future code (§3.1 "do not propose Python/FastAPI, Cloud Run, GCP, Drizzle, tRPC, or Bun"; §3.2 "no microservices until extraction criteria met"; §3.3 "HTTP hooks primary, command hooks offline fallback only"). Writing them as standalone files enables CODEOWNERS enforcement, PR template linking, and the `/adr-new` slash command to discover the next available ADR number.

## Implementation outline

- Create `docs/adr/` directory (it does not exist yet — SPEC §11 lists it but no files have been written).
- Use the `/adr-new` skill (available in `.claude/commands/`) to scaffold each file in sequence; if invoked manually, follow the ADR format below exactly — do not invent a different structure.
- Write `docs/adr/0001-stack.md` sourcing content entirely from SPEC.md §3.1: Context section covers the five product constraints (low latency hook endpoint, persistent multi-user state, web dashboard, ≤$50/month to 10k MAU, single-person team); Decision section states the TypeScript end-to-end stack (Next.js 15 on Vercel, Supabase Postgres + Auth + RLS, Upstash Redis, Node.js CLI); Consequences section covers the positive (ship in 8 weeks, near-zero MVP cost) and negative (three-vendor lock-in); Trade-offs accepted section lists Vercel lock-in (~500 LOC refactor to leave), Supabase Auth not enterprise-SSO, and GCP absent despite primary expertise.
- Write `docs/adr/0002-no-microservices.md` sourcing content from SPEC.md §3.2: Context explains the team size (one person + Claude Code) and the "micro-services if it fits MVP" original directive; Decision states modular monolith with vertical slices (`auth`, `pet`, `quest`, `xp`, `telemetry`, `leaderboard`, `web` from §4.2); include the four extraction criteria verbatim from §3.2 so future PRs can reference them by criterion number.
- Write `docs/adr/0003-http-hooks.md` sourcing content from SPEC.md §3.3: Context explains the two Claude Code hook mechanisms (command vs HTTP); Decision states HTTP hooks as primary with command hook as offline fallback writing to `~/.pet-trainer/buffer.jsonl`; Trade-offs section covers the latency risk (mitigated by fire-and-forget 2s timeout) and privacy concern (mitigated by telemetry modes documented in §10.2).
- Do not remove, modify, or summarize §3 in SPEC.md — it stays as the upstream prose reference. The `docs/adr/` files are the machine-parseable canonical format; SPEC.md §3 is human-readable context. Both must remain consistent.
- After creating the three files, run `grep -r "Status: Accepted" docs/adr/` to confirm all three files have the required status line — this is the acceptance gate.

## Files to create / modify

| Path                                | Action | Notes                                                           |
| ----------------------------------- | ------ | --------------------------------------------------------------- |
| `docs/adr/0001-stack.md`            | create | ADR-001: TypeScript + Next.js + Supabase + Upstash stack        |
| `docs/adr/0002-no-microservices.md` | create | ADR-002: Modular monolith, vertical slices, extraction criteria |
| `docs/adr/0003-http-hooks.md`       | create | ADR-003: HTTP hooks primary, command hooks offline fallback     |

### Required ADR format (all three files)

```
# ADR-NNN — Title
Status: Accepted
Date: 2026-04-29

## Context
<sourced verbatim or closely paraphrased from SPEC.md §3.X>

## Decision
<the actual choice made>

## Consequences
<positive and negative outcomes>

## Trade-offs accepted
<explicit acknowledgment of what was given up>
```

## Verification

```bash
# All three ADR files exist
ls docs/adr/0001-stack.md docs/adr/0002-no-microservices.md docs/adr/0003-http-hooks.md

# All three have Status: Accepted
grep -r "Status: Accepted" docs/adr/
# Expected: 3 lines, one per file

# ADR-001 references the stack components from §3.1
grep -i "next.js" docs/adr/0001-stack.md
grep -i "supabase" docs/adr/0001-stack.md
grep -i "upstash" docs/adr/0001-stack.md
grep -i "vercel" docs/adr/0001-stack.md

# ADR-002 includes the extraction criteria
grep -i "extraction" docs/adr/0002-no-microservices.md
grep -i "10x" docs/adr/0002-no-microservices.md

# ADR-003 references both hook mechanisms
grep -i "fire-and-forget" docs/adr/0003-http-hooks.md
grep -i "buffer.jsonl" docs/adr/0003-http-hooks.md

# Date field is present and correct in all three
grep "Date: 2026-04-29" docs/adr/*.md | wc -l
# Expected: 3
```

## Notes / Open questions

- The `/adr-new` slash command is available in `.claude/commands/adr-new.md`. Invoke it with the ADR title as argument to scaffold each file with the correct number, date, and skeleton. Example: `/adr-new "Stack de Produção"` — the skill will assign the next sequential number and set the date to today.
- Do not editorialize, rewrite, or "improve" the content from SPEC.md §3. These ADRs are a faithful extraction, not a new composition. If there is a conflict between what the ADR says and what SPEC.md §3 says, SPEC.md §3 is authoritative — fix the ADR.
- ADR numbers must be sequential and zero-padded to 4 digits (0001, 0002, 0003). The next ADR created in any future sprint will be 0004.
- SPEC.md §3.3 documents `${CLAUDE_SESSION_ID}` as part of the JWT auth mechanism for the HTTP hook. Include this detail in ADR-003 Decision section — it explains why no per-event OAuth handshake is needed.
- SPEC §11 states that the OpenAPI spec (`docs/api/openapi.yaml`) is generated automatically from Zod schemas via `zod-to-openapi`. That file is not created in Sprint 0 — it appears in step 01-04 once the first Route Handler is built. Do not create a stub `openapi.yaml` in this step.
- Per the working agreement in CLAUDE.md: "Quest catalog is docs-as-code — every quest has both a row in `quests` (seed) and a `docs/quests/<id>.md`." The `docs/quests/` directory is created in step 01-07 (seed quests — basics). Do not create it here.
