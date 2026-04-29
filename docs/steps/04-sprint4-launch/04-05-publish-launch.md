---
id: 04-05-publish-launch
sprint: 4
order: 5
status: not-started
spec_refs: ['§10.3', '§10.4', '§12', '§3.1', '§6.1']
depends_on:
  - 04-01-threat-model
  - 04-02-rls-pgtap-tests
  - 04-03-e2e-playwright
  - 04-04-observability
deliverables:
  - .github/workflows/deploy.yml
  - apps/cli/release.config.cjs
  - apps/cli/pyproject.toml
  - apps/cli/pet_trainer/__init__.py
  - docs/runbooks/incident-response.md
acceptance:
  - 'npm install -g @specops/pet-trainer && pet --version returns the expected semver from a clean environment'
  - 'pip install pet-trainer && pet-trainer --version returns the same semver'
  - 'GitHub Release exists with CHANGELOG and signed artifact attestations'
  - 'cosign verify passes on both the npm tarball and PyPI wheel'
  - 'docs/runbooks/incident-response.md exists and covers rollback, hotfix, and notification steps'
  - 'All 4 predecessor steps (04-01 through 04-04) have status: done before this step starts'
---

## Goal

Execute the production deploy pipeline: publish `@specops/pet-trainer` to npm and `pet-trainer` to PyPI with provenance and Sigstore signing, deploy the Next.js app to production, and run the launch communications checklist.

## Context

This is the final step of Sprint 4 and the entire MVP. All security hardening (04-01), RLS testing (04-02), E2E tests (04-03), and observability (04-04) must be complete and green before this step runs. The deploy.yml workflow executes automatically on merge to main — this step spec describes how to wire it and what to verify.

Per §10.4: npm 2FA is required for publish. Semantic-release determines versions from conventional commits — all Sprint 4 commits must follow the `feat:` / `fix:` / `chore:` convention or version bumps will be missed. The Python wrapper shells out to the Node CLI and must not bundle any Node.js runtime.

## Implementation outline

### 1. `.github/workflows/deploy.yml` — Full activation

The deploy workflow runs on `push` to `main` only (not on PRs). All jobs listed in §10.3 must be active. Structure:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

concurrency:
  group: deploy-production
  update: true # Cancel in-progress deploy if a new commit arrives

