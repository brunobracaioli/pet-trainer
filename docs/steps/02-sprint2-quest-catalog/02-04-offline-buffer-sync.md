---
id: 02-04-offline-buffer-sync
sprint: 2
order: 4
status: not-started
spec_refs: ['§3.3', '§6.2', '§8.1', '§8.3', '§8.4', '§13']
depends_on: [01-06-cli-init-status]
deliverables:
  - apps/cli/src/offline/buffer.ts
  - apps/cli/src/offline/sync.ts
  - apps/cli/src/offline/hook.sh.template
  - apps/cli/src/commands/sync.ts
  - apps/cli/src/commands/index.ts (updated)
  - apps/cli/src/commands/init.ts (updated — generates hook.sh, adds --offline flag)
acceptance:
  - 'pet sync with a pre-populated buffer.jsonl drains it and reports N events synced'
  - 'After drain, buffer.jsonl is empty (file exists but has zero bytes)'
  - 'Events in buffer retain Idempotency-Key so duplicate flush POSTs return 200 (server deduplicates per §8.4)'
  - "pet sync with empty buffer exits 0 and prints '0 events synced'"
  - 'Concurrent writes to buffer.jsonl from two processes do not corrupt the file (file locking)'
  - pnpm --filter @specops/pet-trainer typecheck exits 0
  - 'pet init --offline generates ~/.pet-trainer/hook.sh and prints instructions'
---

## Goal

Implement the offline buffer (`~/.pet-trainer/buffer.jsonl`) as the ADR-003 command hook fallback path, and the `pet sync` command that drains it to the server. After this step, users with intermittent connectivity accumulate events locally and flush them when reconnected, with no data loss and server-side deduplication via `Idempotency-Key`.

## Context

ADR-003 (§3.3) establishes the primary hook as HTTP fire-and-forget. When the HTTP hook fails (timeout, 5xx, no internet), events are silently dropped — there is no retry in the hook path. The offline buffer is the recovery mechanism:

1. An optional shell script (`~/.pet-trainer/hook.sh`) is a Claude Code command hook that appends events to `buffer.jsonl` instead of POSTing to the API.
2. `pet sync` reads `buffer.jsonl` and POSTs each event to `/api/v1/events` with the original `Idempotency-Key`. The server dedupes per §8.4 (SETNX on `evt:idem:{key}` in Redis).

§13 Q3 asks: "Buffer offline: arquivo JSONL local ou SQLite embedded?" — this step resolves it as **JSONL local** (simplest implementation, no extra dep, sufficient for MVP throughput). Document this resolution as the answer to Q3 in a comment at the top of `buffer.ts`.

The buffer is **append-only** during collection and **truncated to empty** (not deleted) after a successful sync drain. Keeping the file prevents the OS from needing to allocate a new inode on the next write. Events older than 7 days are pruned during sync to bound file growth.

File-level locking (`lockfile` or `proper-lockfile` npm package, or Node `fs.open` with exclusive flag) prevents race conditions when multiple Claude Code sessions run concurrently — each session's hook.sh appends one line per event, and concurrent appends to a shared file can interleave partially-written JSON lines without locking.

## Implementation outline

### `apps/cli/src/offline/buffer.ts`

```typescript
import { openSync, writeSync, closeSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { EventPayload } from '@specops/domain'

const BUFFER_DIR = join(homedir(), '.pet-trainer')
const BUFFER_FILE = join(BUFFER_DIR, 'buffer.jsonl')
const MAX_AGE_DAYS = 7

/**
 * Q3 resolution (§13): JSONL local file chosen over SQLite embedded.
 * Rationale: zero extra dependency, sufficient for MVP event volumes,
 * and file locking prevents corruption. Revisit if buffer grows >10MB regularly.
 */

export function appendEvent(event: EventPayload & { idempotency_key: string }): void {
  if (!existsSync(BUFFER_DIR)) {
    mkdirSync(BUFFER_DIR, { recursive: true, mode: 0o700 })
  }
  const line = JSON.stringify(event) + '\n'
  // O_WRONLY | O_APPEND | O_CREAT — atomic append, O_APPEND is atomic on POSIX
  const fd = openSync(BUFFER_FILE, 'a', 0o600)
  try {
    writeSync(fd, line)
  } finally {
    closeSync(fd)
  }
}
```

