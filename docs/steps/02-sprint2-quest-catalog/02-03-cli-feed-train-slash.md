---
id: 02-03-cli-feed-train-slash
sprint: 2
order: 3
status: not-started
spec_refs: ['§6.2', '§6.3', '§6.4', '§8.2', '§5.1']
depends_on: [01-06-cli-init-status, 01-07-seed-quests-basics, 02-01-quest-catalog-mvp]
deliverables:
  - apps/cli/src/commands/feed.ts
  - apps/cli/src/commands/train.ts
  - apps/cli/src/commands/quests.ts
  - apps/cli/src/commands/logout.ts
  - apps/cli/src/commands/index.ts (updated)
  - apps/cli/src/slash-commands/pet.md
  - apps/cli/src/slash-commands/quest.md
  - apps/cli/src/slash-commands/feed.md
  - apps/cli/src/commands/init.ts (updated — installs slash commands)
acceptance:
  - node dist/index.js quests --help prints usage without error
  - node dist/index.js feed --help prints usage without error
  - node dist/index.js train --help prints usage without error
  - node dist/index.js logout --help prints usage without error
  - 'node dist/index.js train first-edit (with TEST_JWT env var) exits 0 and prints quest started message'
  - 'node dist/index.js quests (with TEST_JWT) renders 3 column output: locked / available / completed'
  - 'pet init installs .claude/commands/pet.md, .claude/commands/quest.md, .claude/commands/feed.md in current project dir'
  - pnpm --filter @specops/pet-trainer typecheck exits 0
---

## Goal

Implement `pet feed`, `pet train <quest-id>`, `pet quests`, and `pet logout` CLI commands. Install the 3 slash commands (`/pet`, `/quest`, `/feed`) during `pet init`. After this step, the CLI surface defined in §6.2 and §6.3 is fully operational for the MVP quest catalog.

## Context

Step `01-06-cli-init-status` delivered `pet init` and `pet status`. This step completes the §6.2 command surface. All four new commands follow the same pattern established by `status`:

1. Load credentials from `~/.pet-trainer/credentials.json`.
2. Call the relevant API endpoint with `Authorization: Bearer <token>`.
3. Render the response to stdout with color (Chalk or equivalent — match the style of `pet status`).
4. On 401, print "Session expired. Run `pet init` to re-authenticate." and exit 1.
5. On network error, print the error and exit 1.

