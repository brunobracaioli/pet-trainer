---
id: 04-01-threat-model
sprint: 4
order: 1
status: not-started
spec_refs: ['§10.1', '§10.2', '§10.3', '§10.4', '§11']
depends_on: [02-05-anti-cheat-heuristic]
deliverables:
  - docs/architecture/threat-model.md
  - docs/runbooks/pentest-checklist.md
  - docs/architecture/c4-context.md
acceptance:
  - 'docs/architecture/threat-model.md exists and documents all 7 threats from §10.1 plus privacy threats from §10.2'
  - 'Each threat entry has: Asset, Actor, Attack vector, Likelihood, Impact, Mitigation (with status), Residual risk'
  - 'docs/runbooks/pentest-checklist.md contains at least 15 specific, verifiable test cases'
  - 'docs/architecture/c4-context.md contains an ASCII C4 context diagram covering all system actors'
  - "grep -c '| T' docs/architecture/threat-model.md outputs >= 9 (7 STRIDE + at least 2 privacy threats)"
---

## Goal

Produce the complete threat model for pet-trainer as a living architecture document, plus a structured pentest checklist for internal review before launch. Provide a C4 context diagram that makes the trust boundary layout explicit for any future contributor.

## Context

SPEC.md §10.1 lists 7 threats to address in the MVP. §10.2 adds privacy obligations under LGPD and GDPR (telemetry opt-in, retention, DSAR). Sprint 4 is the hardening sprint — the threat model must be written before the pentest checklist is executed, and both must be reviewed before the npm/PyPI publish step (04-05).

The threat model is explicitly called out in the docs structure at §11 (`docs/architecture/threat-model.md`) and is a living document: it must be updated whenever a new API endpoint is added or a new data flow crosses a trust boundary.

The security-scanner agent (Claude Code `/security-review` skill) should be run against the codebase after writing the threat model and before marking this step `done`.

## Implementation outline

### 1. Produce `docs/architecture/c4-context.md`

Draw an ASCII C4 Context diagram that shows:

- **System:** pet-trainer (Vercel Edge + Node, Supabase, Upstash)
- **Person actors:** Student (aluno) using terminal; Unauthenticated visitor reading leaderboard
- **External systems:** GitHub OAuth (Supabase Auth provider); npm registry; PyPI registry; Logflare (log drain); Sentry (error tracking)
- Trust boundaries drawn as boxes around: Local machine, Vercel Edge Network, Supabase, Upstash Redis

Include a data-flow legend explaining arrow labels (HTTPS/JWT, service-role key, fire-and-forget, etc.).

### 2. Produce `docs/architecture/threat-model.md`

Structure:

```
# Threat Model — pet-trainer

## Scope and assumptions
## Data flow diagram (ASCII)
## STRIDE threat table (7 threats from §10.1)
## Privacy threats (§10.2)
## Controls summary
## Review cadence
```

**Data flow diagram** (ASCII) must show all hops:

```
aluno terminal
  └─ Claude Code (PostToolUse hook)
       └─ HTTPS + JWT ──▶ /api/v1/events (Vercel Edge)
                               ├─ Redis INCR  ──▶ Upstash (rate-limit)
                               ├─ Redis SETNX ──▶ Upstash (idempotency)
                               └─ INSERT       ──▶ Supabase Postgres (service-role)
                                                       └─ xp_ledger + leaderboard ZADD
```

**STRIDE threat table** — one row per threat, all 7 from §10.1:

| ID  | Category | Asset | Actor | Attack vector | Likelihood | Impact | Mitigation | Status | Residual risk |
| --- | -------- | ----- | ----- | ------------- | ---------- | ------ | ---------- | ------ | ------------- |

Threat IDs:

- `T-01` Token leak via committed settings.json
- `T-02` XP farming / bot (rate-limit bypass, idempotency bypass)
- `T-03` Payload injection via tool_input/output (JSONB stored, never executed)
- `T-04` Code leak via telemetry (tool_input.new_string contains proprietary code)
- `T-05` RLS bypass (cross-user data access via misconfigured policy)
- `T-06` Replay attack (captured JWT reused)
- `T-07` Supply chain compromise (malicious publish to npm)

For each threat include:

- **Likelihood:** Low / Medium / High — justified in a sentence
- **Impact:** Low / Medium / High — justified in a sentence
- **Mitigation:** concrete controls already implemented; reference to code or config
- **Status:** `implemented` | `partial` | `planned`
- **Residual risk:** what remains after mitigations are applied

**Privacy threats** — separate section with at least 2 entries:

- `P-01` Telemetry full-mode leaking proprietary code beyond 1 KB
- `P-02` Retention beyond 90 days violating LGPD/GDPR
- `P-03` DSAR not honored within 30-day window

Each privacy threat: Data category, Regulation, Scenario, Mitigation, Status.

**Controls summary** table: map each control (JWT short expiry, Redis rate-limit, idempotency, RLS, secretlint, provenance signing, etc.) to the threats it mitigates.

**Review cadence:** State explicitly that this document must be reviewed (a) after any new API endpoint is added, (b) after any new data store is introduced, (c) at each sprint 4+ security review. Assign owner: Bruno Bracaioli.

### 3. Produce `docs/runbooks/pentest-checklist.md`