Use POSIX `O_APPEND` for atomic single-line appends. On Linux/macOS, `O_APPEND` guarantees atomicity for writes smaller than PIPE_BUF (4096 bytes). Since each JSON line is well under 1 KB (§10.2 truncates payloads to 1 KB), this is sufficient without a lock file for the append path.

For the **read + truncate** path in sync, use an exclusive file lock because that is a non-atomic read-then-write sequence. Use the `proper-lockfile` package (zero native deps, pure JS):

```typescript
import * as lockfile from 'proper-lockfile'

export async function readAndClearBuffer(): Promise<
  (EventPayload & { idempotency_key: string })[]
> {
  if (!existsSync(BUFFER_FILE)) return []
  const release = await lockfile.lock(BUFFER_FILE, { retries: { retries: 5, minTimeout: 50 } })
  try {
    const raw = readFileSync(BUFFER_FILE, 'utf-8')
    const lines = raw.split('\n').filter(Boolean)
    const events = lines
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter((e): e is EventPayload & { idempotency_key: string } => e !== null)
    // Prune events older than MAX_AGE_DAYS
    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    const fresh = events.filter((e) => !e.ingested_at || new Date(e.ingested_at).getTime() > cutoff)
    // Truncate file — keep the inode, zero out content
    truncateSync(BUFFER_FILE, 0)
    return fresh
  } finally {
    await release()
  }
}
```

Export: `appendEvent`, `readAndClearBuffer`, `BUFFER_FILE` (for testing).

### `apps/cli/src/offline/sync.ts`

```typescript
import { readAndClearBuffer } from './buffer'
import { loadCredentials } from '../auth/credentials'
import type { EventPayload } from '@specops/domain'

const API_BASE = process.env.PET_API_URL ?? 'https://pet.specops.black/api/v1'

export async function flushBufferToServer(): Promise<{ synced: number; failed: number }> {
  const events = await readAndClearBuffer()
  if (events.length === 0) return { synced: 0, failed: 0 }

  const { token } = await loadCredentials()
  let synced = 0
  let failed = 0
  const failedEvents: typeof events = []

  for (const event of events) {
    try {
      const res = await fetch(`${API_BASE}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': event.idempotency_key,
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(5000), // 5s timeout for sync (not fire-and-forget)
      })
      if (res.ok || res.status === 409) {
        // 409 = already processed (idempotency hit) — counts as synced
        synced++
      } else if (res.status === 401) {
        throw new Error('Token expired — run pet init to re-authenticate')
      } else {
        failedEvents.push(event)
        failed++
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Token expired')) throw err
      failedEvents.push(event)
      failed++
    }
  }

  // Re-append failed events back to buffer for next sync attempt
  if (failedEvents.length > 0) {
    for (const e of failedEvents) appendEvent(e)
  }

  return { synced, failed }
}
```

Note: Unlike the HTTP hook (fire-and-forget, no retry), `pet sync` **does** retry — that is its entire purpose. Failed events are re-appended to the buffer. Rate-limit hits (429) should also be re-appended, not discarded.

Export: `flushBufferToServer`.

### `apps/cli/src/offline/hook.sh.template`

This shell script is generated by `pet init --offline` into `~/.pet-trainer/hook.sh`. It acts as a Claude Code command hook that writes events to the buffer instead of POSTing to the API.

```bash
#!/usr/bin/env bash
# pet-trainer offline hook — generated by pet init --offline
# Appends hook events to buffer.jsonl for later sync via `pet sync`
# DO NOT EDIT — regenerate with: pet init --offline --regenerate

set -euo pipefail

BUFFER_FILE="$HOME/.pet-trainer/buffer.jsonl"
BUFFER_DIR="$(dirname "$BUFFER_FILE")"

