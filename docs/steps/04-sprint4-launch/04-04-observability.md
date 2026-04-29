---
id: 04-04-observability
sprint: 4
order: 4
status: not-started
spec_refs: ['§3.1', '§10.2', '§10.3', '§10.4']
depends_on: [00-04-vercel-and-ci]
deliverables:
  - apps/web/instrumentation.ts
  - apps/web/app/layout.tsx
  - apps/web/next.config.ts
  - docs/runbooks/deploy.md
  - .env.example
acceptance:
  - 'pnpm --filter @specops/web build succeeds with Sentry plugin active (SENTRY_DSN set)'
  - 'Vercel Analytics component renders in production (visible in Vercel dashboard after deploy)'
  - 'Sentry receives a test error triggered in a dev route (visible in Sentry project dashboard)'
  - 'docs/runbooks/deploy.md exists and covers all manual setup steps end-to-end'
  - '.env.example contains SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN entries'
  - 'beforeSend PII scrubber removes tool_input/output fields from Sentry error contexts'
---

## Goal

Wire up three production observability layers — Logflare log drain, Sentry error tracking (Edge + Node), and Vercel Analytics — then document all manual infrastructure steps in a deployment runbook so the production environment is reproducible and auditable.

## Context

SPEC.md §3.1 specifies Vercel Analytics + Logflare drain for observability. §10.2 requires that raw payloads never be logged beyond the 1 KB cap (the `tool_input`/`tool_response` fields may contain proprietary code). §10.4 mandates quarterly secret rotation documented in a runbook.

The hot path metric to monitor is `/api/v1/events` P95 latency — the spec treats exceeding 200ms P95 as a regression because the hook blocks the user's terminal (§8.4). Sentry Performance traces on the Edge Function are the primary instrument for this.

None of these tools are configured in code alone — Logflare requires a Vercel dashboard action, Vercel Analytics requires an env var, and Sentry requires a project to be created. The deploy runbook documents the exact steps so any future operator can reproduce the setup.

## Implementation outline

### 1. Sentry project and DSN

Before writing any code, complete the Sentry setup:

1. Create a Sentry project at `sentry.io`: Organization → Create Project → Next.js → Name: `pet-trainer-web`
2. Copy the DSN (format: `https://<key>@<org>.ingest.sentry.io/<project-id>`)
3. Add to Vercel project env vars (production + preview):
   - `SENTRY_DSN` (server-side only)
   - `NEXT_PUBLIC_SENTRY_DSN` (client-side, same value)
   - `SENTRY_AUTH_TOKEN` (for source map upload — generate via Sentry → Settings → Auth Tokens → Create)
4. Add to `.env.example` (placeholder values, not real keys)

### 2. Install Sentry SDK

```bash
pnpm --filter @specops/web add @sentry/nextjs
```

Run the Sentry wizard for initial config generation (optional — output below is the manual equivalent):

```bash
pnpm --filter @specops/web exec npx @sentry/wizard@latest -i nextjs --saas
```

The wizard generates `instrumentation.ts` and updates `next.config.ts`. Review and adjust as specified below.

### 3. `apps/web/instrumentation.ts`

Next.js 15 App Router uses `instrumentation.ts` (in `app/` or the `src/` root) to register SDKs that must run in both Node and Edge runtimes.

```typescript
// apps/web/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Node.js runtime (most API routes, RSC rendering)
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? 'development',
      tracesSampleRate: 0.1, // 10% — enough for P95 tracking per §8.4
      // PII scrubber: strip tool_input/output from error contexts (§10.2)
      beforeSend(event) {
        if (event.extra) {
          delete event.extra['tool_input']
          delete event.extra['tool_response']
          delete event.extra['payload']
        }
        if (event.contexts) {
          const anyContexts = event.contexts as Record<string, unknown>
          for (const key of Object.keys(anyContexts)) {
            const ctx = anyContexts[key] as Record<string, unknown>
            if (ctx && typeof ctx === 'object') {
              delete ctx['tool_input']
              delete ctx['tool_response']
              delete ctx['payload']
            }
          }
        }
        return event
      },
      // Never capture breadcrumbs that might contain code snippets
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.category === 'console') {
          // Strip console.log messages which may inadvertently include payloads
          breadcrumb.message = breadcrumb.message ? '[redacted]' : breadcrumb.message
        }
        return breadcrumb
      },
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime (/api/v1/events lives here)
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? 'development',
      tracesSampleRate: 0.1,
      // Apply same PII scrubber on edge
      beforeSend(event) {
        if (event.extra) {
          delete event.extra['tool_input']
          delete event.extra['tool_response']
          delete event.extra['payload']
        }
        return event
      },
    })
  }
}
```

**Key constraint:** The `beforeSend` PII scrubber is required by §10.2. It must be tested manually: trigger an error in `/api/v1/events` while passing a body with `tool_input` containing dummy data; verify in Sentry that the `tool_input` key is absent from the error's extra context.

### 4. `apps/web/next.config.ts` — Sentry webpack plugin

Add the Sentry plugin to the Next.js build so source maps are uploaded for meaningful stack traces:

