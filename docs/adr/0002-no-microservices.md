# ADR-0002 — Modular monolith with vertical slices (no microservices in MVP)

Status: Accepted
Date: 2026-04-29

## Context

The original directive mentioned "micro-services (if it fits in MVP)". Team size is one person + Claude Code. Microservices multiply ops overhead (service mesh, distributed tracing, contract versioning) without payoff at the MVP scale we're targeting (≤ 10k MAU).

## Decision

**Modular monolith** inside Next.js, organized by **vertical slices**. Each slice owns its own domain, its own Postgres tables (or clearly prefixed tables), use cases, and route handlers.

The seven slices from SPEC.md §4.2:

| Slice         | Responsibility                                             | Primary tables              |
| ------------- | ---------------------------------------------------------- | --------------------------- |
| `auth`        | GitHub OAuth via Supabase Auth, JWT issuance for the CLI   | `auth.users` (Supabase)     |
| `pet`         | Pet CRUD, evolution stages, stat decay                     | `pets`                      |
| `quest`       | Quest catalog, event-matching rules, completion validation | `quests`, `quest_progress`  |
| `xp`          | XP calculation, level-up, anti-cheat heuristic             | `xp_ledger`                 |
| `telemetry`   | Hook event ingestion, normalization, idempotency           | `events`                    |
| `leaderboard` | Redis sorted sets, periodic Postgres snapshots             | `leaderboard_snapshots`     |
| `web`         | Dashboard, public profile, landing                         | (consumes all of the above) |

A slice's handler/service/data files must live **within** that slice's directory. No horizontal layers that span all features. No module imports another module's internals directly — slices interact only through their public service interfaces.

## Consequences

### Positive

- Vertical Slice Architecture gives bounded-context benefits without service-mesh, distributed-tracing, or contract-versioning costs.
- When (and if) scale requires it, a slice is a natural extraction candidate — it is literally a directory that can become a repo.
- Internal packages (`@specops/domain`, `@specops/quest-engine`, `@specops/ui`) are shared across slices but never published to npm directly.

### Negative

- All slices share a single deployment unit. A pathological bug in one slice can affect the whole web app's cold-start budget.
- Data ownership boundaries are enforced by convention + RLS, not by network topology.

## Extraction criteria

A slice becomes a microservice **only** when ≥2 of the following are true:

1. Event volume > 10x the average of the other slices.
2. Different stack required (e.g., ML in Python for anti-cheat detection).
3. A dedicated team (≥2 devs) working exclusively on it.
4. Conflicting SLO (e.g., hook ingest needs 99.99% while dashboard can tolerate 99.5%).

If a future PR proposes extracting a slice, it must reference which two (or more) of these criteria are met. PRs that extract a slice without meeting the bar are rejected.

## Trade-offs accepted

- We are explicitly betting that the cost of premature distribution is higher than the cost of refactoring out of a monolith later. The slice boundaries are designed to make that refactor cheap when it actually becomes necessary.
- Cross-slice transactions (e.g., XP award + leaderboard update) run as a single Postgres transaction in the monolith. This is a feature, not a debt — it eliminates the saga/2PC complexity we'd inherit by going distributed.