mkdir -p "$BUFFER_DIR"
chmod 700 "$BUFFER_DIR"

# Read the hook payload from stdin (Claude Code passes it as JSON on stdin)
PAYLOAD="$(cat)"

# Add idempotency key and ingested_at timestamp before buffering
IDEMPOTENCY_KEY="$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N)"
INGESTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

EVENT="$(echo "$PAYLOAD" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  process.stdout.write(JSON.stringify({
    ...d,
    idempotency_key: process.env.IDEMPOTENCY_KEY,
    ingested_at: process.env.INGESTED_AT
  }));
" IDEMPOTENCY_KEY="$IDEMPOTENCY_KEY" INGESTED_AT="$INGESTED_AT")"

# Atomic append (O_APPEND is atomic on POSIX for writes < PIPE_BUF)
printf '%s\n' "$EVENT" >> "$BUFFER_FILE"
```

The template is stored at `apps/cli/src/offline/hook.sh.template` and embedded into the CLI bundle. `pet init --offline` writes it to `~/.pet-trainer/hook.sh` with `chmod 755`.

The user must add this script to their `.claude/settings.json` manually (or `pet init --offline` prints the exact JSON snippet to paste). The script is NOT added to settings.json automatically — it is opt-in per ADR-003 (HTTP hook is the default).

### `apps/cli/src/commands/sync.ts`

```
pet sync [--dry-run] [--verbose]
```

```typescript
export const syncCommand = new Command('sync')
  .description('Flush offline event buffer to the server')
  .option('--dry-run', 'Show buffered events without sending them')
  .option('--verbose', 'Print each event as it is sent')
  .action(async (opts) => {
    if (opts.dryRun) {
      const events = await readBuffer() // read without clearing
      console.log(`${events.length} events in buffer (dry-run, not sent)`)
      if (opts.verbose) {
        events.forEach((e) => console.log(JSON.stringify(e, null, 2)))
      }
      return
    }
    const { synced, failed } = await flushBufferToServer()
    console.log(`Synced ${synced} events to pet.specops.black`)
    if (failed > 0) {
      console.warn(`${failed} events failed to sync and were re-queued. Run pet sync again later.`)
    }
  })
```

Add `readBuffer` (read-only, no lock, no clear) as a separate export from `buffer.ts` for the `--dry-run` path.

### Update `apps/cli/src/commands/init.ts`

Add `--offline` flag:

```typescript
.option('--offline', 'Install command hook (writes to buffer) instead of HTTP hook')
```

When `--offline` is passed:

1. Generate `~/.pet-trainer/hook.sh` from the template (substitute the user's home dir).
2. Print: `"Offline hook installed at ~/.pet-trainer/hook.sh"`.
3. Print the snippet the user must add to their `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|Bash|Task|Read|Glob|Grep",
        "hooks": [
          {
            "type": "command",
            "command": "~/.pet-trainer/hook.sh"
          }
        ]
      }
    ]
  }
}
```

4. Do NOT write this to settings.json automatically — only print it. The user decides whether to replace the HTTP hook or add both.

## Files to create / modify

| Path                                    | Action | Notes                                                               |
| --------------------------------------- | ------ | ------------------------------------------------------------------- |
| `apps/cli/src/offline/buffer.ts`        | create | appendEvent, readAndClearBuffer, readBuffer (readonly), BUFFER_FILE |
| `apps/cli/src/offline/sync.ts`          | create | flushBufferToServer — re-appends failed events                      |
| `apps/cli/src/offline/hook.sh.template` | create | Shell script template for command hook                              |
| `apps/cli/src/commands/sync.ts`         | create | pet sync command, --dry-run and --verbose flags                     |
| `apps/cli/src/commands/index.ts`        | edit   | register syncCommand                                                |
| `apps/cli/src/commands/init.ts`         | edit   | add --offline flag, generate hook.sh, print JSON snippet            |
| `apps/cli/package.json`                 | edit   | add `proper-lockfile` to dependencies                               |

## Verification

```bash
# Build
pnpm --filter @specops/pet-trainer build