```typescript
// apps/web/next.config.ts
import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  // Disable browser source maps in production (§3.1 — no source exposure)
  productionBrowserSourceMaps: false,
  // ... existing config
}

export default withSentryConfig(nextConfig, {
  // Sentry org and project from sentry.io (match the project created in step 1)
  org: process.env.SENTRY_ORG ?? 'specops-black',
  project: process.env.SENTRY_PROJECT ?? 'pet-trainer-web',
  // Auth token for source map upload (SENTRY_AUTH_TOKEN env var)
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Suppress Sentry CLI output in build logs
  silent: !process.env.CI,
  // Upload source maps but do not include them in the browser bundle
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  // Automatically instrument `/api/v1/events` for performance traces
  autoInstrumentServerFunctions: true,
  // Tunnel Sentry requests through the Next.js server (avoids ad-blocker interference)
  tunnelRoute: '/monitoring',
})
```

### 5. `apps/web/app/layout.tsx` — Vercel Analytics

Add Vercel Analytics to the root layout. This is the minimal change — no props required:

```typescript
// Existing import block — add:
import { Analytics } from "@vercel/analytics/react";

// Inside the <body> in the layout's JSX, add before closing </body>:
<Analytics />
```

The `@vercel/analytics` package must be installed:

```bash
pnpm --filter @specops/web add @vercel/analytics
```

Vercel Analytics is activated by setting `NEXT_PUBLIC_VERCEL_ANALYTICS_ID` in the Vercel project environment variables (Vercel dashboard → Project Settings → Environment Variables). It is populated automatically by Vercel on deploy — no manual value needed; the dashboard step is to confirm the integration is enabled under the "Analytics" tab of the Vercel project.

### 6. Logflare log drain

Logflare cannot be configured via code — it requires manual steps in the Vercel dashboard. Document these in `docs/runbooks/deploy.md` (section below). Summary:

1. Create a Logflare account at `logflare.app`; create a Source named `pet-trainer-vercel-logs`
2. Copy the Logflare Source API key and Ingest URL
3. In Vercel dashboard → Project → Settings → Log Drains → Add Drain:
   - Delivery format: `JSON`
   - Endpoint URL: `https://api.logflare.app/logs/json?source=<source_id>&api_key=<api_key>`
   - Sources: `Build Logs`, `Lambda Logs`, `Edge Function Logs`, `Static Logs`
4. Vercel will start streaming logs to Logflare; set up a Supabase destination in Logflare for cold storage (Logflare → Source → Backends → Supabase)

### 7. `docs/runbooks/deploy.md`

The deployment runbook must cover every manual step in order. Structure:

```markdown
# Deployment Runbook — pet-trainer

## Prerequisites

- Vercel CLI installed and authenticated
- Supabase CLI installed
- pnpm 9+ installed
- Node.js 20+ installed
- Sentry account (specops-black org)
- Logflare account
- npm account with 2FA enabled (brunobracaioli)
- PyPI account with trusted publishing configured (see §publish)

## 1. Initial environment setup (one-time)

### 1.1 Vercel project

### 1.2 Supabase project

### 1.3 Upstash Redis

### 1.4 Sentry setup

- Create project: Next.js / pet-trainer-web
- Copy DSN to Vercel env vars: SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN
- Create auth token: SENTRY_AUTH_TOKEN
- Enable performance monitoring (tracesSampleRate: 0.1)
- Verify /api/v1/events appears in Sentry Performance after first real event

### 1.5 Logflare drain (exact steps from §6 above)

### 1.6 Vercel Analytics

- Vercel dashboard → Project → Analytics → Enable
- Confirm NEXT_PUBLIC_VERCEL_ANALYTICS_ID is auto-set

## 2. Vercel environment variables (full list)

| Variable                  | Runtime       | Description                        |
| ------------------------- | ------------- | ---------------------------------- |
| SUPABASE_URL              | Server        | Supabase project URL               |
| SUPABASE_SERVICE_ROLE_KEY | Server        | Service-role key for events insert |
| SUPABASE_ANON_KEY         | Server+Client | Anon key for client auth           |
| UPSTASH_REDIS_REST_URL    | Server        | Upstash Redis REST URL             |
| UPSTASH_REDIS_REST_TOKEN  | Server        | Upstash Redis REST token           |
| SENTRY_DSN                | Server        | Sentry DSN (server-side only)      |
| NEXT_PUBLIC_SENTRY_DSN    | Client        | Sentry DSN (browser)               |
| SENTRY_AUTH_TOKEN         | Build         | Source map upload token            |
| SENTRY_ORG                | Build         | Sentry org slug                    |
| SENTRY_PROJECT            | Build         | Sentry project slug                |

## 3. Deploy procedure (merge to main)

1. Ensure CI is green (all jobs pass on the PR)
2. Merge PR to main
3. GitHub Actions deploy.yml runs automatically:
   a. supabase db push (production migrations)
   b. vercel deploy --prod
   c. semantic-release (version bump + CHANGELOG + GitHub Release)
   d. npm publish + PyPI publish
   e. Sigstore cosign signing
   f. Smoke: npx @specops/pet-trainer@latest --version

## 4. Rollback procedure

- Vercel: Vercel dashboard → Deployments → previous deploy → Redeploy
- DB migrations: Cannot auto-rollback; apply reverse migration manually via supabase db execute
- npm: Cannot unpublish after 24h; publish a patch version with the fix

## 5. Quarterly secret rotation (§10.4)

Rotate every 3 months:

- [ ] Supabase service_role key: Supabase dashboard → Project Settings → API → Regenerate
- [ ] Upstash Redis token: Upstash console → Database → Reset token
- [ ] SENTRY_AUTH_TOKEN: Sentry → Settings → Auth Tokens → Revoke + Create
- [ ] npm automation token: npmjs.com → Access Tokens → Revoke + Create
- After rotation: update all Vercel env vars, re-deploy, verify smoke test passes
- Update rotation log in this runbook with date and operator name

## 6. Verifying observability is active

- Sentry: trigger test error via GET /api/v1/\_test-sentry (protected route, remove after verification)
- Logflare: check dashboard for log entries within 60s of a deploy
- Vercel Analytics: Vercel dashboard → Analytics → check page views after first visit
- P95 latency: Sentry → Performance → Transactions → /api/v1/events → check P95
```

