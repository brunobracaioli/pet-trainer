---
id: 01-06-cli-init-status
sprint: 1
order: 6
status: done
spec_refs: ['§6.1', '§6.2', '§6.3', '§6.4', '§8.2']
depends_on: [01-05-auth-supabase-github]
deliverables:
  - apps/cli/src/commands/init.ts
  - apps/cli/src/commands/status.ts
  - apps/cli/src/commands/index.ts
  - apps/cli/src/index.ts
  - apps/cli/package.json
  - apps/cli/tsconfig.json
acceptance:
  - pnpm --filter @specops/pet-trainer build produces dist/index.js (exit 0)
  - node apps/cli/dist/index.js --version prints a semver string (e.g. 0.1.0)
  - node apps/cli/dist/index.js status --help prints usage without error
  - node apps/cli/dist/index.js init --help prints usage without error
  - dist/index.js line 1 is #!/usr/bin/env node (shebang present)
  - No PET_TRAINER_TOKEN literal value appears anywhere in dist/ output
---

## Goal

Implement `pet init` (full 6-step onboarding) and `pet status` (ASCII stats display) in `apps/cli` so that an authenticated user can connect their pet to Claude Code and verify the connection from the terminal in under 30 seconds.

## Context

SPEC.md §6.1 defines the four-step init flow (open browser → poll for token → write credentials → configure settings). This step expands that to six concrete implementation steps, adding `.claude/settings.json` hook injection (§6.4 template) and `CLAUDE.md` section append. §6.2 lists the full command surface — this step covers only `init` and `status`; the remaining commands (`quests`, `feed`, `train`, `sync`, `logout`) are Sprint 2. §6.3 slash commands are also installed during `pet init` (copy template files to `.claude/commands/`). `pet status` consumes the `GET /pet/me` endpoint (§8.2) and renders ASCII art to stdout.

## Implementation outline

- Update `apps/cli/package.json`: set `"version": "0.1.0"`, `"bin": { "pet": "./dist/index.js" }`, `"main": "./dist/index.js"`, `"files": ["dist"]`, `"engines": { "node": ">=20" }`. Add runtime dependencies: `commander` (CLI framework), `open` (browser launch), `chalk` (terminal colors), `ora` (spinner), `node-fetch` (HTTP client for Node 20 — use native `fetch` if Node 20+ is confirmed, remove this dep). Add `"scripts": { "build": "tsc", "typecheck": "tsc --noEmit", "dev": "tsc --watch" }`. Commander is the preferred CLI framework (simple, well-typed, no magic).
- Create `apps/cli/src/index.ts` as the CLI entry point. First line must be `#!/usr/bin/env node` (shebang — required for the `bin` field to work after `chmod +x`). Use `commander` to register the `init` and `status` subcommands from `./commands/index`. Set `program.version(pkg.version)` where `pkg` is imported from `package.json` using `assert { type: 'json' }`. Handle unknown commands with a helpful error.
- Create `apps/cli/src/commands/init.ts` implementing the 6-step flow from §6.1 expanded: **(1)** Call `POST /api/v1/auth/cli/start`, receive `{ device_code, verification_uri, expires_in }`. Print the verification_uri to stdout with a clear instruction. Use `open(verification_uri)` to launch the browser; if `open` throws (devcontainer), catch and print the URL only (§13 Q5 fallback). **(2)** Poll `POST /api/v1/auth/cli/poll` with `{ device_code }` every 5 seconds until `status === 'complete'` or `expires_in` seconds have elapsed. Show an `ora` spinner with "Waiting for browser authorization...". If `status === 'expired'`, exit with an error message. **(3)** On `status === 'complete'`, receive `{ token, expires_in }`. Write `~/.pet-trainer/credentials.json` with `{ token, expires_at: Date.now() + expires_in * 1000 }`. Set file permissions to `0o600` using `fs.chmod`. **(4)** Write/merge `.claude/settings.json` in the current working directory using the exact JSON template from §6.4. If the file exists, merge the `hooks` key without overwriting unrelated settings — parse existing JSON, deep merge the `hooks` block, write back. If the file does not exist, write the full template. **(5)** Create `.claude/commands/` directory if absent. Write three slash command files: `pet.md`, `quest.md`, `feed.md` — each is a one-line markdown file with the command description (§6.3). **(6)** Append a `## pet-trainer` section to `CLAUDE.md` in the current working directory (or create the file if absent). The section text should list the three slash commands and a one-liner about the hook. Then run `pet status` inline to confirm connection.
- Create `apps/cli/src/commands/status.ts`. Fetch `GET /api/v1/pet/me` with `Authorization: Bearer {token}` (read token from `~/.pet-trainer/credentials.json`; if missing, print "Run pet init first" and exit 1). On 401, print "Token expired — run pet init to re-authenticate" and exit 1. On 200, render ASCII output: pet name, species, stage indicator (e.g. `[Stage 2 — Hatchling 👶]`), XP bar (`████░░ 450/800 XP`), hunger/energy/happiness bars, and active quest count. Use `chalk` for colors (green for healthy stats, yellow for warning below 50, red below 20).
- Create `apps/cli/src/commands/index.ts` as a command registry that imports `initCommand` and `statusCommand` and registers them on a Commander `program`. This is the single import point for `src/index.ts`.
- Create `apps/cli/tsconfig.json` extending the root base config. Set `"outDir": "./dist"`, `"rootDir": "./src"`, `"declaration": false` (CLI is not a library). Ensure `"module": "CommonJS"` (Node bin scripts work best with CommonJS in the current Turborepo Node 20 setup).

