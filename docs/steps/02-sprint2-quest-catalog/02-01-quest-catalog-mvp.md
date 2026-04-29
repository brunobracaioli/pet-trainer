---
id: 02-01-quest-catalog-mvp
sprint: 2
order: 1
status: not-started
spec_refs: ['§7.1', '§7.2', '§7.3', '§11']
depends_on: [01-07-seed-quests-basics]
deliverables:
  - supabase/seed.sql (16 new INSERT INTO quests rows appended)
  - docs/quests/allow-rule.md
  - docs/quests/deny-rule.md
  - docs/quests/ask-once.md
  - docs/quests/posttool-hook.md
  - docs/quests/pretool-block.md
  - docs/quests/sessionstart-context.md
  - docs/quests/stop-validator.md
  - docs/quests/create-command.md
  - docs/quests/command-with-args.md
  - docs/quests/project-vs-user.md
  - docs/quests/spawn-task.md
  - docs/quests/custom-agent-md.md
  - docs/quests/agent-with-tools.md
  - docs/quests/use-skill.md
  - docs/quests/configure-mcp.md
  - docs/quests/mcp-tool-call.md
acceptance:
  - 'SELECT COUNT(*) FROM quests equals 20 after supabase db reset'
  - All 16 docs/quests/*.md files exist and are non-empty
  - "SELECT id FROM quests WHERE category NOT IN ('basics','permissions','hooks','slash-commands','subagents','skills-mcp') returns 0 rows"
  - Every unlocks_after reference points to a quest id that exists in the same seed.sql
  - pnpm --filter @specops/quest-engine test passes (match_rule operators valid per §7.1 DSL)
---

## Goal

Implement all 16 remaining MVP quests (categories: permissions, hooks, slash-commands, subagents, skills-mcp) as Postgres seed rows and companion docs files. After this step, the full 20-quest catalog is present and `supabase db reset` yields a complete seeded database.

## Context

Sprint 1 step `01-07-seed-quests-basics` already inserted the 4 basics quests (`first-edit`, `first-bash`, `first-read`, `first-grep`). This step appends the remaining 16. Each quest requires two artifacts:

1. A seed row in `supabase/seed.sql` that matches the `quests` table schema exactly (§5.1), including a `match_rule` JSONB written with DSL operators from §7.1.
2. A `docs/quests/<id>.md` file that is the human-readable source of truth for that quest (§11 Docs as Code). CODEOWNERS enforces that quest code changes without a corresponding `.md` update are blocked at PR.

The `.claude/skills/add-quest/` skill enforces §7 invariants automatically — use it for each quest rather than writing seed rows by hand. This also generates the matching Vitest test skeleton for the match_rule.

Evolution stage unlock graph (§7.3) determines which quests are accessible when:

- Stage 1 (Egg, 0 XP): basics only
- Stage 2 (Hatchling, 200 XP): permissions, first feed
- Stage 3 (Apprentice, 800 XP): hooks, slash-commands
- Stage 4 (Operator, 2500 XP): subagents, MCP

`unlocks_after` is a prerequisite list (quest IDs, not stages). A quest becomes `available` only when all its prerequisites are `completed`.

## Implementation outline

For each quest below, run the `add-quest` skill, then verify the generated seed row and doc file against the spec in this step. Correct any drift before moving on.

### PERMISSIONS category (3 quests, unlocks_after: [first-edit])

**allow-rule** (difficulty 2, xp_reward 100, required_tool Edit)

- User edits `.claude/settings.json` and adds an `allowedTools` Bash() pattern.
- match_rule detects the Edit tool was used on the settings file and the new content contains the string `"allow"` in a Bash tool matcher context.

```json
{
  "event_type": "PostToolUse",
  "tool_name": "Edit",
  "tool_input.file_path": { "endsWith": ".claude/settings.json" },
  "tool_input.new_string": { "contains": "\"allow\"" },
  "min_count": 1
}
```

**deny-rule** (difficulty 2, xp_reward 100, required_tool Edit)

- User edits `.claude/settings.json` adding a `deny` entry in the permissions block.

```json
{
  "event_type": "PostToolUse",
  "tool_name": "Edit",
  "tool_input.file_path": { "endsWith": ".claude/settings.json" },
  "tool_input.new_string": { "contains": "\"deny\"" },
  "min_count": 1
}
```

**ask-once** (difficulty 3, xp_reward 150, required_tool Edit)

- User configures a permission with `"behavior": "ask"` (or equivalent Ask schema) — shows they understand the three-tier permission model (allow/deny/ask).

```json
{
  "event_type": "PostToolUse",
  "tool_name": "Edit",
  "tool_input.file_path": { "endsWith": ".claude/settings.json" },
  "tool_input.new_string": { "contains": "\"ask\"" },
  "min_count": 1
}
```

### HOOKS category (4 quests)

**posttool-hook** (difficulty 3, xp_reward 200, required_tool Edit, unlocks_after [first-edit])

- This is the canonical example from §7.1. User edits settings.json adding a PostToolUse hook.

```json
{
  "event_type": "PostToolUse",
  "tool_name": "Edit",
  "tool_input.file_path": { "endsWith": ".claude/settings.json" },
  "tool_input.new_string": { "contains": "PostToolUse" },
  "min_count": 1
}
```

**pretool-block** (difficulty 3, xp_reward 200, required_tool Edit, unlocks_after [allow-rule])

- User adds a PreToolUse hook with a `block` behavior (decision: "block"). Teaches hook-as-guardrail pattern.

```json
{
  "event_type": "PostToolUse",
  "tool_name": "Edit",
  "tool_input.file_path": { "endsWith": ".claude/settings.json" },
  "tool_input.new_string": { "and": [{ "contains": "PreToolUse" }, { "contains": "block" }] },
  "min_count": 1
}
```

**sessionstart-context** (difficulty 2, xp_reward 150, required_tool Edit, unlocks_after [first-edit])

- User adds a SessionStart hook. Teaches context injection on session open.

```json
{
  "event_type": "PostToolUse",
  "tool_name": "Edit",
  "tool_input.file_path": { "endsWith": ".claude/settings.json" },
  "tool_input.new_string": { "contains": "SessionStart" },
  "min_count": 1
}
```

**stop-validator** (difficulty 3, xp_reward 150, required_tool Edit, unlocks_after [posttool-hook])

- User adds a Stop hook — typically used to validate or log at the end of a session.

```json
{
  "event_type": "PostToolUse",
  "tool_name": "Edit",
  "tool_input.file_path": { "endsWith": ".claude/settings.json" },
  "tool_input.new_string": { "contains": "\"Stop\"" },
  "min_count": 1
}
```

### SLASH COMMANDS category (3 quests, unlocks_after [posttool-hook])

**create-command** (difficulty 2, xp_reward 100, required_tool Write, unlocks_after [posttool-hook])

- User creates any file inside `.claude/commands/`. Teaches slash command installation.

```json
{
  "event_type": "PostToolUse",
  "tool_name": { "in": ["Write", "Edit"] },
  "tool_input.file_path": { "contains": ".claude/commands/" },
  "min_count": 1
}
```

**command-with-args** (difficulty 3, xp_reward 150, required_tool Write, unlocks_after [create-command])

- User creates a slash command that includes `$ARGUMENTS` in its body — teaches parameterized commands.

```json
{
  "event_type": "PostToolUse",
  "tool_name": { "in": ["Write", "Edit"] },
  "tool_input.file_path": { "contains": ".claude/commands/" },
  "tool_input.new_string": { "contains": "$ARGUMENTS" },
  "min_count": 1
}
```

**project-vs-user** (difficulty 2, xp_reward 100, unlocks_after [create-command])

- User creates a command at the user-level path (`~/.claude/commands/`) rather than project-level (`.claude/commands/`). Teaches the distinction between project and user slash command scopes.

```json
{
  "event_type": "PostToolUse",
  "tool_name": { "in": ["Write", "Edit"] },
  "tool_input.file_path": { "regex": ".*\\.claude/commands/.*\\.md$" },
  "min_count": 1
}
```

Note: server-side distinction between project vs user path is determined by whether `tool_input.file_path` starts with `/home/` or `$HOME` vs a relative `.claude/` prefix. The match_rule uses regex; the service layer resolves the actual path context from session metadata.

### SUBAGENTS category (3 quests, unlocks_after [first-edit])

**spawn-task** (difficulty 2, xp_reward 150, required_tool Task, unlocks_after [first-edit])

- This is the canonical example from §7.1 (`spawn-subagent`). User invokes the Task tool to delegate work to a subagent.

```json
{
  "event_type": "PostToolUse",
  "tool_name": "Task",
  "min_count": 1
}
```

**custom-agent-md** (difficulty 3, xp_reward 200, required_tool Write, unlocks_after [spawn-task])

- User creates a `.claude/agents/*.md` file defining a custom subagent persona/instructions.

```json
{
  "event_type": "PostToolUse",
  "tool_name": { "in": ["Write", "Edit"] },
  "tool_input.file_path": { "regex": ".*\\.claude/agents/.*\\.md$" },
  "min_count": 1
}
```

**agent-with-tools** (difficulty 4, xp_reward 250, required_tool Task, unlocks_after [custom-agent-md])

- User invokes an Agent tool call that specifies a `subagent_type` restricting the tools available to the subagent. Teaches tool scoping in subagents.

```json
{
  "event_type": "PostToolUse",
  "tool_name": "Task",
  "tool_input.description": { "regex": ".*" },
  "min_count": 1
}
```

Note: detecting `subagent_type` vs plain Task requires inspecting `tool_input`. The quest engine checks `tool_input.subagent_type` for a non-null value using a `not: { equals: null }` operator at evaluation time — update the match_rule to:

```json
{
  "event_type": "PostToolUse",
  "tool_name": "Task",
  "tool_input.subagent_type": { "not": { "equals": null } },
  "min_count": 1
}
```

### SKILLS/MCP category (3 quests, unlocks_after [custom-agent-md])

**use-skill** (difficulty 3, xp_reward 200, unlocks_after [custom-agent-md])

- User invokes a skill from `.claude/skills/`. Detection: a Bash event that reads/executes from `.claude/skills/` path, or a Write event creating a skill invocation file.

```json
{
  "event_type": "PostToolUse",
  "tool_name": { "in": ["Bash", "Read"] },
  "tool_input.command": { "contains": ".claude/skills/" },
  "min_count": 1
}
```

**configure-mcp** (difficulty 4, xp_reward 300, required_tool Edit, unlocks_after [posttool-hook])

- User adds an MCP server entry to Claude Code settings (`.claude/settings.json` or global `~/.claude/settings.json` — the `mcpServers` block).

```json
{
  "event_type": "PostToolUse",
  "tool_name": "Edit",
  "tool_input.file_path": { "endsWith": ".claude/settings.json" },
  "tool_input.new_string": { "contains": "mcpServers" },
  "min_count": 1
}
```

**mcp-tool-call** (difficulty 4, xp_reward 300, unlocks_after [configure-mcp])

- User successfully calls a tool provided by an MCP server. Detection: a PostToolUse event where `tool_name` starts with `mcp__` (the naming convention Claude Code uses for MCP tools).

```json
{
  "event_type": "PostToolUse",
  "tool_name": { "startsWith": "mcp__" },
  "min_count": 1
}
```

## Files to create / modify

| Path                                  | Action | Notes                                                             |
| ------------------------------------- | ------ | ----------------------------------------------------------------- |
| `supabase/seed.sql`                   | append | 16 INSERT INTO quests rows; keep existing 4 basics rows untouched |
| `docs/quests/allow-rule.md`           | create | permissions quest doc                                             |
| `docs/quests/deny-rule.md`            | create | permissions quest doc                                             |
| `docs/quests/ask-once.md`             | create | permissions quest doc                                             |
| `docs/quests/posttool-hook.md`        | create | hooks quest doc                                                   |
| `docs/quests/pretool-block.md`        | create | hooks quest doc                                                   |
| `docs/quests/sessionstart-context.md` | create | hooks quest doc                                                   |
| `docs/quests/stop-validator.md`       | create | hooks quest doc                                                   |
| `docs/quests/create-command.md`       | create | slash-commands quest doc                                          |
| `docs/quests/command-with-args.md`    | create | slash-commands quest doc                                          |
| `docs/quests/project-vs-user.md`      | create | slash-commands quest doc                                          |
| `docs/quests/spawn-task.md`           | create | subagents quest doc                                               |
| `docs/quests/custom-agent-md.md`      | create | subagents quest doc                                               |
| `docs/quests/agent-with-tools.md`     | create | subagents quest doc                                               |
| `docs/quests/use-skill.md`            | create | skills-mcp quest doc                                              |
| `docs/quests/configure-mcp.md`        | create | skills-mcp quest doc                                              |
| `docs/quests/mcp-tool-call.md`        | create | skills-mcp quest doc                                              |

### Seed row template (copy once per quest)

```sql
INSERT INTO public.quests (id, title, description, difficulty, xp_reward, required_tool, match_rule, category, unlocks_after)
VALUES (
  '<id>',
  '<Title>',
  '<Description shown in pet quests list>',
  <1-5>,
  <xp>,
  '<ToolName or NULL>',
  '<match_rule JSON>'::jsonb,
  '<category>',
  ARRAY['<dep-id-1>', '<dep-id-2>']
)
ON CONFLICT (id) DO NOTHING;
```

### Quest doc template (one file per quest)

```markdown
---
id: <quest-id>
title: <Title>
category: <category>
difficulty: <1-5 stars>
xp_reward: <number>
required_tool: <ToolName or none>
unlocks_after: [<dep-ids or empty>]
---

## What you will learn

<One paragraph explaining the Claude Code feature this quest teaches.>

## How to trigger it

<Step-by-step instructions the learner follows to complete the quest.
Be specific: which file to edit, what string to add, which command to run.>

## Example session
```

<Illustrative Claude Code session transcript showing the tool call
that satisfies the match_rule. Include the exact file path and content change.>

```

## Tips

- <Tip 1>
- <Tip 2>
```

## Verification

```bash
# After supabase db reset, count must be exactly 20
supabase db reset
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM public.quests;"
# Expected: 20

# Check category distribution matches §7.2
psql "$DATABASE_URL" -c "SELECT category, COUNT(*) FROM public.quests GROUP BY category ORDER BY category;"
# Expected:
#  basics        | 4
#  hooks         | 4
#  permissions   | 3
#  skills-mcp    | 3
#  slash-commands| 3
#  subagents     | 3

# Verify all 16 docs files exist
for id in allow-rule deny-rule ask-once posttool-hook pretool-block sessionstart-context stop-validator create-command command-with-args project-vs-user spawn-task custom-agent-md agent-with-tools use-skill configure-mcp mcp-tool-call; do
  test -f "docs/quests/${id}.md" && echo "OK: ${id}" || echo "MISSING: ${id}"
done

# Verify no unlocks_after references a non-existent quest id
psql "$DATABASE_URL" -c "
  SELECT q.id, unnest(q.unlocks_after) AS dep
  FROM public.quests q
  WHERE NOT (unnest(q.unlocks_after) = ANY(SELECT id FROM public.quests));
"
# Expected: 0 rows

# Quest engine unit tests (match_rule DSL operators)
pnpm --filter @specops/quest-engine test
```

## Notes / Open questions

- Use the `.claude/skills/add-quest/` skill for each quest — it generates the seed INSERT, the docs file, and a Vitest test in one invocation, enforcing §7 invariants (difficulty range, xp_reward range, valid category, unlocks_after references).
- This step can be parallelized: 4 agents working simultaneously, one per category (permissions, hooks, slash-commands, subagents/skills-mcp). Each agent appends to `seed.sql` without touching the same rows. Merge order matters — run a single `supabase db reset` after all agents finish.
- The `project-vs-user` quest (slash-commands) requires server-side path resolution. The match_rule regex catches both paths; the service layer in `apps/web/lib/services/quest.ts` adds a comment explaining the ambiguity. This is acceptable for MVP per §13 Q5 (devcontainer path resolution is an open question).
- `mcp-tool-call`: the `startsWith: "mcp__"` convention matches Claude Code's MCP tool naming as of the current CLI version. If Anthropic changes this convention, this quest's match_rule must be updated — flag it in §13 as a forward-compatibility risk.
- The `agent-with-tools` quest match_rule using `tool_input.subagent_type` is provisional — verify the actual Claude Code Task tool input shape against the Claude Code docs before finalizing. If `subagent_type` is not a real field, substitute with a check for `tool_input.tools` being a non-empty array.
- XP totals: completing all 20 quests yields 50+50+50+50+100+100+150+200+200+150+150+100+150+100+150+200+250+200+300+300 = 2800 XP, which reaches Stage 4 (Operator). Stage 5 (Architect, 6000 XP) requires future quests or repeated engagement — this is intentional per §7.3.
