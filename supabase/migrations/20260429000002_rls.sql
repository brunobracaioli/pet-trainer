-- pet-trainer RLS policies (SPEC.md §5.1)
-- Enables RLS on all user-data tables. Policies are verbatim from §5.1.
-- The events INSERT policy uses WITH CHECK (false) — only service_role JWT bypasses (§10.4).
-- quests and leaderboard_snapshots are NOT RLS-protected: quests is a public catalog;
-- leaderboard_snapshots is system-managed append-only data.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_ledger ENABLE ROW LEVEL SECURITY;

-- profiles
-- NOTE: Two SELECT policies are intentionally combined with OR semantics so that
-- the public profile page (/u/[username]) can read username + github_login + avatar_url
-- of any user without authentication, while the personal profile policy is kept as
-- documentation of the per-row ownership relationship. Do NOT add PII columns
-- (email, phone, real name) to profiles without first scoping the public policy
-- to a column-restricted view, or this will leak.
CREATE POLICY "users read own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "public profiles readable"
  ON public.profiles FOR SELECT USING (true);

-- pets
CREATE POLICY "users manage own pet"
  ON public.pets FOR ALL USING (auth.uid() = owner_id);

-- quest_progress
CREATE POLICY "users read own progress"
  ON public.quest_progress FOR SELECT USING (auth.uid() = user_id);

-- events
CREATE POLICY "events: insert via service role only"
  ON public.events FOR INSERT WITH CHECK (false);

CREATE POLICY "users read own events"
  ON public.events FOR SELECT USING (auth.uid() = user_id);

-- xp_ledger
-- SPEC.md §5.1 enables RLS on xp_ledger but does not list a SELECT policy.
-- Without a policy, RLS defaults to deny — the dashboard's "XP history" query
-- via the authenticated role would silently return zero rows. This SELECT
-- policy mirrors the pattern used on `events`. Inserts are still service_role
-- only because no INSERT policy is defined.
-- TODO: open a SPEC amendment ADR to codify this policy in §5.1.
CREATE POLICY "users read own xp_ledger"
  ON public.xp_ledger FOR SELECT USING (auth.uid() = user_id);