## Files to create / modify

| Path                              | Action | Notes                                                                   |
| --------------------------------- | ------ | ----------------------------------------------------------------------- |
| `apps/cli/package.json`           | edit   | Version, bin, runtime deps, build script                                |
| `apps/cli/tsconfig.json`          | create | Extends root base, outDir: dist, CommonJS module                        |
| `apps/cli/src/index.ts`           | edit   | Shebang + Commander setup, version from package.json                    |
| `apps/cli/src/commands/init.ts`   | create | 6-step onboarding: OAuth poll → credentials → settings.json → CLAUDE.md |
| `apps/cli/src/commands/status.ts` | create | GET /pet/me → ASCII pet stats renderer                                  |
| `apps/cli/src/commands/index.ts`  | create | Command registry (Commander program setup)                              |

## Verification

```bash
# Build succeeds
pnpm --filter @specops/pet-trainer build

# Shebang is present
head -1 apps/cli/dist/index.js
# Expected: #!/usr/bin/env node

# Version flag works
node apps/cli/dist/index.js --version
# Expected: 0.1.0

# Help flags work
node apps/cli/dist/index.js --help
node apps/cli/dist/index.js init --help
node apps/cli/dist/index.js status --help

# No token literal in dist (token always comes from env or file)
grep -r "PET_TRAINER_TOKEN" apps/cli/dist/ | grep -v "process.env" && echo "FAIL: literal token reference" || echo "OK"

# Typecheck
pnpm --filter @specops/pet-trainer typecheck

# Integration: status with a valid local token
PET_API_BASE=http://localhost:3000/api/v1 node apps/cli/dist/index.js status
# Expected: ASCII pet stats rendered to stdout
```

## Notes / Open questions

- `PET_TRAINER_TOKEN` env var: the status command and all future commands must read the token from `~/.pet-trainer/credentials.json` by default. If `$PET_TRAINER_TOKEN` is set in the environment, it takes precedence (useful for CI/CD testing without a credentials file). This resolution order must be documented in the CLI help text.
- `pet init` writes `export PET_TRAINER_TOKEN=...` to the user's shell rc file (`~/.bashrc`, `~/.zshrc`, or `~/.profile` depending on `$SHELL`). Before writing, prompt the user: "May I add PET_TRAINER_TOKEN to your shell rc? [Y/n]". If the user declines, print the export command and instruct them to add it manually. Never write to the shell rc without explicit confirmation.
- Settings.json merge strategy: if `.claude/settings.json` already exists and already has a `PostToolUse` hook array, check if the pet-trainer hook URL (`https://pet.specops.black/api/v1/events`) is already present before appending. Idempotent init is important — running `pet init` twice must not duplicate hooks.
- CLAUDE.md append: check if the `## pet-trainer` section already exists before appending. If it does, skip (idempotent). Print a message: "pet-trainer section already present in CLAUDE.md — skipping."
- §13 Q5 (devcontainer): if `$HOME` is not writable or `~/.pet-trainer/` cannot be created, fail with a clear error: "Cannot write credentials to ~/.pet-trainer/ — are you running inside a devcontainer? Set PET_TRAINER_TOKEN manually." This is a known limitation, not a silent failure.
- The `GET /api/v1/pet/me` endpoint is not yet implemented (it is listed in §8.2 but not in this sprint's steps). For Sprint 1 integration testing, `pet status` can accept a `--mock` flag that renders a hardcoded pet without hitting the API. This lets `pet init` run its final confirmation step without a fully wired backend.
- Slash command file content for `docs/quests/*.md` pattern: `pet.md` content = `Run 'pet status' and show the output inline.`; `quest.md` content = `Run 'pet quests' and show my active quest.`; `feed.md` content = `Run 'pet feed' to restore my pet's hunger.`
