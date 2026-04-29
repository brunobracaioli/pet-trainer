---
id: first-grep
title: Primeiro Grep
category: basics
difficulty: 1
xp_reward: 30
required_tool: Grep
unlocks_after: []
status: active
---

## What this quest teaches

The `Grep` tool searches across files using ripgrep semantics — fast, regex-aware, and respectful of `.gitignore`. Reaching for `Grep` is how Claude Code locates symbols, references, and patterns across a codebase without resorting to filename heuristics or brittle agent-led recursion.

## How to trigger this quest

Ask Claude Code to search the codebase. Anything that resolves to a `Grep` tool call (e.g., "find every callsite of `useAuth`", "search for `TODO` comments") satisfies this quest.

## Match rule (SPEC.md §7.1)

```json
{
  "event_type": "PostToolUse",
  "tool_name": "Grep",
  "min_count": 1
}
```

In plain English: any single `Grep` tool call that completes successfully completes this quest.

## Why 30 XP

`Grep` is paired with `Read` as a discovery tool — surfacing context for downstream `Edit`s. The matching 30 XP award groups it with `Read` in the discovery tier of basics quests.
