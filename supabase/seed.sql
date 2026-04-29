-- pet-trainer seed data
-- Idempotent: every INSERT uses ON CONFLICT DO NOTHING so `supabase db reset`
-- can run repeatedly without errors.

-- profiles
-- (no seed rows; profiles are created on first GitHub OAuth login)

-- pets
-- (no seed rows; one pet is created per user at /pet init time)

-- quests
-- The 5 basics quests from SPEC.md §7.2 (4 here; first-task lands in step 02-01).
INSERT INTO public.quests (
  id, title, description, difficulty, xp_reward, required_tool,
  match_rule, category, unlocks_after, is_active
) VALUES
  (
    'first-edit',
    'Primeiro Edit',
    'Use a tool Edit pela primeira vez',
    1, 50, 'Edit',
    '{"event_type":"PostToolUse","tool_name":"Edit","min_count":1}'::jsonb,
    'basics', '{}', true
  ),
  (
    'first-bash',
    'Primeiro Bash',
    'Use a tool Bash pela primeira vez',
    1, 50, 'Bash',
    '{"event_type":"PostToolUse","tool_name":"Bash","min_count":1}'::jsonb,
    'basics', '{}', true
  ),
  (
    'first-read',
    'Primeiro Read',
    'Use a tool Read pela primeira vez',
    1, 30, 'Read',
    '{"event_type":"PostToolUse","tool_name":"Read","min_count":1}'::jsonb,
    'basics', '{}', true
  ),
  (
    'first-grep',
    'Primeiro Grep',
    'Use a tool Grep pela primeira vez',
    1, 30, 'Grep',
    '{"event_type":"PostToolUse","tool_name":"Grep","min_count":1}'::jsonb,
    'basics', '{}', true
  )
ON CONFLICT (id) DO NOTHING;

-- quest_progress
-- Backfill for any profiles that already exist when the seed runs.
-- New profiles created after this point are handled by the
-- after_user_profile_created trigger (migration 20260429000004).
INSERT INTO public.quest_progress (user_id, quest_id, status)
SELECT p.id, q.id, 'available'
FROM public.profiles p
CROSS JOIN public.quests q
WHERE q.unlocks_after = '{}'::text[] AND q.is_active = true
ON CONFLICT (user_id, quest_id) DO NOTHING;
