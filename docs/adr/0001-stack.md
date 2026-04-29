# ADR-0001 — Stack de Produção

Status: Accepted
Date: 2026-04-29

## Context

We need to choose backend, frontend, database, cache, hosting and CI/CD for a cloud-first product with the following constraints (sourced from SPEC.md §3.1):

- CLI distributed via npm/PyPI (install in seconds)
- Low-latency HTTP endpoint for hooks (P95 < 200ms)
- Persistent multi-user state (pets, XP, quests, leaderboard)
- Responsive web dashboard
- Operational cost ≤ US$ 50/month up to 10k active users
- Single-person team (Bruno + Claude Code) — tools must maximize iteration velocity
- Bruno has ~10 years of GCP expertise, but the project privileges Vercel for edge latency and DX

### Options evaluated

| Layer       | Option A                    | Option B                         | Option C (chosen)                                 |
| ----------- | --------------------------- | -------------------------------- | ------------------------------------------------- |
| Backend API | Python/FastAPI on Cloud Run | Node/Express on Vercel Functions | **TypeScript/Next.js Route Handlers (Vercel)**    |
| DB          | Cloud SQL Postgres (GCP)    | Neon                             | **Supabase (managed Postgres + Auth + RLS)**      |
| Cache       | Redis on Cloud Memorystore  | Vercel KV                        | **Upstash Redis (serverless, pay-per-request)**   |
| Frontend    | React + Vite (SPA)          | Astro                            | **Next.js 15 App Router (same monorepo)**         |
| CDN/Edge    | Cloudflare                  | Fastly                           | **Vercel Edge Network (included)**                |
| CLI runtime | Python                      | Go                               | **Node.js/TypeScript (same language as backend)** |

## Decision

Single TypeScript stack end-to-end:

- **Frontend + Backend:** Next.js 15 (App Router) on Vercel, with Route Handlers in `app/api/*` running as Edge Functions where latency matters (hook ingestion) and Node Functions where Edge-incompatible SDKs are required.
- **DB:** Supabase Postgres with Row-Level Security (RLS) enabled by default. Auth via Supabase Auth (GitHub OAuth as primary provider — coherent with developer audience).
- **Cache:** Upstash Redis for rate-limiting, in-flight XP counters, and leaderboard sorted sets.
- **CLI:** npm package `@specops/pet-trainer` (Node 20+) and a Python wrapper `pet-trainer` on PyPI that shells out to the Node CLI (keeps core logic in one place while still distributing through both ecosystems).
- **Observability:** Vercel Analytics + Logflare drain to Supabase (cold storage of events).
- **CI/CD:** GitHub Actions → Vercel Preview Deploys + Supabase migrations via `supabase db push`.

## Consequences

### Positive

- Ship in 8 weeks; near-zero MVP cost.
- TypeScript end-to-end reduces context-switching cognitive load — domain models shared between CLI, API and dashboard via the internal monorepo packages (`@specops/domain`, `@specops/quest-engine`).
- Vercel Edge Functions deliver P50 < 50ms globally for hook ingestion — critical because the hook latency **blocks the user's terminal**.
- Supabase RLS provides multi-tenant security by default, with no authorization code spread across handlers — Security by Design, not slogan.
- Upstash is serverless (zero idle cost) and has an HTTP-native SDK that works in Edge Runtime; Vercel KV was viable but Upstash has more mature sorted-set operations (essential for the leaderboard).
- Cost MVP: Supabase free tier (500MB) + Vercel hobby (100GB bandwidth) + Upstash free (10k commands/day) covers the first thousands of users at zero cost. In production the estimate is US$ 25–40/month up to 10k MAU.

### Negative

- Three-vendor dependency (Vercel, Supabase, Upstash). Pricing-change risk is mitigated by an architecture that can port to GCP in roughly one sprint if needed.

## Trade-offs accepted

- **Vercel lock-in:** the hook ingest endpoint depends on Edge Runtime. If we ever need to leave Vercel, refactor of ~500 LOC. Acceptable given the DX ROI.
- **Supabase Auth ≠ enterprise SSO:** OK for the developer audience. If we go B2B (phase 3) we migrate to Clerk or WorkOS.
- **GCP absent despite primary expertise:** this project does not justify the 2–3 days of extra setup that GCP would require. ADR documents this so future B2B projects keep GCP as default.

## Rejected alternatives (do not re-litigate)

Per SPEC.md §14.B and §3.1: Drizzle ORM, tRPC, and Bun were considered and rejected:

- **Drizzle ORM** — discarded in favor of the Supabase client (RLS + auto-typed via `supabase gen types`).
- **tRPC** — over-engineering for ~10 endpoints; REST + Zod gives sufficient type-safety.
- **Bun** for the CLI — Vercel runtime is Node, so consistency reduces friction.
- **Python/FastAPI on Cloud Run** — abandoned to avoid the Node/Python boundary in the request path.