Slash commands are Markdown files installed by `pet init` into `.claude/commands/` of the **current working directory** (the user's project). They are Claude Code slash commands per §6.3. The source files live in `apps/cli/src/slash-commands/` and are bundled into the npm package as static assets under `dist/slash-commands/`. `pet init` copies them to `./.claude/commands/` during setup.

The `pet feed` command costs XP (petowner pays 20 XP to restore 20 hunger points). This is a game mechanic — users must use Claude Code (earning XP) to be able to feed their pet. Starting values: 20 XP cost, 20 hunger points restored. These should be constants in `apps/cli/src/constants.ts` so they can be tuned without touching command logic.

`pet train <quest-id>` marks a quest as `in_progress` via `POST /api/v1/quests/:id/start`. Per §5.1 `quest_progress.status`, only one quest can be `in_progress` at a time. The API enforces this constraint server-side — if the user tries to start a second quest while one is in progress, the server returns 409 and the CLI prints a clear message.

`pet quests` renders a 3-column table:

- Column 1: Locked (grayed out, shows prerequisite IDs)
- Column 2: Available (bold, shows difficulty stars and XP reward)
- Column 3: Completed (green checkmark + XP earned)

## Implementation outline

### `apps/cli/src/constants.ts` (create or extend)

```typescript
export const FEED_XP_COST = 20 // XP deducted from pet
export const FEED_HUNGER_RESTORE = 20 // hunger points restored
export const API_BASE_URL = 'https://pet.specops.black/api/v1'
export const CREDENTIALS_PATH = `${process.env.HOME}/.pet-trainer/credentials.json`
```

### `apps/cli/src/commands/feed.ts`

```
pet feed
```

1. Load token from credentials file.
2. POST `/api/v1/pet/me/feed` with body `{ xp_cost: FEED_XP_COST, hunger_restore: FEED_HUNGER_RESTORE }` and `Idempotency-Key` header (generate UUID per request).
3. On 200: print updated pet stats (XP remaining, hunger new value). Reuse the stats rendering function from `pet status`.
4. On 402 (insufficient XP): print "Not enough XP to feed. Earn more XP by using Claude Code tools." Exit 1.
5. On 400/409: print server error message. Exit 1.

The `Idempotency-Key` for `pet feed` must be a fresh UUID per invocation (not session-scoped) — the user may feed multiple times per session and each should be independent.

### `apps/cli/src/commands/train.ts`

```
pet train <quest-id>
```

Positional argument `quest-id` is required. Validate it is a non-empty string before the network call.

1. Load token.
2. POST `/api/v1/quests/${questId}/start` with empty body and `Idempotency-Key`.
3. On 200: print "Quest started: <title>. Complete the quest to earn <xp> XP."
4. On 404: print "Quest '<id>' not found. Run `pet quests` to see available quests." Exit 1.
5. On 409: print "You already have a quest in progress: <active-quest-title>. Complete it first, or use `pet train --force` to switch." (The `--force` flag is a Sprint 3+ feature — print the message but do not implement force in this step.)
6. On 403: print "Quest '<id>' is locked. Complete the prerequisite quests first." Exit 1.

### `apps/cli/src/commands/quests.ts`

```
pet quests [--category <name>] [--json]
```

Optional flags: `--category` filters by category, `--json` outputs raw JSON (useful for scripting).

1. Load token.
2. GET `/api/v1/quests` — returns quest catalog with user's progress overlaid (status per quest: locked/available/in_progress/completed).
3. Group quests by status.
4. Render three sections:

```
LOCKED (8)
  permissions: allow-rule ★★ — 100 XP  [requires: first-edit]
  ...

AVAILABLE (5)
  basics: first-bash ★  — 50 XP
  ...

COMPLETED (4)
  basics: first-edit ★  — 50 XP ✓
  ...
```

Difficulty stars: render difficulty as `★` × difficulty (1-5). Use Chalk gray for locked, white for available, green for completed.

In-progress quest appears at the top of AVAILABLE with a `[ACTIVE]` label.

### `apps/cli/src/commands/logout.ts`

```
pet logout
```

1. Read `~/.pet-trainer/credentials.json` — if missing, print "Already logged out." Exit 0.
2. Delete `~/.pet-trainer/credentials.json`.
3. Print "Logged out. Run `pet init` to reconnect."
4. Do NOT delete `~/.pet-trainer/buffer.jsonl` — offline events should survive logout for later sync after re-auth.

### `apps/cli/src/commands/index.ts` (update)

Register all new commands with the CLI router (Commander.js or equivalent used in step 01-06):

```typescript
import { feedCommand } from './feed'
import { trainCommand } from './train'
import { questsCommand } from './quests'
import { logoutCommand } from './logout'

program
  .addCommand(feedCommand)
  .addCommand(trainCommand)
  .addCommand(questsCommand)
  .addCommand(logoutCommand)
```

### Slash command source files

These are Markdown files that Claude Code interprets as slash commands. They live in `apps/cli/src/slash-commands/` and are copied to `.claude/commands/` during `pet init`.

**`apps/cli/src/slash-commands/pet.md`**

```markdown
# Pet Status

Show your pet's current stats inline in this conversation.

<cli>pet status --json</cli>
```

(The `<cli>` tag is a placeholder — the actual mechanism is a Bash call via the slash command body. Match the format used by existing `.claude/commands/` files in this repo.)

Real implementation: the slash command body calls `node ~/.pet-trainer/cli.js status --json` and formats the output. The exact slash command format should match Claude Code's current `.md` slash command convention (a markdown file with a description and a body that Claude Code executes).

**`apps/cli/src/slash-commands/quest.md`**

```markdown
# Active Quest

Show your current active quest and next steps.

Lists your in-progress quest from the pet-trainer catalog.
Run: pet quests --category active
```

**`apps/cli/src/slash-commands/feed.md`**

```markdown
# Feed Pet

Feed your pet to restore hunger. Costs 20 XP.

Confirm before feeding: this action costs XP.
Run: pet feed $ARGUMENTS
```

`$ARGUMENTS` allows the user to pass flags (e.g., `/feed --dry-run` — dry-run is a future feature, but the plumbing should be in place).

### Update `apps/cli/src/commands/init.ts`

After writing `settings.json`, copy the three slash command files to `./.claude/commands/`:

```typescript
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const slashCommandsSource = join(fileURLToPath(import.meta.url), '../../slash-commands')
const targetDir = join(process.cwd(), '.claude', 'commands')

if (!existsSync(targetDir)) {
  mkdirSync(targetDir, { recursive: true })
}

for (const file of ['pet.md', 'quest.md', 'feed.md']) {
  copyFileSync(join(slashCommandsSource, file), join(targetDir, file))
}
console.log('Slash commands installed: /pet, /quest, /feed')
```

If a file already exists at the target path, overwrite it (idempotent — `pet init` can be re-run safely).

## Files to create / modify

| Path                                   | Action         | Notes                                                             |
| -------------------------------------- | -------------- | ----------------------------------------------------------------- |
| `apps/cli/src/constants.ts`            | create or edit | FEED_XP_COST, FEED_HUNGER_RESTORE, API_BASE_URL, CREDENTIALS_PATH |
| `apps/cli/src/commands/feed.ts`        | create         | POST /pet/me/feed, renders updated stats                          |
| `apps/cli/src/commands/train.ts`       | create         | POST /quests/:id/start, handles 404/409/403                       |
| `apps/cli/src/commands/quests.ts`      | create         | GET /quests, 3-column render, --category and --json flags         |
| `apps/cli/src/commands/logout.ts`      | create         | deletes credentials.json only, keeps buffer.jsonl                 |
| `apps/cli/src/commands/index.ts`       | edit           | register 4 new commands                                           |
| `apps/cli/src/commands/init.ts`        | edit           | copy slash-commands to .claude/commands/                          |
| `apps/cli/src/slash-commands/pet.md`   | create         | /pet slash command source                                         |
| `apps/cli/src/slash-commands/quest.md` | create         | /quest slash command source                                       |
| `apps/cli/src/slash-commands/feed.md`  | create         | /feed slash command source                                        |

## Verification

```bash
# Build CLI
pnpm --filter @specops/pet-trainer build

# Help text for all 4 new commands
node apps/cli/dist/index.js quests --help
node apps/cli/dist/index.js feed --help
node apps/cli/dist/index.js train --help
node apps/cli/dist/index.js logout --help

# Typecheck
pnpm --filter @specops/pet-trainer typecheck

# Integration test: train (requires TEST_JWT env var pointing to a seeded test user)
export TEST_JWT="<token>"
node apps/cli/dist/index.js train first-edit
# Expected: "Quest started: Primeiro Edit. Complete the quest to earn 50 XP."

# Integration test: quests renders 3 sections
node apps/cli/dist/index.js quests
# Expected: sections LOCKED / AVAILABLE / COMPLETED with correct grouping

# Integration test: logout
node apps/cli/dist/index.js logout
# Expected: "Logged out. Run `pet init` to reconnect."
test ! -f ~/.pet-trainer/credentials.json && echo "credentials removed"

# Slash commands installed by init
node apps/cli/dist/index.js init --dry-run  # if dry-run flag exists
ls .claude/commands/pet.md .claude/commands/quest.md .claude/commands/feed.md
```

## Notes / Open questions

- The API endpoint `POST /api/v1/pet/me/feed` must be implemented in `apps/web/app/api/v1/pet/me/feed/route.ts` as a Node Function (not Edge — it writes to Supabase via service role). This API endpoint is listed in §8.2 but its implementation is in scope of Sprint 1 step 01-05 (pet CRUD). If that step was deferred, implement the feed endpoint as part of this step, targeting Node runtime.
- `pet quests` GET endpoint (`/api/v1/quests`) returns the catalog merged with the user's `quest_progress` rows. The API implementation must join these tables. If the Sprint 1 implementation only returns the catalog without progress, extend it here.
- Slash command format: use the same format as existing files in `.claude/commands/` in this repository. At time of writing, the format is a Markdown file where the body is rendered to Claude Code as an instruction. Do not invent a new format — inspect existing commands first.
- `FEED_XP_COST = 20` is the MVP default. This value should eventually be configurable per server-side config (to tune game economy without CLI updates). For MVP, hardcode it in constants and ensure the server also validates that the requested cost matches server-expected values to prevent client manipulation.
- The `--force` flag on `pet train` is explicitly deferred to Sprint 3. The 409 message must mention it so users know it will exist, but the implementation must not implement it now — follow Boy Scout Rule, no premature features.
- `pet logout` must NOT call a server-side logout endpoint in MVP. Deleting the local credentials is sufficient — JWTs expire (1h TTL per §10.1) naturally. A server-side token revocation endpoint is a Sprint 4 hardening item.
