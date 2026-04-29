---
name: add-quest
description: Add a new quest to the pet-trainer catalog end-to-end (docs + seed + Vitest), enforcing SPEC.md §7 invariants. Use when the user asks to "add a quest", "create quest <id>", "novo quest", or invokes /quest-new.
---

# add-quest

Adds **one** new quest to the pet-trainer catalog by writing three artifacts in lockstep:

1. Documentation — `docs/quests/<id>.md` (source of truth per SPEC.md §11)
2. Database seed row — appended to `supabase/seed.sql`
3. Vitest — `packages/quest-engine/test/match-rule.<id>.test.ts`

Refuses the operation if any invariant from SPEC.md §7 is violated.

## When to use

- User says "add a quest", "criar quest", "new quest", or runs `/quest-new`.
- User wants to extend the MVP catalog (target: 20 quests per SPEC.md §7.2).

## When NOT to use

- Modifying an existing quest — edit the three files directly with care.
- Bulk import of >5 quests at once — use this skill iteratively, but consider asking the user if they want a bulk reviewer agent first.
- Adding a quest in a category not yet in SPEC.md §7.2 — stop, ask the user to amend the spec via `/adr-new` first.

## Procedure

### 1. Validate the id
- Format: `^[a-z][a-z0-9-]+$` (kebab-case, must start with a letter).
- Uniqueness: check both `docs/quests/<id>.md` does not exist AND no `INSERT INTO public.quests` row with that id is present in `supabase/seed.sql`.
- If either check fails: refuse, list the conflicting artifact, stop.

### 2. Pick the category
Must be one of (SPEC.md §7.2):
- `basics`, `permissions`, `hooks`, `slash-commands`, `subagents`, `skills-mcp`

If the user proposes a new category: STOP. Tell them to amend SPEC.md §7.2 first via `/adr-new`. Do not invent categories.

### 3. Decide `unlocks_after`
- Read the frontmatter of every existing `docs/quests/*.md` to build the dependency graph.
- Reject configurations that create a cycle, reference an unknown id, or leave the new quest unreachable from a stage-1 root (orphan).
- Defaults: category `basics` → `[]`. Other categories → at least one entry from the basics set.

### 4. Define the `match_rule`
Use only operators allowed by SPEC.md §7.1:
`equals, contains, startsWith, endsWith, regex, min_count, gte, lte, in, and, or, not`.

Required fields: `event_type` (one of `PostToolUse`, `PreToolUse`, `Stop`, `SessionStart`) and `tool_name` when applicable.

Reject any rule using operators outside the allowlist; refuse and ask the user to either rephrase or extend the DSL via ADR.

### 5. Write `docs/quests/<id>.md`

```markdown
---
id: <id>
title: <Title Case>
description: <one sentence, imperative>
difficulty: <1-5>
xp_reward: <int>
category: <category from §7.2>
required_tool: <Edit|Write|Bash|Task|...|null>
unlocks_after: [<id>, ...]
match_rule:
  event_type: <event>
  tool_name: <tool>
  # ... rest mirroring the JSON form from §7.1
---

# <Title>

<2-4 sentences: what the user does, why it matters, and a link to the
relevant Claude Code docs section (hooks / slash commands / subagents
/ permissions / MCP / skills).>

## How to complete

<step-by-step from the user's POV>

## Validation

<which event the engine listens for, in plain English>
```

### 6. Append the seed row to `supabase/seed.sql`

If `supabase/seed.sql` does not exist yet, create it with this header:

```sql
-- pet-trainer quest catalog seed
-- Source of truth: docs/quests/*.md (SPEC.md §11 docs-as-code)
-- Idempotent: re-running upserts the catalog without duplicating rows.
```

Append (mirror the .md frontmatter exactly):

```sql
INSERT INTO public.quests (id, title, description, difficulty, xp_reward, required_tool, match_rule, category, unlocks_after, is_active)
VALUES (
  '<id>',
  '<title>',
  '<description>',
  <difficulty>,
  <xp_reward>,
  <NULL or 'Edit'/'Write'/...>,
  '<match_rule as JSON>'::jsonb,
  '<category>',
  ARRAY[<unlocks_after as text[]>]::text[],
  true
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  difficulty = EXCLUDED.difficulty,
  xp_reward = EXCLUDED.xp_reward,
  required_tool = EXCLUDED.required_tool,
  match_rule = EXCLUDED.match_rule,
  category = EXCLUDED.category,
  unlocks_after = EXCLUDED.unlocks_after,
  is_active = EXCLUDED.is_active;
```

### 7. Write the Vitest

Path: `packages/quest-engine/test/match-rule.<id>.test.ts`.

Required: 1 positive case + ≥1 negative case (a near-miss like right tool + wrong file path).

```ts
import { describe, it, expect } from 'vitest';
import { evaluate } from '../src/index';
// import the actual quest record / match_rule from the engine's seed loader

describe('quest <id> match_rule', () => {
  it('matches a positive event', () => {
    const event = { /* shape that should trigger completion */ };
    expect(evaluate(matchRule, event)).toBe(true);
  });

  it('does NOT match a near-miss', () => {
    const event = { /* shape with one critical field flipped */ };
    expect(evaluate(matchRule, event)).toBe(false);
  });
});
```

If `packages/quest-engine/src/index.ts` does not exist yet (Sprint 0/1 not landed), write the file with extension `.test.ts.todo` instead and tell the user to rename + backfill once the engine ships.

### 8. Verify

If the engine and Vitest are installed:

```
pnpm vitest run packages/quest-engine/test/match-rule.<id>.test.ts
```

Otherwise, just confirm the three files exist and parse:

- `jq -e .` over the JSON inside the `match_rule` block,
- markdown frontmatter loads (no YAML errors),
- seed row passes `psql -c '\\i supabase/seed.sql' --dry-run`-equivalent (or skip if Postgres not available locally).

## Output to the user

End with:

| Artifact | Path |
|---|---|
| Doc | `docs/quests/<id>.md` |
| Seed row | `supabase/seed.sql` (line N) |
| Test | `packages/quest-engine/test/match-rule.<id>.test.ts` |

Plus:

- Suggested commit message: `feat(quests): add <id> (<category>)`.
- Reminder to run `pnpm vitest` before commit.