### 8. `.env.example` additions

```bash
# Sentry
SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
NEXT_PUBLIC_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
SENTRY_AUTH_TOKEN=sntrys_your_token_here
SENTRY_ORG=your-sentry-org-slug
SENTRY_PROJECT=pet-trainer-web
```

## Files to create / modify

| Action | Path                                                     |
| ------ | -------------------------------------------------------- |
| Create | `apps/web/instrumentation.ts`                            |
| Modify | `apps/web/next.config.ts` — wrap with `withSentryConfig` |
| Modify | `apps/web/app/layout.tsx` — add `<Analytics />`          |
| Create | `docs/runbooks/deploy.md`                                |
| Modify | `.env.example` — add Sentry vars                         |

No database changes. No RLS changes.

## Verification

```bash
# 1. Build succeeds with Sentry plugin active
SENTRY_DSN="https://fake@o0.ingest.sentry.io/0" \
SENTRY_AUTH_TOKEN="fake" \
SENTRY_ORG="test" \
SENTRY_PROJECT="test" \
pnpm --filter @specops/web build
# Must complete without error (source map upload will fail with fake token — OK locally)

# 2. PII scrubber test (manual)
# In apps/web/app/api/v1/_test-sentry/route.ts (create temporarily):
#   throw new Error("test-sentry"); with extra: { tool_input: "SECRET CODE" }
# Verify in Sentry dashboard: error received, tool_input field ABSENT from extra context
# Delete the test route before merging

# 3. Vercel Analytics (post-deploy, manual)
# Visit https://vercel.com/specops-black/pet-trainer/analytics
# Trigger a page view; confirm it appears within 60 seconds

# 4. Logflare (post-drain-setup, manual)
# Trigger any server action; verify log entry appears in Logflare source dashboard

# 5. Sentry performance (manual, post-deploy)
# POST to /api/v1/events; check Sentry → Performance → Transactions → /api/v1/events
# P95 must be < 200ms (the latency budget from §8.4)

# 6. Env example is complete
grep 'SENTRY_DSN' .env.example && echo "Sentry vars present"
grep 'NEXT_PUBLIC_SENTRY_DSN' .env.example && echo "Client DSN present"

# 7. instrumentation.ts exists and imports Sentry
test -f apps/web/instrumentation.ts && grep -q '@sentry/nextjs' apps/web/instrumentation.ts

# 8. layout.tsx includes Analytics
grep -q 'Analytics' apps/web/app/layout.tsx
```

## Notes / Open questions

- The `/monitoring` Sentry tunnel route (configured in `withSentryConfig`) means Sentry network requests go through the Next.js server rather than directly to `sentry.io`. This prevents ad-blocker interference in users' browsers viewing the dashboard. This route must not be blocked by any Vercel middleware or auth guard.
- `productionBrowserSourceMaps: false` means stack traces from the browser will be minified. Server-side stack traces are unminified via the source map upload to Sentry. This is intentional — we do not want to serve source maps publicly from the CDN.
- If `SENTRY_AUTH_TOKEN` is not set at build time, `withSentryConfig` will log a warning but the build will succeed. Source maps will not be uploaded. This is acceptable locally; CI must have the token set.
- Vercel Analytics is zero-config once `@vercel/analytics` is installed and `<Analytics />` is in the layout. The `NEXT_PUBLIC_VERCEL_ANALYTICS_ID` is injected automatically by Vercel — no manual value needed. If it does not appear in the dashboard, check that the Analytics tab is enabled in the Vercel project settings.
- The Logflare → Supabase backend for cold storage provides the 90-day event retention required by §10.2. Confirm the Logflare TTL matches (90 days, then delete raw rows, keep aggregates). Document the TTL configuration in the runbook.
- Remove any temporary test routes (e.g., `/api/v1/_test-sentry`) before the production deploy in step 04-05.