jobs:
  # ─── Job 1: DB migrations ──────────────────────────────────────────
  migrate:
    name: Supabase DB Push (production)
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Link to production project
        run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      - name: Push migrations
        run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}

  # ─── Job 2: Vercel production deploy ───────────────────────────────
  deploy-web:
    name: Vercel Deploy (production)
    runs-on: ubuntu-latest
    needs: [migrate]
    environment: production
    outputs:
      deployment_url: ${{ steps.deploy.outputs.url }}
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Vercel production
        id: deploy
        run: |
          url=$(vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }} \
            --scope=${{ secrets.VERCEL_ORG_ID }})
          echo "url=$url" >> $GITHUB_OUTPUT
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

  # ─── Job 3 + 4 + 5: semantic-release → npm + PyPI + Sigstore ──────
  publish-cli:
    name: Publish CLI (npm + PyPI + Sigstore)
    runs-on: ubuntu-latest
    needs: [deploy-web]
    environment: production
    permissions:
      contents: write # GitHub Release creation
      id-token: write # OIDC for npm provenance + PyPI trusted publishing + Sigstore
      packages: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # semantic-release needs full git history
          token: ${{ secrets.GH_TOKEN }}
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
          cache: pnpm
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pnpm install --frozen-lockfile

      # Step 3a: semantic-release (version bump + CHANGELOG + GitHub Release + npm publish)
      - name: Semantic Release
        run: pnpm --filter @specops/pet-trainer exec semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GH_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}

      # Step 3b: Build and publish Python wrapper to PyPI via OIDC trusted publishing
      - name: Build Python package
        run: |
          cd apps/cli
          pip install build
          python -m build
      - name: Publish to PyPI (OIDC trusted publishing — no API token needed)
        uses: pypa/gh-action-pypi-publish@release/v1
        with:
          packages-dir: apps/cli/dist/
          # OIDC trusted publishing requires PyPI to be pre-configured with:
          # Publisher: GitHub Actions, owner: brunobracaioli, repo: pet-trainer,
          # workflow: deploy.yml, environment: production

      # Step 3c: Sigstore cosign signing on both artifacts
      - name: Install cosign
        uses: sigstore/cosign-installer@v3
      - name: Sign npm artifact with Sigstore
        run: |
          # npm publish with --provenance flag (done by semantic-release plugin)
          # Additionally sign the tarball for cosign verify
          npm pack --pack-destination ./dist-npm 2>/dev/null || true
          ls ./dist-npm/*.tgz | xargs -I{} cosign sign-blob \
            --yes \
            --output-signature {}.sig \
            --output-certificate {}.pem \
            {}
      - name: Sign PyPI wheel with Sigstore
        run: |
          ls apps/cli/dist/*.whl | xargs -I{} cosign sign-blob \
            --yes \
            --output-signature {}.sig \
            --output-certificate {}.pem \
            {}
      - name: Attach signed artifacts to GitHub Release
        env:
          GITHUB_TOKEN: ${{ secrets.GH_TOKEN }}
        run: |
          TAG=$(git describe --tags --abbrev=0)
          gh release upload "$TAG" ./dist-npm/*.tgz.sig ./dist-npm/*.tgz.pem \
            apps/cli/dist/*.whl.sig apps/cli/dist/*.whl.pem || true

  # ─── Job 5: Production smoke test ──────────────────────────────────
  smoke-prod:
    name: Production Smoke Test
    runs-on: ubuntu-latest
    needs: [publish-cli, deploy-web]
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Smoke test npm package
        run: |
          npx @specops/pet-trainer@latest --version
          # Must print the semver that semantic-release just published
      - name: Smoke test web (HTTP 200 on landing)
        run: |
          URL=${{ needs.deploy-web.outputs.deployment_url }}
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
          test "$STATUS" = "200" && echo "Landing page OK" || exit 1
      - name: Smoke test /api/v1/events endpoint availability
        run: |
          URL=${{ needs.deploy-web.outputs.deployment_url }}
          # Unauthenticated → expect 401, not 500
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST "$URL/api/v1/events" \
            -H "Content-Type: application/json" \
            -d '{}')
          test "$STATUS" = "401" && echo "/events auth gate OK" || exit 1
```

### 2. `apps/cli/release.config.cjs` — Semantic-release configuration

```javascript
// apps/cli/release.config.cjs
// semantic-release configuration for @specops/pet-trainer (npm CLI)

module.exports = {
  branches: ['main'],
  plugins: [
    // Analyze commits to determine version bump type
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { type: 'feat', release: 'minor' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'chore', scope: 'deps', release: 'patch' },
          // Breaking changes (footer "BREAKING CHANGE:" or type "feat!") → major
        ],
      },
    ],
    // Generate CHANGELOG from commits
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    // Write/update CHANGELOG.md in apps/cli/
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    // Publish to npm with provenance (requires npm 9.5+ and OIDC token)
    [
      '@semantic-release/npm',
      {
        npmPublish: true,
        pkgRoot: '.', // apps/cli/ is the cwd during release
        // --provenance flag is set via .npmrc or npm config
      },
    ],
    // Create GitHub Release with CHANGELOG as body
    [
      '@semantic-release/github',
      {
        assets: [{ path: 'dist/*.tgz', label: 'npm tarball' }],
      },
    ],
    // Commit updated package.json + CHANGELOG back to main
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'CHANGELOG.md'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
}
```

Install required packages in `apps/cli`:

```bash
pnpm --filter @specops/pet-trainer add -D \
  semantic-release \
  @semantic-release/commit-analyzer \
  @semantic-release/release-notes-generator \
  @semantic-release/changelog \
  @semantic-release/npm \
  @semantic-release/github \
  @semantic-release/git \
  conventional-changelog-conventionalcommits
```

Add to `apps/cli/package.json`:

```json
{
  "publishConfig": {
    "provenance": true,
    "access": "public"
  }
}
```

### 3. `apps/cli/pyproject.toml` — Python wrapper package

The Python package `pet-trainer` is a thin wrapper — it installs no Python business logic, only an entry point that shells out to the Node CLI. It requires Node.js 20+ to be installed on the user's machine.

```toml
[build-system]
requires = ["setuptools>=70", "wheel"]
build-backend = "setuptools.backends.legacy:build"

[project]
name = "pet-trainer"
dynamic = ["version"]  # version is read from apps/cli/package.json at build time
description = "Terminal Tamagotchi that gamifies learning Claude Code"
readme = "README.md"
license = {text = "MIT"}
authors = [
  {name = "Bruno Bracaioli", email = "brunobracaioli@gmail.com"}
]
requires-python = ">=3.8"
dependencies = []  # No Python dependencies — Node.js 20+ required on the system

[project.scripts]
pet-trainer = "pet_trainer:main"

[project.urls]
Homepage = "https://pet.specops.black"
Repository = "https://github.com/brunobracaioli/pet-trainer"
Documentation = "https://pet.specops.black/docs"

[tool.setuptools.dynamic]
version = {file = "VERSION"}  # Written by build script from package.json version

[tool.setuptools.packages.find]
where = ["."]
include = ["pet_trainer*"]
```

Add a build script `apps/cli/scripts/sync-version.sh` to sync the version from `package.json` into `VERSION` and `pet_trainer/__init__.py`:

```bash
#!/usr/bin/env bash
# apps/cli/scripts/sync-version.sh
# Sync version from package.json to Python package files

VERSION=$(node -e "console.log(require('./package.json').version)")

echo "$VERSION" > VERSION
echo "# Auto-generated. Do not edit." > pet_trainer/__init__.py
echo "__version__ = \"$VERSION\"" >> pet_trainer/__init__.py
```

This script is called in the `Build Python package` CI step before `python -m build`.

### 4. `apps/cli/pet_trainer/__init__.py` — Python shim

```python
"""
pet-trainer Python wrapper.
Shells out to the @specops/pet-trainer Node.js CLI.
Requires Node.js 20+ to be installed on the system.
"""

import subprocess
import sys


def main() -> None:
    """Entry point: delegate all arguments to the Node.js CLI via npx."""
    result = subprocess.run(
        ["npx", "--yes", "@specops/pet-trainer", *sys.argv[1:]],
        check=False,  # Do not raise — pass the exit code through
    )
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
```

Important constraints:

- `--yes` flag on `npx` silently installs the package if not cached — required for a smooth `pip install pet-trainer && pet-trainer init` experience.
- The wrapper does NOT bundle or install Node.js. If Node.js is not found, `npx` will print a helpful error. The README and `pet init` output must note this requirement.
- `sys.argv[1:]` passes all CLI arguments through unchanged, including flags like `--version`, `--telemetry`, and subcommands.

### 5. npm 2FA and automation token

npm 2FA is required (§10.4). For CI/CD, use an **automation token** (bypasses OTP while still enforcing 2FA on the account):

1. `npmjs.com` → Avatar → Access Tokens → Generate New Token → Automation
2. Add as `NPM_TOKEN` GitHub Actions secret in the `production` environment
3. The token must have `Publish` scope on `@specops` org

Verify 2FA status: `npm profile get` → `two-factor auth` must show `auth-and-writes`.

Document this in the runbook under "Quarterly secret rotation."

### 6. PyPI OIDC trusted publishing setup (one-time)

Before the first publish, configure PyPI to trust the GitHub Actions workflow:

1. `pypi.org` → Account → Publishing → Add a new publisher
2. Fill in:
   - PyPI project name: `pet-trainer`
   - Owner: `brunobracaioli`
   - Repository: `pet-trainer`
   - Workflow filename: `deploy.yml`
   - Environment name: `production`
3. After setup, `pypa/gh-action-pypi-publish` will publish without an API token — OIDC JWT is exchanged automatically.

### 7. `docs/runbooks/incident-response.md`

```markdown
# Incident Response Runbook — pet-trainer

## Severity levels

| Level | Example                                   | Response time |
| ----- | ----------------------------------------- | ------------- |
| P0    | /events endpoint down, blocking all hooks | 30 min        |
| P1    | XP not crediting, quests not completing   | 2 hours       |
| P2    | Leaderboard stale, dashboard slow         | 8 hours       |
| P3    | Minor UI bug, non-critical typo           | Next sprint   |

## Who to notify (P0/P1)

- Owner: Bruno Bracaioli (brunobracaioli@gmail.com)
- Status page: update pet.specops.black/status (manual post in Vercel)
- User communication: post in project GitHub Discussions if > 1 hour downtime

## Rollback procedures

### Web app rollback

1. Vercel dashboard → pet-trainer project → Deployments
2. Identify the last working deployment (green checkmark)
3. Click → Promote to Production
4. Verify: curl https://pet.specops.black/api/v1/events → should return 401 (not 500)

### DB migration rollback

Supabase does not support automatic migration rollback.

1. Identify the problematic migration file in supabase/migrations/
2. Write a reverse migration SQL file
3. Apply via: supabase db execute --remote --file reverse-migration.sql
4. Verify data integrity after applying

### npm package rollback

npm does not support true unpublish after 24 hours.

1. Publish a patch version with the fix immediately: bump version, push commit
2. If the published version is dangerous, use `npm deprecate @specops/pet-trainer@<version> "message"` to warn users

### PyPI package rollback

1. Yank the bad version: `twine check` + `twine upload --skip-existing`
2. Use PyPI's "yank" feature (pypi.org → project → release → Yank release)
   Yanked versions are hidden but still installable with pinned versions — prevents silent adoption of the bad release

## Hotfix process

1. Branch off main: git checkout -b hotfix/issue-description
2. Apply the minimal fix (Boy Scout Rule — do not refactor while fixing)
3. Run: pnpm typecheck && pnpm vitest run && pnpm --filter @specops/web build
4. Open PR → CI must pass (all jobs including RLS tests)
5. Merge → deploy.yml triggers automatically
6. Verify smoke tests pass in deploy.yml output
7. Confirm fix in production: repeat the failing scenario manually

## Post-incident review

Within 48 hours of any P0/P1 incident:

- Write a brief post-mortem in docs/postmortems/ (blameless format: what happened, timeline, impact, root cause, action items)
- If root cause is a new threat not in the threat model, add it to docs/architecture/threat-model.md and create a pentest case

## Monitoring links

- Sentry: https://sentry.io/organizations/specops-black/issues/
- Vercel logs: https://vercel.com/specops-black/pet-trainer/logs
- Logflare: https://logflare.app/sources/<source-id>
- Supabase logs: https://supabase.com/dashboard/project/<ref>/logs
- Upstash: https://console.upstash.com
```

### 8. Launch communications checklist

Execute after the production smoke test passes. This is a manual checklist — no automation.

- [ ] **Instagram (@brunobracaioli):** Post demo video/GIF of terminal Tamagotchi evolving. Caption: tagline from §0 + install command. Stories: step-by-step `pet init` flow.
- [ ] **Reddit r/ClaudeAI:** Post title: "Show r/ClaudeAI: pet-trainer — a terminal Tamagotchi that gamifies learning Claude Code". Include demo GIF + GitHub link + npm install command. Engage with comments in the first 2 hours.
- [ ] **Hacker News "Show HN":** Title: "Show HN: pet-trainer – your pet evolves only if you actually use Claude Code". Link: `https://pet.specops.black`. Respond to comments within 1 hour of posting.
- [ ] **X/Twitter:** Thread: (1) Hook tweet with demo GIF + install command. (2) How it works — quests, XP, evolution. (3) Link to GitHub + leaderboard. Tag @AnthropicAI.
- [ ] **GitHub repository:** Ensure README has demo GIF, install commands, and badge. Add Topics: `claude-code`, `tamagotchi`, `gamification`, `cli`, `typescript`.
- [ ] **Product Hunt (optional, week 2):** Schedule a Product Hunt launch for Tuesday–Thursday the following week for maximum visibility.

## Files to create / modify

| Action | Path                                                                                  |
| ------ | ------------------------------------------------------------------------------------- |
| Modify | `.github/workflows/deploy.yml` — activate all jobs, add PyPI publish + Sigstore steps |
| Create | `apps/cli/release.config.cjs`                                                         |
| Create | `apps/cli/pyproject.toml`                                                             |
| Create | `apps/cli/pet_trainer/__init__.py`                                                    |
| Create | `apps/cli/scripts/sync-version.sh` (chmod +x)                                         |
| Create | `docs/runbooks/incident-response.md`                                                  |
| Modify | `apps/cli/package.json` — add `publishConfig.provenance: true`                        |
| Modify | `.gitignore` — add `apps/cli/dist/`, `apps/cli/VERSION` (auto-generated)              |

## Verification

```bash
# 1. Verify npm package installs and --version works from a clean shell
# (Use a Docker container or fresh VM to guarantee clean environment)
docker run --rm node:20-slim sh -c \
  "npm install -g @specops/pet-trainer && pet --version"
# Must print the expected semver (e.g., 1.0.0)

# 2. Verify PyPI package installs and --version works
# (Requires Node 20 on the test machine)
docker run --rm python:3.11-slim sh -c \
  "apt-get install -y nodejs npm && pip install pet-trainer && pet-trainer --version"
# Must print the same semver

# 3. Verify GitHub Release exists with CHANGELOG
gh release list | head -5
gh release view v1.0.0 | grep -q 'CHANGELOG' && echo "Release notes OK"

# 4. Verify Sigstore signing
# Download the .sig and .pem files from the GitHub Release
cosign verify-blob \
  --signature @specops-pet-trainer-1.0.0.tgz.sig \
  --certificate @specops-pet-trainer-1.0.0.tgz.pem \
  @specops-pet-trainer-1.0.0.tgz
# Must print: Verified OK

# 5. Verify deploy.yml has all 5 job stages active
grep 'name:' .github/workflows/deploy.yml
# Must show: migrate, deploy-web, publish-cli (npm+PyPI+Sigstore), smoke-prod

# 6. Verify incident response runbook exists
test -f docs/runbooks/incident-response.md && echo "Runbook OK"

# 7. Verify Python shim passes arguments correctly
python -c "import pet_trainer; import sys; sys.argv=['pet-trainer','--version']; pet_trainer.main()"
# Must delegate to Node CLI and print version

# 8. Verify no secrets are committed
gitleaks detect --source . --verbose
# Must report: No leaks found
```

## Notes / Open questions

- **npm 2FA**: The `NPM_TOKEN` in GitHub Actions must be an **automation token**, not a granular access token. Automation tokens bypass OTP while keeping 2FA active on the account. Confirm this in the npm account settings before the first publish.
- **Semantic-release commit convention**: Every commit in Sprints 1-4 must follow conventional commits (`feat:`, `fix:`, `chore:`, etc.) or semantic-release will skip the publish. Run `git log --oneline` before the first release to verify all commits are formatted correctly. If not, amend or rebase before merging to main.
- **Python wrapper Node.js requirement**: The `pet_trainer/__init__.py` shim calls `npx --yes @specops/pet-trainer`. `npx` is bundled with npm (Node.js install). If the user's `npm` is outdated, `npx` may not be in PATH. The README must document: "Requires Node.js 20+ and npm 9.5+". The `pet init` command should check the Node version at startup and print a friendly error if it is below 20.
- **PyPI trusted publishing one-time setup**: The OIDC configuration at pypi.org must be done by Bruno before the first publish. If it is not configured, `pypa/gh-action-pypi-publish` will fail with a 403. Document the setup URL in the runbook.
- **`pet-trainer` PyPI name conflict**: Verify the `pet-trainer` name is available on PyPI before launch. If taken, use `specops-pet-trainer`. Reference SPEC.md §13 Q6 (validate name conflicts).
- **Cosign keyless signing**: The `cosign sign-blob` step uses keyless signing (Sigstore Fulcio CA + Rekor transparency log). This requires `id-token: write` permission in the workflow job — already set in the `publish-cli` job above. No private key management needed.
- **Post-launch**: After the initial publish, set up a schedule via the `schedule` skill to check `npm info @specops/pet-trainer downloads` weekly and `GitHub Stars` weekly — early signal for product-market fit against the §1.3 success metrics.