Structure: grouped by attack category, each item with: Test ID, Description, Tool/Method, Expected result (pass condition), Actual result (blank — filled during pentest), Status checkbox.

**Auth bypass (5 tests minimum):**

- `AUTH-01` Tamper JWT signature — send request with modified `.payload` section, verify 401
- `AUTH-02` Use expired JWT (set `exp` to past) — verify 401, not 500
- `AUTH-03` Omit `Authorization` header entirely — verify 401 on protected endpoints
- `AUTH-04` Use a valid JWT for user A to read user B's pet — verify 403 / empty result (RLS)
- `AUTH-05` Session fixation: reuse a `session_id` from a previously revoked JWT — verify events are rejected

**XP farming (4 tests minimum):**

- `FARM-01` Send 121 events in 60 seconds to `/events` — verify 429 after the 120th
- `FARM-02` Send same event with same `Idempotency-Key` twice — verify second call is a no-op (XP not doubled)
- `FARM-03` Send events with randomized `Idempotency-Key` but identical payload in a loop — verify anti-cheat heuristic flags the sequence
- `FARM-04` Directly call `POST /api/v1/events` (not via hook) with crafted tool_name — verify quest progression requires server-side match rule evaluation

**RLS bypass (3 tests minimum):**

- `RLS-01` Authenticate as user A, attempt `GET /pet/me` with user B's pet `id` in query — verify response contains only user A's pet
- `RLS-02` Authenticate as user A, attempt raw SQL `SELECT * FROM events WHERE user_id = <user_B>` via Supabase JS client — verify empty result (RLS blocks)
- `RLS-03` Attempt INSERT into `events` using a user JWT (not service-role) — verify rejection (policy: `WITH CHECK (false)`)

**Supply chain (2 tests minimum):**

- `SUPPLY-01` Run `npm audit --audit-level=high` on `apps/cli/package.json` — verify zero high/critical advisories
- `SUPPLY-02` Run Snyk scan (`snyk test`) on the workspace — verify no high severity issues

**Input fuzzing (3 tests minimum):**

- `FUZZ-01` Send `tool_input.new_string` containing `'; DROP TABLE events; --` — verify payload is stored as-is string, never executed; Postgres uses parameterized queries
- `FUZZ-02` Send `tool_input.new_string` containing `<script>alert(1)</script>` — verify the value is sanitized/escaped before rendering in the dashboard
- `FUZZ-03` Send oversized payload (>100 KB) to `/events` — verify 413 or payload truncation at 1 KB before persistence

**Token leak detection (3 tests minimum):**

- `TOKEN-01` Run `gitleaks detect --source .` — verify zero secrets found in git history
- `TOKEN-02` Check `.claude/settings.json` template produced by `pet init` — verify no literal token value, only `$PET_TRAINER_TOKEN` variable reference
- `TOKEN-03` Run `secretlint "**/*"` — verify no failures in pre-commit hook output

Each test must have columns: ID | Description | Command / Method | Expected | Actual | Pass/Fail.

## Files to create / modify

| Action | Path                                 |
| ------ | ------------------------------------ |
| Create | `docs/architecture/threat-model.md`  |
| Create | `docs/architecture/c4-context.md`    |
| Create | `docs/runbooks/pentest-checklist.md` |

No application code changes in this step. All outputs are documentation.

## Verification

```bash
# Threat model exists and is non-trivial
test -f docs/architecture/threat-model.md && wc -l docs/architecture/threat-model.md
# Should report > 100 lines

# All 7 threats from §10.1 are present (T-01 through T-07)
for t in T-01 T-02 T-03 T-04 T-05 T-06 T-07; do
  grep -q "$t" docs/architecture/threat-model.md && echo "$t OK" || echo "$t MISSING"
done

# Privacy threats are present
grep -q "P-01\|LGPD\|GDPR" docs/architecture/threat-model.md && echo "Privacy section OK"

# Pentest checklist has at least 15 test IDs
grep -cP '^- `(AUTH|FARM|RLS|SUPPLY|FUZZ|TOKEN)-' docs/runbooks/pentest-checklist.md
# Must output >= 15 (actual count should be >= 20 from the outline above)

# C4 diagram exists
test -f docs/architecture/c4-context.md && echo "C4 OK"

# Run security-review skill before marking done
# Invoke: /security-review (Claude Code skill) — review output manually
```

After the pentest checklist is filled in by a human reviewer, every test must be marked Pass before proceeding to step 04-05.

## Notes / Open questions

- The threat model is a **living document**. Add a header note stating: "Last reviewed: [date]. Next review: after any new API endpoint or data store." The owner is Bruno Bracaioli.
- §10.2 requires a privacy policy page at `/legal/privacy` — this step documents the requirements; the actual page is out of scope here but must be tracked as a Sprint 4 task.
- LGPD and GDPR have different timelines for DSAR responses (30 days vs 1 month respectively) — note both in the privacy threats section.
- The `T-04` code leak threat is partially mitigated by the `--telemetry=minimal` flag; document the opt-in mechanism clearly so the pentest checklist can verify it works end-to-end.
- If the security-scanner agent finds additional threats not in §10.1, add them as `T-08+` and create corresponding pentest cases.
