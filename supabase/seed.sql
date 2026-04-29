-- pet-trainer seed data
-- Quest seed rows (the 5 basics quests from SPEC.md §7.2) are populated in step 01-07.
-- This placeholder ensures `supabase db reset` does not error on a missing seed file.

-- profiles
-- (no seed rows; profiles are created on first GitHub OAuth login)

-- pets
-- (no seed rows; one pet is created per user at /pet init time)

-- quests
-- (populated by step 01-07: first-edit, first-bash, first-read, first-grep, first-task)

-- quest_progress
-- (no seed rows; rows are inserted as users start quests)
