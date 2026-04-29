---
id: first-read
title: Primeiro Read
category: basics
difficulty: 1
xp_reward: 30
required_tool: Read
unlocks_after: []
status: active
---

## What this quest teaches

The `Read` tool surfaces a specific file's contents to Claude Code. Using `Read` deliberately — rather than letting the model guess at file content from filenames alone — produces dramatically higher-fidelity edits and far fewer hallucinated APIs.

## How to trigger this quest

Ask Claude Code to look at a specific file. Any prompt that resolves to a `Read` tool call (e.g., "open the package.json", "show me the auth middleware") satisfies this quest.

## Match rule (SPEC.md §7.1)

```json
{
  "event_type": "PostToolUse",
  "tool_name": "Read",
  "min_count": 1
}
```

In plain English: any single `Read` tool call that completes successfully completes this quest.

## Why 30 XP

`Read` is a passive tool — it informs Claude Code's reasoning but does not directly modify the project. The 30 XP award (vs. 50 for active tools) reflects that hierarchy while still rewarding the discipline of reading before writing.
