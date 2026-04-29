---
id: first-edit
title: Primeiro Edit
category: basics
difficulty: 1
xp_reward: 50
required_tool: Edit
unlocks_after: []
status: active
---

## What this quest teaches

The `Edit` tool is how Claude Code modifies files in place. Unlike `Write` (which overwrites the entire file or creates a new one), `Edit` performs a targeted string replacement — it preserves the rest of the file untouched. Reaching for `Edit` first instead of `Write` is the cheapest signal that you're working with Claude Code as a focused collaborator rather than a wholesale codegen tool.

## How to trigger this quest

Make any file edit while the pet-trainer hook is active. The HTTP hook fires on every `PostToolUse` event for `Edit`, and after a successful round-trip the server marks the quest completed and credits 50 XP.

```bash
# Once the hook is wired into ~/.claude/settings.json (via `pet init`):
# any prompt that asks Claude Code to modify a file will satisfy this quest.
```

## Match rule (SPEC.md §7.1)

```json
{
  "event_type": "PostToolUse",
  "tool_name": "Edit",
  "min_count": 1
}
```

In plain English: any single `Edit` tool call that completes successfully completes this quest.

## Why 50 XP

`Edit` is one of the two highest-impact tools (alongside `Bash`) for Claude Code productivity. Awarding 50 XP per first use puts new users squarely on the path toward Stage 2 (200 XP) without trivializing the milestone.
