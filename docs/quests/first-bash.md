---
id: first-bash
title: Primeiro Bash
category: basics
difficulty: 1
xp_reward: 50
required_tool: Bash
unlocks_after: []
status: active
---

## What this quest teaches

The `Bash` tool lets Claude Code run shell commands in your working environment — running tests, inspecting git state, installing dependencies, and so on. Knowing when to delegate to `Bash` (instead of asking the model to reason about command output it cannot actually see) is the difference between a guess and a verified answer.

## How to trigger this quest

Run any shell command via Claude Code while the pet-trainer hook is active. A typical first-bash event happens during a typical exploration prompt — `git status`, `pnpm install`, `ls -la`, etc.

## Match rule (SPEC.md §7.1)

```json
{
  "event_type": "PostToolUse",
  "tool_name": "Bash",
  "min_count": 1
}
```

In plain English: any single `Bash` tool call that completes successfully completes this quest.

## Why 50 XP

`Bash` paired with `Edit` covers most day-to-day Claude Code workflows. The 50 XP award reflects that breadth — together they account for 100 of the 200 XP needed to reach Stage 2.
