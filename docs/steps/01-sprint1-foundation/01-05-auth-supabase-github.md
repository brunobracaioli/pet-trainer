---
id: 01-05-auth-supabase-github
sprint: 1
order: 5
status: done
spec_refs: ['§6.1', '§8.2', '§3.1', '§10.1', '§10.4', '§13']
depends_on: [00-04-vercel-and-ci, 01-02-supabase-schema-and-rls]
deliverables:
  - supabase/config.toml
  - apps/web/app/api/v1/auth/cli/start/route.ts
  - apps/web/app/api/v1/auth/cli/poll/route.ts
  - apps/web/app/auth/cli/page.tsx
acceptance:
  - pnpm --filter @specops/web typecheck exits 0
  - POST /api/v1/auth/cli/start returns { device_code, verification_uri, expires_in } with HTTP 200
  - GET /auth/cli renders a page in the browser showing a device code and Authorize button
  - supabase/config.toml contains [auth.external.github] with env-var placeholders (no literal secrets)
  - apps/web/app/api/v1/auth/cli/start/route.ts does NOT export `runtime = 'edge'` (Node runtime required)
  - apps/web/app/api/v1/auth/cli/poll/route.ts does NOT export `runtime = 'edge'`
---

## Goal

Configure GitHub OAuth via Supabase Auth and implement the two CLI auth API endpoints (`/auth/cli/start` and `/auth/cli/poll`) so that `pet init` can complete the device code flow, receive a short-lived JWT, and store it locally without exposing secrets in any config file.

## Context

SPEC.md §6.1 describes the four-step init flow — step 1 is the device code auth. §8.2 lists both endpoints as Node runtime (not Edge) because the Supabase Admin SDK is not Edge-compatible. The browser page at `/auth/cli` is the human-facing component of the device flow: the user visits it after `pet init` opens their browser, sees their device code, clicks Authorize, and completes GitHub OAuth. The resulting Supabase session is stored in Redis under `auth:device:{code}` (§5.2 key pattern) until the CLI polls and retrieves it. JWT `exp` is 1 hour per §10.1 (replay mitigation); rotation is quarterly per §10.4.

## Implementation outline

- Update `supabase/config.toml` to add `[auth.external.github]` section with `enabled = true`, `client_id = "env(SUPABASE_AUTH_GITHUB_CLIENT_ID)"`, and `secret = "env(SUPABASE_AUTH_GITHUB_SECRET)"`. These env var references use Supabase's config.toml interpolation syntax — the actual values live in Vercel env vars and local `.env.local` (never committed). Confirm the redirect URL is `https://pet.specops.black/auth/callback` (or `http://localhost:3000/auth/callback` for local dev).
- Create `apps/web/app/api/v1/auth/cli/start/route.ts` as a Node runtime route handler (no `export const runtime` line — Node is the default in Next.js App Router). This handler: (1) generates a `device_code` via `crypto.randomUUID()`; (2) stores it in Redis as `redis.set('auth:device:{device_code}', 'pending', { ex: 600 })` (10-minute TTL per §5.2); (3) builds `verification_uri = 'https://pet.specops.black/auth/cli?code={device_code}'`; (4) returns `{ device_code, verification_uri, expires_in: 600 }`. No auth required on this endpoint (it initiates the flow), but apply rate-limiting using `rl:cli:{ip}` key (§5.2) to prevent device code flooding.
- Create `apps/web/app/api/v1/auth/cli/poll/route.ts` as a Node runtime POST handler. Request body: `{ device_code: string }`. Logic: (1) validate body with Zod (`z.object({ device_code: z.string().uuid() })`); (2) look up `redis.get('auth:device:{device_code}')`; (3) if the value is `'pending'`, return `{ status: 'pending' }` with HTTP 202 — the CLI retries in 5 seconds; (4) if the value is a Supabase session JSON, exchange it for a fresh JWT using the Supabase Admin SDK (`supabaseAdmin.auth.admin.createSession({ ... })`), delete the Redis key, and return `{ status: 'complete', token: jwt, expires_in: 3600 }`; (5) if the Redis key is missing (expired), return `{ status: 'expired' }` with HTTP 410. The JWT returned is the Supabase access token with `exp` set to 1 hour (§10.1).
- Create `apps/web/app/auth/cli/page.tsx` as a Client Component (`'use client'`). It reads the `code` query param from the URL, displays it prominently as the device code, shows a "Connect with GitHub" button that triggers `supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: '/auth/cli/callback?code={code}' } })`. After successful OAuth, a callback route or the page itself calls an internal API to store the session in Redis under `auth:device:{code}`. The page must be minimal and accessible — no complex UI; focus on the authorization action.
- Create `apps/web/app/auth/cli/callback/route.ts` as a Node runtime route handler that handles the OAuth redirect from GitHub. It exchanges the code from Supabase Auth, retrieves the user session, stores the session as JSON in Redis under `auth:device:{device_code}` (overwriting `'pending'`), and redirects to `/auth/cli/success` with a simple "You're connected! Return to your terminal." message.
- Add `SUPABASE_AUTH_GITHUB_CLIENT_ID` and `SUPABASE_AUTH_GITHUB_SECRET` to `docs/runbooks/deploy.md` secrets inventory (not to any `.env` file committed to the repo).

