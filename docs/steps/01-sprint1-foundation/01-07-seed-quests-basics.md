---
id: 01-07-seed-quests-basics
sprint: 1
order: 7
status: in-progress
spec_refs: ['§7.1', '§7.2', '§7.3', '§11', '§5.1']
depends_on: [01-02-supabase-schema-and-rls, 01-03-quest-engine-package]
deliverables:
  - supabase/seed.sql
  - docs/quests/first-edit.md
  - docs/quests/first-bash.md
  - docs/quests/first-read.md
  - docs/quests/first-grep.md
acceptance:
  - supabase db reset seeds all 4 quests without errors
  - SELECT count(*) FROM quests WHERE category = 'basics' returns 4
  - SELECT id FROM quests WHERE category = 'basics' ORDER BY id returns first-bash, first-edit, first-grep, first-read
  - All 4 docs/quests/*.md files exist and contain required frontmatter fields
  - evaluateMatchRule with each quest's match_rule returns true for its matching event (verifiable via vitest test in packages/quest-engine)
---

## Goal

Seed the four "basics" quests from §7.2 into `supabase/seed.sql` and create their authoritative documentation files in `docs/quests/` so that Sprint 1 ends with a working end-to-end flow: user makes an Edit call → hook fires → quest-engine matches `first-edit` → XP is awarded.

## Context

SPEC.md §7.2 defines the 20-quest MVP catalog; the four basics quests (`first-edit`, `first-bash`, `first-read`, `first-grep`) are the foundation of Stage 1 (Egg, 0 XP). They must unlock immediately — no `unlocks_after` prerequisites — so a brand-new user can earn XP on their very first tool call. Per §11, every quest must have both a database seed row and a corresponding `docs/quests/<id>.md` file; PRs that add quest logic without the .md will be rejected by CODEOWNERS once that is set up. The match rules for these four quests follow the `first-edit` example from §7.1 verbatim — the only variance is `tool_name` and `xp_reward`.

## Implementation outline

- Fill in `supabase/seed.sql` under the placeholder comment added in step 01-02. Write four `INSERT INTO public.quests` statements with `ON CONFLICT (id) DO NOTHING` for idempotency (so `supabase db reset` can be run repeatedly without errors). Use the exact column names from §5.1: `id`, `title`, `description`, `difficulty`, `xp_reward`, `required_tool`, `match_rule`, `category`, `unlocks_after`, `is_active`.
- The `first-edit` row: `id = 'first-edit'`, `title = 'Primeiro Edit'`, `description = 'Use a tool Edit pela primeira vez'`, `difficulty = 1`, `xp_reward = 50`, `required_tool = 'Edit'`, `match_rule = '{"event_type":"PostToolUse","tool_name":"Edit","min_count":1}'::jsonb`, `category = 'basics'`, `unlocks_after = '{}'`, `is_active = true`. This is the verbatim example from §7.1.
- The `first-bash` row: `id = 'first-bash'`, `title = 'Primeiro Bash'`, `description = 'Use a tool Bash pela primeira vez'`, `difficulty = 1`, `xp_reward = 50`, `required_tool = 'Bash'`, `match_rule = '{"event_type":"PostToolUse","tool_name":"Bash","min_count":1}'::jsonb`, `category = 'basics'`, `unlocks_after = '{}'`, `is_active = true`.
- The `first-read` row: `id = 'first-read'`, `title = 'Primeiro Read'`, `description = 'Use a tool Read pela primeira vez'`, `difficulty = 1`, `xp_reward = 30`, `required_tool = 'Read'`, `match_rule = '{"event_type":"PostToolUse","tool_name":"Read","min_count":1}'::jsonb`, `category = 'basics'`, `unlocks_after = '{}'`, `is_active = true`. XP is 30 (lower than Edit/Bash — Read is a passive tool).
- The `first-grep` row: `id = 'first-grep'`, `title = 'Primeiro Grep'`, `description = 'Use a tool Grep pela primeira vez'`, `difficulty = 1`, `xp_reward = 30`, `required_tool = 'Grep'`, `match_rule = '{"event_type":"PostToolUse","tool_name":"Grep","min_count":1}'::jsonb`, `category = 'basics'`, `unlocks_after = '{}'`, `is_active = true`.
- Add an `INSERT INTO public.quest_progress` block below the quests seeds. This insert is conditional: for any user who already exists in `profiles` at seed time (e.g., a test user seeded during local development), insert `status = 'available'` rows for all four basics quests. Use `INSERT INTO public.quest_progress (user_id, quest_id, status) SELECT id, unnest(ARRAY['first-edit','first-bash','first-read','first-grep']), 'available' FROM public.profiles ON CONFLICT (user_id, quest_id) DO NOTHING`. For production users, `quest_progress` rows are created by a Supabase database trigger (see below).
- Create a Supabase migration (or add to `20260429000001_schema.sql`) for a `FUNCTION` + `TRIGGER` pair: `after_user_profile_created` triggers `ON INSERT ON public.profiles FOR EACH ROW` and inserts `status = 'available'` rows in `quest_progress` for all quests where `unlocks_after = '{}'` (i.e., all quests with no prerequisites). This ensures every new user immediately has the basics quests available without the CLI needing to call an additional endpoint. Add this function to the deliverables list.
- Create `docs/quests/first-edit.md` with YAML frontmatter: `id: first-edit`, `title: Primeiro Edit`, `category: basics`, `difficulty: 1`, `xp_reward: 50`, `required_tool: Edit`, `unlocks_after: []`, `status: active`. Body: describe what the Edit tool does, why it matters in Claude Code, what Claude Code skill it teaches (direct file editing vs. Write for new files), how to trigger the quest (just make any file edit while pet-trainer hooks are active), and the match_rule as a readable DSL explanation.
- Create `docs/quests/first-bash.md`, `docs/quests/first-read.md`, `docs/quests/first-grep.md` following the same structure. Each doc must explain: (1) what the tool does, (2) what Claude Code workflow it unlocks, (3) how to trigger the quest, (4) the match_rule in human-readable form.

## Files to create / modify

| Path                                            | Action | Notes                                                     |
| ----------------------------------------------- | ------ | --------------------------------------------------------- |
| `supabase/seed.sql`                             | edit   | 4x INSERT INTO quests + quest_progress seed for dev users |
| `supabase/migrations/20260429000001_schema.sql` | edit   | Add after_user_profile_created trigger function           |
| `docs/quests/first-edit.md`                     | create | Quest doc per §11 — frontmatter + body                    |
| `docs/quests/first-bash.md`                     | create | Quest doc per §11                                         |
| `docs/quests/first-read.md`                     | create | Quest doc per §11                                         |
| `docs/quests/first-grep.md`                     | create | Quest doc per §11                                         |

## Verification

```bash
# Reset DB and confirm 4 basics quests are present
supabase db reset
psql "$DATABASE_URL" -c "SELECT id, xp_reward, difficulty FROM quests WHERE category = 'basics' ORDER BY id;"
# Expected:
#    id        | xp_reward | difficulty
# -------------+-----------+-----------
#  first-bash  |        50 |          1
#  first-edit  |        50 |          1
#  first-grep  |        30 |          1
#  first-read  |        30 |          1

# Confirm match_rule JSONB is valid (not text)
psql "$DATABASE_URL" -c "SELECT id, jsonb_typeof(match_rule) FROM quests WHERE category = 'basics';"
# All rows should show: object

# Confirm trigger exists
psql "$DATABASE_URL" -c "SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'profiles';"
# Expected: after_user_profile_created

# Confirm trigger fires: insert a test profile and check quest_progress
psql "$DATABASE_URL" -c "
  INSERT INTO public.profiles (id, username, github_login)
  VALUES (gen_random_uuid(), 'testuser', 'testuser');
  SELECT quest_id, status FROM public.quest_progress WHERE user_id = (SELECT id FROM profiles WHERE username = 'testuser');
"
# Expected: 4 rows with status = 'available'

# Confirm all 4 quest docs exist
ls docs/quests/first-edit.md docs/quests/first-bash.md docs/quests/first-read.md docs/quests/first-grep.md

# Confirm frontmatter is valid YAML (requires yq or python)
for f in docs/quests/first-{edit,bash,read,grep}.md; do
  python3 -c "
import sys
content = open('$f').read()
front = content.split('---')[1]
import yaml; yaml.safe_load(front)
print('OK:', '$f')
  "
done

# Confirm quest-engine correctly evaluates first-edit match rule
pnpm vitest run packages/quest-engine/src/evaluator.test.ts -t "first-edit"
```

## Notes / Open questions

- The `add-quest` skill in `.claude/skills/add-quest/` (if present) enforces the §7 invariants automatically — use it for any quests added after this step. For these four seed quests, create the files manually to avoid circular dependencies (the skill may depend on the schema that this step creates).
- The `docs/quests/*.md` files are the canonical catalog. The `.claude/hooks/docs-reminder.js` hook (Sprint 0 artifact) checks that any modification to `supabase/seed.sql` touching quest data is accompanied by a change to the relevant `docs/quests/*.md`. If the hook is not yet installed, note this as a CI gap to close before Sprint 2.
- XP reward design rationale for the four basics: Edit (50 XP) and Bash (50 XP) are the most impactful tools for Claude Code productivity; Read (30 XP) and Grep (30 XP) are supporting tools. The total XP for completing all four basics = 160 XP, which is below the Stage 2 threshold of 200 XP (§7.3), requiring at least one more quest to evolve — this is intentional to encourage exploration beyond basics.
- The trigger function approach (vs. `pet init` calling an API endpoint) is preferred because it fires even if `pet init` is rerun or if the user is created via an alternative auth path (e.g., a future admin invite flow). Make it the authoritative mechanism.
- Future quests in other categories (permissions, hooks, subagents, etc.) land in step 02-01. Quests with `unlocks_after` arrays that reference basics quest IDs will have their `quest_progress` rows created by a separate trigger or job when the prerequisite is completed — design that logic in step 02-01.
- §7.3 Stage 1 (Egg) unlocks all basics quests. The trigger created here inserts `quest_progress` rows for quests where `unlocks_after = '{}'` — this correctly captures all basics quests without hardcoding their IDs in the trigger. If the trigger is written using `unlocks_after = '{}'` as the filter, future "no prerequisite" quests added in later sprints will also be seeded automatically.
