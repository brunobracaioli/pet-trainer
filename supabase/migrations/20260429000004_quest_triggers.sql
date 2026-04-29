-- pet-trainer quest triggers
-- When a new profile is created, immediately seed quest_progress rows with
-- status='available' for every quest that has no prerequisites
-- (unlocks_after = '{}'). This ensures fresh users have basics quests
-- visible without the CLI needing to call an extra endpoint.

CREATE OR REPLACE FUNCTION public.after_user_profile_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.quest_progress (user_id, quest_id, status)
  SELECT NEW.id, q.id, 'available'
  FROM public.quests q
  WHERE q.unlocks_after = '{}'::text[] AND q.is_active = true
  ON CONFLICT (user_id, quest_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_user_profile_created ON public.profiles;
CREATE TRIGGER after_user_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.after_user_profile_created();