# Typecheck
pnpm --filter @specops/pet-trainer typecheck

# Unit test: empty buffer
echo -n "" > ~/.pet-trainer/buffer.jsonl
node apps/cli/dist/index.js sync
# Expected: "Synced 0 events to pet.specops.black"

# Unit test: pre-populated buffer
cat > ~/.pet-trainer/buffer.jsonl << 'EOF'
{"session_id":"test-123","hook_event_name":"PostToolUse","tool_name":"Edit","idempotency_key":"test-key-001","ingested_at":"2026-04-29T10:00:00Z"}
{"session_id":"test-123","hook_event_name":"PostToolUse","tool_name":"Bash","idempotency_key":"test-key-002","ingested_at":"2026-04-29T10:00:01Z"}
EOF
export PET_TRAINER_TOKEN="$TEST_JWT"
node apps/cli/dist/index.js sync
# Expected: "Synced 2 events to pet.specops.black"

# Verify buffer is empty (not deleted) after sync
wc -c ~/.pet-trainer/buffer.jsonl
# Expected: 0 ~/.pet-trainer/buffer.jsonl

# Idempotency: sync the same events again (re-add them)
cat > ~/.pet-trainer/buffer.jsonl << 'EOF'
{"session_id":"test-123","hook_event_name":"PostToolUse","tool_name":"Edit","idempotency_key":"test-key-001","ingested_at":"2026-04-29T10:00:00Z"}
EOF
node apps/cli/dist/index.js sync
# Expected: "Synced 1 events to pet.specops.black" (server returns 200 or 409 — no duplicate XP)

# Dry-run
cat > ~/.pet-trainer/buffer.jsonl << 'EOF'
{"session_id":"test-123","hook_event_name":"Stop","idempotency_key":"test-key-003","ingested_at":"2026-04-29T10:00:02Z"}
EOF
node apps/cli/dist/index.js sync --dry-run
# Expected: "1 events in buffer (dry-run, not sent)"
# buffer.jsonl should still contain the event after dry-run
wc -l ~/.pet-trainer/buffer.jsonl
# Expected: 1

# Offline init
node apps/cli/dist/index.js init --offline
# Expected: prints hook.sh path + JSON snippet to paste
ls ~/.pet-trainer/hook.sh && echo "hook.sh exists"
```

## Notes / Open questions

- §13 Q3 is resolved here: JSONL local file. The decision rationale (no extra dep, atomic POSIX append, pruning for growth control) is documented in `buffer.ts` as a comment for future maintainers.
- `proper-lockfile` adds one runtime dep to the CLI. Evaluate `lockfile` (older, still maintained) as an alternative if bundle size is a concern. Both are pure JS — no native addons.
- The `uuidgen` command in `hook.sh.template` is available on macOS and most Linux distros. The fallback to `/proc/sys/kernel/random/uuid` covers Linux without `uuidgen`. If neither is available (Windows WSL edge cases), the `date +%s%N` fallback produces a nanosecond timestamp — not UUID format but unique enough for idempotency keying.
- Buffer pruning (7-day cutoff) happens during `readAndClearBuffer()` — pruned events are never sent to the server. This is the correct behavior: stale events that are 7+ days old would not affect quest completion (quests are stateless matching, not time-gated). Adjust the cutoff constant if needed.
- The offline hook produces events in the same JSON format as the HTTP hook body (§8.3). The `idempotency_key` is added by the shell script before buffering. When `pet sync` sends the event, it uses this stored key in the `Idempotency-Key` header, allowing the server to deduplicate correctly even if the same event is buffered and synced multiple times.
- The 5xx fire-and-forget rule (§8.3) applies only to the HTTP hook path. The `pet sync` path intentionally retries by re-appending failed events. This is not a contradiction — ADR-003 says the hook must not block the user's terminal, but `pet sync` is an explicit user action that can take time.
- Windows support: `O_APPEND` atomicity is not guaranteed on Windows. If Windows support is added (beyond WSL), replace the POSIX append with a proper lockfile on all platforms.
