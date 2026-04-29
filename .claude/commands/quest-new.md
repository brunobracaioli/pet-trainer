---
description: Scaffold a new quest using the add-quest skill.
argument-hint: <quest-id>
---

The user wants to add a new quest to the pet-trainer catalog.

Quest id from arguments: `$ARGUMENTS`

Invoke the `add-quest` skill (`.claude/skills/add-quest/SKILL.md`) and follow its procedure step by step.

If `$ARGUMENTS` is empty:
- Ask the user for the quest id (kebab-case) AND the category (one of the six in SPEC.md §7.2).
- Do not start writing files until those are nailed down.

If `$ARGUMENTS` is set but the skill's validation steps 1–4 fail (id collision, unknown category, dependency cycle, malformed match_rule), stop and report the failure — do NOT half-write artifacts.

The skill writes three artifacts in lockstep: `docs/quests/<id>.md`, a row in `supabase/seed.sql`, and a Vitest in `packages/quest-engine/test/`. Don't skip any — the catalog is docs-as-code per SPEC.md §11.
