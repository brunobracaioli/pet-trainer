-- pet-trainer events partition setup (SPEC.md §5.1)
-- Creates concrete monthly partitions. Idempotent: re-running supabase db reset must not error.
-- Production rotation: a pg_cron job (documented in docs/runbooks/deploy.md) creates each
-- following month's partition before the 1st.

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS public.events_2026_04
    PARTITION OF public.events
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS public.events_2026_05
    PARTITION OF public.events
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
EXCEPTION WHEN duplicate_table THEN NULL; END $$;
