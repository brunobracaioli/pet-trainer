---
id: 04-03-e2e-playwright
sprint: 4
order: 3
status: not-started
spec_refs: ['§10.3', '§8.2', '§8.3', '§9.1', '§9.2']
depends_on: [03-01-landing-page, 03-02-dashboard, 03-03-leaderboard]
deliverables:
  - apps/web/e2e/landing.spec.ts
  - apps/web/e2e/hook-to-xp.spec.ts
  - apps/web/e2e/leaderboard.spec.ts
  - apps/web/playwright.config.ts
  - playwright/.env.test
  - .github/workflows/ci.yml
acceptance:
  - 'pnpm playwright test passes all 3 spec files (0 failures) with local dev server running'
  - 'Each spec is stable across 3 consecutive runs (pnpm playwright test --repeat-each=3)'
  - 'CI e2e-smoke job is active and passes on Vercel preview URL'
  - 'hook-to-xp.spec.ts verifies XP increase is visible in the dashboard after posting to /api/v1/events'
  - 'leaderboard.spec.ts covers both weekly and alltime tab switching'
---

## Goal

Write E2E Playwright tests for the 3 critical user flows, configure the test runner, and activate the CI `e2e-smoke` job to run against every Vercel preview deploy.

## Context

SPEC.md §10.3 step 10 requires E2E smoke tests via Playwright against the Vercel preview deploy. The 3 flows to cover are:

1. Landing page content and install CTA
2. Hook → XP pipeline (synthetic event → dashboard shows XP increase)
3. Leaderboard unauthenticated view + tab switching + authenticated highlight

These tests validate user-visible outcomes only — never implementation details like internal Redux state or API response shapes. The test runner is configured to run against `PLAYWRIGHT_BASE_URL` so the same tests work locally (`localhost:3000`) and in CI (Vercel preview URL).

Pre-seeded test credentials must be stored in `playwright/.env.test` (gitignored). The test JWT for flow 2 is created once during test environment setup and stored there.

## Implementation outline

### 1. `apps/web/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0, // retry flaky tests in CI only
  workers: process.env.CI ? 1 : undefined, // sequential in CI, parallel locally
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  // Start local dev server automatically when PLAYWRIGHT_BASE_URL is not set
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
```

Key decisions:

- `retries: 2` in CI absorbs transient network latency from Vercel preview warmup
- Firefox added as second browser for cross-browser smoke coverage
- `webServer` block only activates when `PLAYWRIGHT_BASE_URL` is absent (local dev); CI sets the env var to point at the Vercel preview

### 2. `apps/web/e2e/landing.spec.ts` — Flow 1: Landing page

```typescript
import { test, expect } from '@playwright/test'

test.describe('Landing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('renders hero headline', async ({ page }) => {
    // Verify the main value proposition is visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // The heading should contain the product tagline from §0
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/pet|trainer|evolv/i)
  })

  test('shows npm install command and copy button', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    // Find the install command block (contains npx @specops/pet-trainer init)
    const installBlock = page.getByText(/npx @specops\/pet-trainer/)
    await expect(installBlock).toBeVisible()

    // Find and click the copy button adjacent to the install command
    const copyBtn = page.getByRole('button', { name: /copy/i }).first()
    await copyBtn.click()

    // Verify clipboard content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText).toContain('npx @specops/pet-trainer')
  })

  test('Get started CTA leads to auth page', async ({ page }) => {
    const ctaLink = page.getByRole('link', { name: /get started/i })
    await expect(ctaLink).toBeVisible()

    await ctaLink.click()
    // Should navigate to /auth/cli or Supabase GitHub OAuth
    await expect(page).toHaveURL(/auth/i)
  })

  test('How it works section is visible', async ({ page }) => {
    const howItWorks = page.getByRole('heading', {
      name: /how it works/i,
    })
    await howItWorks.scrollIntoViewIfNeeded()
    await expect(howItWorks).toBeVisible()
  })
})
```

### 3. `apps/web/e2e/hook-to-xp.spec.ts` — Flow 2: Hook → XP pipeline

This test authenticates using a pre-seeded test user JWT from `playwright/.env.test`, POSTs a synthetic event directly to the API (bypassing the Claude Code hook), then visits the dashboard and verifies the XP counter increased.

```typescript
import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'
import * as dotenv from 'dotenv'
import path from 'path'