## Files to create / modify

| Path                                          | Action | Notes                                                                                   |
| --------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `supabase/config.toml`                        | edit   | Add `[auth.external.github]` block with env-var placeholders                            |
| `apps/web/app/api/v1/auth/cli/start/route.ts` | create | Node runtime; generates device_code, stores in Redis, returns verification_uri          |
| `apps/web/app/api/v1/auth/cli/poll/route.ts`  | create | Node runtime; polls Redis for completed OAuth; returns JWT when ready                   |
| `apps/web/app/auth/cli/page.tsx`              | create | Client component; shows device code + GitHub OAuth button                               |
| `apps/web/app/auth/cli/callback/route.ts`     | create | Node runtime; handles OAuth redirect, stores session in Redis                           |
| `apps/web/app/auth/cli/success/page.tsx`      | create | Static page: "Connected! Return to your terminal."                                      |
| `docs/runbooks/deploy.md`                     | edit   | Add SUPABASE_AUTH_GITHUB_CLIENT_ID and SUPABASE_AUTH_GITHUB_SECRET to secrets inventory |

## Verification

```bash
# Typecheck clean
pnpm --filter @specops/web typecheck

# Confirm Node runtime (no edge export)
grep "runtime" apps/web/app/api/v1/auth/cli/start/route.ts && echo "WARN: check runtime" || echo "OK: default Node runtime"
grep "runtime" apps/web/app/api/v1/auth/cli/poll/route.ts && echo "WARN: check runtime" || echo "OK: default Node runtime"

# Confirm no secrets in config.toml
grep -E "(client_id|secret)\s*=" supabase/config.toml
# Expected output must only show env() references, never literal strings

# Integration: start flow returns device_code
curl -s -X POST http://localhost:3000/api/v1/auth/cli/start \
  -H "Content-Type: application/json" | jq .
# Expected: { "device_code": "<uuid>", "verification_uri": "http://localhost:3000/auth/cli?code=<uuid>", "expires_in": 600 }

# Poll before auth completes returns pending
DEVICE_CODE=$(curl -s -X POST http://localhost:3000/api/v1/auth/cli/start | jq -r .device_code)
curl -s -X POST http://localhost:3000/api/v1/auth/cli/poll \
  -H "Content-Type: application/json" \
  -d "{\"device_code\":\"$DEVICE_CODE\"}" | jq .
# Expected: { "status": "pending" }

# Browser: navigate to http://localhost:3000/auth/cli?code=$DEVICE_CODE
# Expected: page shows the device code and a "Connect with GitHub" button
```

## Notes / Open questions

- §13 Q2 (username): for now, username defaults to `github_login` from the OAuth profile. The `profiles` table insert (triggered by Supabase Auth `on_auth_user_created` hook) sets `username = github_login` and `github_login = github_login`. Explicitly document this as a Q2 limitation in a code comment in the callback route.
- §13 Q5 (devcontainer): `pet init` opens the browser via `open` (npm package). Inside a devcontainer, `open` may fail silently — `pet init` should print the `verification_uri` to stdout with the message "Visit the URL in your browser:" as a fallback. This is a CLI concern (step 01-06), not an API concern — flag it in step 01-06 notes.
- The Supabase Admin SDK (`@supabase/supabase-js` with service role key) is used in the poll and callback routes. It must never run in an Edge Function context. The absence of `export const runtime = 'edge'` is intentional and critical — do not add it.
- Rate-limiting on `/auth/cli/start`: use `rl:cli:{ip}` counter (§5.2), max 10 requests per 60 seconds per IP. This prevents device code enumeration attacks where an attacker generates thousands of codes hoping a victim visits one.
- The Redis key for a completed auth session stores the full Supabase session object. This is sensitive data — the 10-minute TTL (`ex: 600`) on `start`, shortened to immediate deletion on `poll` success, limits the exposure window. Never log the session JSON value.
- JWT `exp` is 1 hour (3600 seconds) per §10.1. The CLI (step 01-06) must store the expiry timestamp alongside the token in `~/.pet-trainer/credentials.json` and prompt re-auth proactively before expiry, not on first 401 response.
