# ADR-0003 — HTTP hooks as primary, command hooks as offline fallback

Status: Accepted
Date: 2026-04-29

## Context

Claude Code supports hooks via two mechanisms:

- **Command hook** — local shell command invoked on each tool call.
- **HTTP hook** — POST to an arbitrary endpoint on each tool call.

Quest progress telemetry can be implemented with either. Both have to integrate with the user's `.claude/settings.json`.

## Decision

**HTTP hooks** as the primary mechanism, with command hooks reserved as an **offline fallback**.

### Primary path (HTTP)

- Every Claude Code tool call POSTs to `https://pet.specops.black/api/v1/events`.
- `${CLAUDE_SESSION_ID}` plus a JWT (env var `PET_TRAINER_TOKEN`) authenticates the call without a per-event OAuth handshake.
- The hook is **fire-and-forget**: 2-second timeout, silent failure that does not block the user's tool call.
- Server-side detection of quest completion lets us update detection logic without the user upgrading the CLI.

### Offline fallback (command)

- When the hook cannot reach the network, events are appended to `~/.pet-trainer/buffer.jsonl`.
- The buffer is drained by `pet sync`, which replays events in batches against the same `/events` endpoint with the same `Idempotency-Key` so that no XP is lost and none is double-counted.
- Command hooks **only** write to the offline buffer — they never duplicate quest-evaluation logic. All evaluation happens server-side.

## Consequences

### Positive

- Zero local stateful process running between Claude Code invocations.
- Quest detection rules can be updated, hot-fixed, or rolled back server-side without forcing a CLI upgrade.
- The terminal stays responsive: the 2-second timeout is a hard ceiling on hook-induced latency.

### Negative

- Network latency becomes a factor on the request path (mitigated by Vercel Edge Function P95 < 100ms).
- Tool inputs/outputs traverse HTTPS to our API (mitigated by the telemetry modes documented in SPEC.md §10.2: `--telemetry=full|minimal|off`, with payloads truncated to 1 KB before persistence).

## Trade-offs accepted

- **Latency budget:** any change that pushes the `/events` Edge handler above 200ms P95 is treated as a regression because the hook blocks the user's terminal. This is a load-bearing latency budget enforced by SPEC.md §8.4 and §10.3.
- **Privacy surface area:** opt-in is explicit at `pet init`. Users can downgrade telemetry to `minimal` (tool name + hashed file path only) or `off` (hooks become no-ops); the choice is reversible at any time.
- **Hook upgrade dependency:** users who never upgrade the CLI still benefit from server-side detection improvements. The only thing that requires a CLI upgrade is a new `pet` subcommand or a change to the local hook payload shape — both are rare events versioned through `/api/v1` → `/api/v2` URL versioning.