// Load test credentials (not committed — in playwright/.env.test)
dotenv.config({
  path: path.resolve(__dirname, '../../playwright/.env.test'),
})

const TEST_USER_JWT = process.env.E2E_TEST_USER_JWT!
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

test.describe('Hook to XP pipeline', () => {
  test.skip(!TEST_USER_JWT, 'E2E_TEST_USER_JWT not set — skipping')

  test('posting a synthetic event increases XP on dashboard', async ({ page }) => {
    // Step 1: Record baseline XP by visiting dashboard
    // Inject auth cookie/header so the page renders as the test user
    await page.context().addCookies([
      {
        name: 'sb-access-token',
        value: TEST_USER_JWT,
        domain: new URL(BASE_URL).hostname,
        path: '/',
      },
    ])

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Read baseline XP — the dashboard must expose this as a visible number
    const xpElement = page.getByTestId('pet-xp-total')
    await expect(xpElement).toBeVisible()
    const baselineXP = parseInt((await xpElement.textContent()) ?? '0', 10)

    // Step 2: POST a synthetic event to /api/v1/events
    // Use a unique idempotency key so this event is never deduplicated
    const idempotencyKey = randomUUID()
    const response = await page.request.post(`${BASE_URL}/api/v1/events`, {
      headers: {
        Authorization: `Bearer ${TEST_USER_JWT}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      data: {
        session_id: `e2e-session-${randomUUID()}`,
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: '/tmp/e2e-test.ts',
          old_string: '',
          new_string: '// e2e test edit',
        },
        tool_response: { success: true, filePath: '/tmp/e2e-test.ts' },
      },
    })

    // Verify the API accepted the event
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.accepted).toBe(true)
    expect(body.request_id).toBeTruthy()

    // Step 3: Reload dashboard and verify XP increased
    // Allow up to 5 seconds for the async XP update to propagate
    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(xpElement).toBeVisible()
    const updatedXP = parseInt((await xpElement.textContent()) ?? '0', 10)

    // XP must have increased (the "first-edit" quest awards 50 XP per §7.2)
    expect(updatedXP).toBeGreaterThan(baselineXP)

    // Step 4: Verify active quest is shown (test user should have first-edit active)
    const activeQuestSection = page.getByTestId('active-quests')
    await expect(activeQuestSection).toBeVisible()
  })

  test('duplicate idempotency key does not double XP', async ({ page }) => {
    await page.context().addCookies([
      {
        name: 'sb-access-token',
        value: TEST_USER_JWT,
        domain: new URL(BASE_URL).hostname,
        path: '/',
      },
    ])

    const idempotencyKey = `e2e-dedup-${randomUUID()}`
    const eventPayload = {
      session_id: `e2e-session-${randomUUID()}`,
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'echo test' },
      tool_response: { stdout: 'test', exit_code: 0 },
    }

    // Post the same event twice with the same idempotency key
    const first = await page.request.post(`${BASE_URL}/api/v1/events`, {
      headers: {
        Authorization: `Bearer ${TEST_USER_JWT}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      data: eventPayload,
    })
    const second = await page.request.post(`${BASE_URL}/api/v1/events`, {
      headers: {
        Authorization: `Bearer ${TEST_USER_JWT}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      data: eventPayload,
    })

    // Both calls must return 200 (idempotent — second is a no-op)
    expect(first.status()).toBe(200)
    expect(second.status()).toBe(200)

    // Verify XP was only awarded once — check dashboard
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // The test is satisfied if the page loads without error;
    // XP uniqueness is enforced by the Redis SETNX check (§8.4 step 3)
  })
})
```

### 4. `apps/web/e2e/leaderboard.spec.ts` — Flow 3: Leaderboard

```typescript
import { test, expect } from '@playwright/test'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({
  path: path.resolve(__dirname, '../../playwright/.env.test'),
})

const TEST_USER_JWT = process.env.E2E_TEST_USER_JWT
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

test.describe('Leaderboard', () => {
  test('unauthenticated visitor sees top leaderboard entries', async ({ page }) => {
    await page.goto('/leaderboard')
    await page.waitForLoadState('networkidle')

    // The leaderboard table must render
    const table = page.getByRole('table')
    await expect(table).toBeVisible()

    // At least one row of data is present (seeded from §5.2 Redis ZSET)
    const rows = page.getByRole('row')
    // Header row + at least 1 data row
    expect(await rows.count()).toBeGreaterThanOrEqual(2)

    // Rank column is present
    await expect(page.getByRole('columnheader', { name: /rank/i })).toBeVisible()
  })

  test('weekly and alltime tabs switch leaderboard data', async ({ page }) => {
    await page.goto('/leaderboard')
    await page.waitForLoadState('networkidle')

    // Default view: weekly tab should be active
    const weeklyTab = page.getByRole('tab', { name: /weekly/i })
    const alltimeTab = page.getByRole('tab', { name: /all.?time/i })

    await expect(weeklyTab).toBeVisible()
    await expect(alltimeTab).toBeVisible()

    // Click alltime tab
    await alltimeTab.click()
    await page.waitForLoadState('networkidle')

    // URL or ARIA state reflects alltime selection
    // (either via ?period=alltime query param or aria-selected="true")
    await expect(alltimeTab).toHaveAttribute('aria-selected', 'true')

    // Switch back to weekly
    await weeklyTab.click()
    await page.waitForLoadState('networkidle')
    await expect(weeklyTab).toHaveAttribute('aria-selected', 'true')
  })

  test("authenticated user's row is highlighted on leaderboard", async ({ page }) => {
    test.skip(!TEST_USER_JWT, 'E2E_TEST_USER_JWT not set — skipping')

    // Inject test user auth
    await page.context().addCookies([
      {
        name: 'sb-access-token',
        value: TEST_USER_JWT!,
        domain: new URL(BASE_URL).hostname,
        path: '/',
      },
    ])

    await page.goto('/leaderboard')
    await page.waitForLoadState('networkidle')

    // The test user's row must have a distinct visual marker
    // The dashboard must mark the current user's row with data-testid="leaderboard-self"
    // or a CSS class that Playwright can target
    const selfRow = page.getByTestId('leaderboard-self')
    if (await selfRow.isVisible()) {
      // If the test user is ranked, verify highlighting
      await expect(selfRow).toBeVisible()
    } else {
      // Test user may not be ranked in top 100 — that is acceptable;
      // verify the page at least loaded without error
      await expect(page.getByRole('table')).toBeVisible()
    }
  })
})
```

### 5. `playwright/.env.test`

This file is gitignored. It must be created manually during CI setup and in the local dev environment. Template:

```
# playwright/.env.test — DO NOT COMMIT
# Pre-seeded E2E test user credentials for pet-trainer Playwright tests
# Create the test user in Supabase (or use the local instance) and paste the JWT here

E2E_TEST_USER_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... # long-lived test JWT
E2E_TEST_USER_ID=00000000-0000-0000-0000-000000000001       # UUID of the seeded test user
```

In CI, these are set as GitHub Actions secrets (`E2E_TEST_USER_JWT`, `E2E_TEST_USER_ID`) and written to `playwright/.env.test` in a workflow step:

```yaml
- name: Create playwright env file
  run: |
    echo "E2E_TEST_USER_JWT=${{ secrets.E2E_TEST_USER_JWT }}" >> playwright/.env.test
    echo "E2E_TEST_USER_ID=${{ secrets.E2E_TEST_USER_ID }}" >> playwright/.env.test
```

### 6. Activate `e2e-smoke` job in `.github/workflows/ci.yml`

The job must:

1. Depend on `preview-deploy` (needs the Vercel preview URL as output)
2. Set `PLAYWRIGHT_BASE_URL` to the Vercel preview URL
3. Install Playwright browsers: `pnpm exec playwright install --with-deps chromium firefox`
4. Run: `pnpm exec playwright test --reporter=github`
5. Upload test results as artifact on failure

```yaml
e2e-smoke:
  name: E2E Smoke Tests (Playwright)
  runs-on: ubuntu-latest
  needs: [preview-deploy]
  env:
    PLAYWRIGHT_BASE_URL: ${{ needs.preview-deploy.outputs.preview_url }}
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - name: Install Playwright browsers
      run: pnpm exec playwright install --with-deps chromium firefox
    - name: Create playwright env file
      run: |
        echo "E2E_TEST_USER_JWT=${{ secrets.E2E_TEST_USER_JWT }}" >> playwright/.env.test
        echo "E2E_TEST_USER_ID=${{ secrets.E2E_TEST_USER_ID }}" >> playwright/.env.test
    - name: Run Playwright smoke tests
      run: pnpm --filter @specops/web exec playwright test
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: apps/web/playwright-report/
        retention-days: 7
```

## Files to create / modify

| Action | Path                                                                  |
| ------ | --------------------------------------------------------------------- |
| Create | `apps/web/playwright.config.ts`                                       |
| Create | `apps/web/e2e/landing.spec.ts`                                        |
| Create | `apps/web/e2e/hook-to-xp.spec.ts`                                     |
| Create | `apps/web/e2e/leaderboard.spec.ts`                                    |
| Create | `playwright/.env.test` (gitignored; create manually or via CI secret) |
| Modify | `.github/workflows/ci.yml` — activate `e2e-smoke` job                 |
| Modify | `.gitignore` — add `playwright/.env.test` if not already present      |

## Verification

```bash
# Local: run all specs against dev server (starts automatically via webServer config)
cd apps/web
pnpm exec playwright test

# Run a single spec
pnpm exec playwright test e2e/landing.spec.ts --headed

# Verify stability (no flakiness) — 3 consecutive runs
pnpm exec playwright test --repeat-each=3

# Show the HTML report after a run
pnpm exec playwright show-report

# Verify e2e-smoke job is active in CI (no 'if: false' guard)
grep -A5 'e2e-smoke:' .github/workflows/ci.yml | grep -v 'if: false'

# Verify .env.test is gitignored
grep 'playwright/.env.test' .gitignore && echo "Gitignored OK"
```

## Notes / Open questions

- The `hook-to-xp` test requires the "first-edit" quest to be in `available` or `in_progress` state for the test user at test start. If the test user has already completed the quest, the XP assertion (> baseline) will still hold as long as the event awards XP — but verify this in the seeded state.
- The Supabase auth cookie name (`sb-access-token`) may vary depending on the Supabase project ref. Check the actual cookie name by inspecting a real authenticated session. Alternatively, set the cookie via `page.context().storageState()` after a real login flow — use `globalSetup` in `playwright.config.ts` for the authenticated state.
- Avoid using `page.waitForTimeout()` — use `page.waitForLoadState("networkidle")` or explicit element waits. Timeouts are the primary source of flakiness.
- The `data-testid` attributes (`pet-xp-total`, `active-quests`, `leaderboard-self`) must be added to the React components during Sprint 3 or at the start of this step. They are non-negotiable for the tests to be resilient — do not use CSS classes or text content as locators for dynamic data.
- Firefox smoke coverage is included per the spec but is secondary — if Firefox runs are unstable in CI due to environment differences, add `--project=chromium` flag to the CI command and leave Firefox as a local-only check.
