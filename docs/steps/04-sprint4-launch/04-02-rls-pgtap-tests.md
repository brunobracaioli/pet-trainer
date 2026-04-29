---
id: 04-02-rls-pgtap-tests
sprint: 4
order: 2
status: not-started
spec_refs: ['§5.1', '§10.3']
depends_on: [01-02-supabase-schema-and-rls]
deliverables:
  - supabase/tests/helpers.sql
  - supabase/tests/rls_policies.sql
  - .github/workflows/ci.yml
acceptance:
  - 'pg_prove --verbose supabase/tests/rls_policies.sql passes with zero failures on local Supabase'
  - 'SELECT count(*) FROM tap_results WHERE not ok returns 0'
  - "CI rls-tests job is active (grep 'if: false' .github/workflows/ci.yml returns no match for the rls-tests job)"
  - 'All 6 RLS policies from §5.1 have at least one positive and one negative test case'
  - 'The service-role bypass test for events INSERT passes'
---

## Goal

Write a complete pgTAP test suite that covers 100% of the RLS policies defined in SPEC.md §5.1 and activate the `rls-tests` CI job so that any policy regression blocks merges to main.

## Context

SPEC.md §5.1 defines 6 RLS policies across 5 tables. SPEC.md §10.3 step 6 lists RLS policy tests (pgTAP) as a required CI gate. These tests are currently either missing or have `if: false` in the CI workflow. The most critical invariant — `events` inserts are blocked for user JWTs but allowed for the service-role key — is exactly the control that prevents client-side XP manipulation.

pgTAP must be installed in the local Supabase Postgres instance. The `supabase/tests/` directory follows the standard Supabase pgTAP convention where `pg_prove` picks up all `.sql` files.

Each test simulates a different `auth.uid()` context using `set_config('request.jwt.claims', ...)`, then runs a query and asserts the expected outcome with a pgTAP assertion (`ok()`, `is()`, `results_eq()`, `throws_ok()`).

## Implementation outline

### 1. `supabase/tests/helpers.sql`

Provide a reusable helper function that future tests can call:

```sql
-- supabase/tests/helpers.sql
-- pgTAP helpers for pet-trainer RLS tests

CREATE OR REPLACE FUNCTION tests.create_test_user(
  p_email TEXT,
  p_role  TEXT DEFAULT 'authenticated'
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID := gen_random_uuid();
BEGIN
  -- Insert into auth.users (local Supabase only — never run in production)
  INSERT INTO auth.users (id, email, role, created_at, updated_at)
  VALUES (v_user_id, p_email, p_role, NOW(), NOW())
  ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
  RETURNING id INTO v_user_id;

  -- Insert corresponding public profile
  INSERT INTO public.profiles (id, username, github_login, avatar_url)
  VALUES (
    v_user_id,
    split_part(p_email, '@', 1),
    split_part(p_email, '@', 1),
    NULL
  ) ON CONFLICT (id) DO NOTHING;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Switch the active RLS context to a given user_id
CREATE OR REPLACE FUNCTION tests.set_auth_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true -- is_local = true (resets after transaction)
  );
  PERFORM set_config('role', 'authenticated', true);
END;
$$ LANGUAGE plpgsql;

-- Clear auth context (simulate unauthenticated / anon)
CREATE OR REPLACE FUNCTION tests.set_anon() RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('role', 'anon', true);
END;
$$ LANGUAGE plpgsql;

-- Clear auth context (simulate service_role — bypasses RLS)
CREATE OR REPLACE FUNCTION tests.set_service_role() RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'service_role', true);
END;
$$ LANGUAGE plpgsql;
```

### 2. `supabase/tests/rls_policies.sql`

Write a single pgTAP test file covering all 6 policies. Structure:

```sql
BEGIN;

SELECT plan(N); -- replace N with actual test count after writing all tests

\i supabase/tests/helpers.sql

-- =========================================================
-- Setup: create two distinct test users (A and B)
-- =========================================================
DO $$
DECLARE
  user_a UUID;
  user_b UUID;
BEGIN
  user_a := tests.create_test_user('alice@test.local');
  user_b := tests.create_test_user('bob@test.local');
  -- Store in session vars for use across tests
  PERFORM set_config('tests.user_a', user_a::text, false);
  PERFORM set_config('tests.user_b', user_b::text, false);

  -- Seed: give user_a a pet
  INSERT INTO public.pets (owner_id, name, species)
  VALUES (user_a, 'Ghosty', 'gh0stnel') ON CONFLICT DO NOTHING;

  -- Seed: give user_b a pet
  INSERT INTO public.pets (owner_id, name, species)
  VALUES (user_b, 'Specter', 'gh0stnel') ON CONFLICT DO NOTHING;

  -- Seed: one quest_progress row per user
  INSERT INTO public.quest_progress (user_id, quest_id, status)
  VALUES (user_a, 'first-edit', 'in_progress') ON CONFLICT DO NOTHING;
  INSERT INTO public.quest_progress (user_id, quest_id, status)
  VALUES (user_b, 'first-edit', 'completed') ON CONFLICT DO NOTHING;
END $$;
```

**Policy 1: "public profiles readable"** (SELECT on profiles, USING true)

```sql
-- Test 1.1: unauthenticated can read any profile
PERFORM tests.set_anon();
SELECT ok(
  (SELECT count(*) FROM public.profiles) > 0,
  'anon can read profiles (public profiles readable)'
);

-- Test 1.2: authenticated user A can read user B's profile
PERFORM tests.set_auth_user(current_setting('tests.user_a')::uuid);
SELECT ok(
  EXISTS (SELECT 1 FROM public.profiles WHERE id = current_setting('tests.user_b')::uuid),
  'auth user A can read user B profile (public profiles readable)'
);
```

**Policy 2: "users manage own pet"** (ALL on pets, USING auth.uid() = owner_id)

```sql
-- Test 2.1: user A can read own pet
PERFORM tests.set_auth_user(current_setting('tests.user_a')::uuid);
SELECT ok(
  EXISTS (SELECT 1 FROM public.pets WHERE owner_id = current_setting('tests.user_a')::uuid),
  'user A can select own pet'
);

-- Test 2.2: user A CANNOT read user B's pet
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.pets WHERE owner_id = current_setting('tests.user_b')::uuid),
  'user A cannot see user B pet (RLS blocks cross-user pet access)'
);

-- Test 2.3: user A CANNOT update user B's pet (throws or affects 0 rows)
SELECT is(
  (WITH upd AS (
    UPDATE public.pets SET name = 'hacked' WHERE owner_id = current_setting('tests.user_b')::uuid
    RETURNING id
  ) SELECT count(*) FROM upd),
  0::bigint,
  'user A UPDATE on user B pet affects 0 rows'
);

-- Test 2.4: user A CAN update own pet
SELECT is(
  (WITH upd AS (
    UPDATE public.pets SET name = 'Ghosty-v2' WHERE owner_id = current_setting('tests.user_a')::uuid
    RETURNING id
  ) SELECT count(*) FROM upd),
  1::bigint,
  'user A can update own pet'
);
```

**Policy 3: "users read own progress"** (SELECT on quest_progress, USING auth.uid() = user_id)

```sql
-- Test 3.1: user A can read own quest_progress
PERFORM tests.set_auth_user(current_setting('tests.user_a')::uuid);
SELECT ok(
  EXISTS (SELECT 1 FROM public.quest_progress WHERE user_id = current_setting('tests.user_a')::uuid),
  'user A can read own quest_progress'
);

-- Test 3.2: user A CANNOT read user B's quest_progress
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.quest_progress WHERE user_id = current_setting('tests.user_b')::uuid),
  'user A cannot see user B quest_progress (RLS blocks cross-user progress)'
);
```

**Policy 4: "events: insert via service role only"** (INSERT WITH CHECK (false))

```sql
-- Test 4.1: authenticated user JWT CANNOT insert into events
PERFORM tests.set_auth_user(current_setting('tests.user_a')::uuid);
SELECT throws_ok(
  $$INSERT INTO public.events (user_id, session_id, event_type, tool_name, payload, idempotency_key)
    VALUES (
      current_setting('tests.user_a')::uuid,
      'sess-test-001', 'PostToolUse', 'Edit',
      '{"test":true}'::jsonb, 'idem-test-001'
    )$$,
  'new row violates row-level security policy for table "events"',
  'authenticated user JWT cannot INSERT into events (policy: WITH CHECK false)'
);

-- Test 4.2: service_role CAN insert into events (bypasses RLS)
PERFORM tests.set_service_role();
SELECT lives_ok(
  $$INSERT INTO public.events (user_id, session_id, event_type, tool_name, payload, idempotency_key)
    VALUES (
      current_setting('tests.user_a')::uuid,
      'sess-test-002', 'PostToolUse', 'Bash',
      '{"test":true}'::jsonb, 'idem-test-002'
    )$$,
  'service_role can INSERT into events (RLS bypass via service role)'
);
```

**Policy 5: "users read own events"** (SELECT on events, USING auth.uid() = user_id)

```sql
-- Test 5.1: user A can read own events (service_role inserted one above)
PERFORM tests.set_auth_user(current_setting('tests.user_a')::uuid);
SELECT ok(
  EXISTS (SELECT 1 FROM public.events WHERE user_id = current_setting('tests.user_a')::uuid),
  'user A can select own events'
);

-- Test 5.2: user A CANNOT read user B's events
-- (First insert an event for user B using service_role)
PERFORM tests.set_service_role();
INSERT INTO public.events (user_id, session_id, event_type, tool_name, payload, idempotency_key)
VALUES (
  current_setting('tests.user_b')::uuid,
  'sess-test-003', 'PostToolUse', 'Write',
  '{"test":true}'::jsonb, 'idem-test-003'
);

PERFORM tests.set_auth_user(current_setting('tests.user_a')::uuid);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.events WHERE user_id = current_setting('tests.user_b')::uuid),
  'user A cannot select user B events (RLS blocks cross-user event access)'
);
```

Close the file:

```sql
SELECT * FROM finish();
ROLLBACK; -- Roll back all test data — never persist test rows
```

Total test count: ~12-14 assertions. Update `SELECT plan(N)` accordingly.

### 3. Activate `rls-tests` job in `.github/workflows/ci.yml`

Find the `rls-tests` job definition. Change:

```yaml
# Before
if: false # TODO: activate when pgTAP tests are written
```

to:

```yaml
# After (remove the if: false line entirely, or set to always-true condition)
```

The job must:

1. Start Supabase local: `supabase start`
2. Wait for DB to be healthy: `supabase status` check with retry
3. Install pgTAP: `supabase db execute --file supabase/tests/install-pgtap.sql` (or via the migration that installs the extension: `CREATE EXTENSION IF NOT EXISTS pgtap;`)
4. Run tests: `pg_prove --verbose -r supabase/tests/`
5. Assert zero failures: the `pg_prove` exit code is non-zero on failure — let CI fail naturally

Example job snippet:

```yaml
rls-tests:
  name: RLS Policy Tests (pgTAP)
  runs-on: ubuntu-latest
  needs: [install]
  steps:
    - uses: actions/checkout@v4
    - uses: supabase/setup-cli@v1
      with:
        version: latest
    - name: Start Supabase local
      run: supabase start
    - name: Install pgTAP extension
      run: |
        supabase db execute --local \
          --command "CREATE EXTENSION IF NOT EXISTS pgtap;"
    - name: Install perl TAP runner
      run: sudo apt-get install -y libtap-parser-sourcehandler-pgtap-perl
    - name: Run RLS pgTAP tests
      run: pg_prove --verbose --ext .sql -r supabase/tests/
    - name: Assert zero failures
      run: |
        supabase db execute --local \
          --command "SELECT count(*) FROM tap_results WHERE not ok;" \
          | grep -q '^0$' && echo "All RLS tests passed" || exit 1
```

## Files to create / modify

| Action | Path                                                  |
| ------ | ----------------------------------------------------- |
| Create | `supabase/tests/helpers.sql`                          |
| Create | `supabase/tests/rls_policies.sql`                     |
| Modify | `.github/workflows/ci.yml` — activate `rls-tests` job |

## Verification

```bash
# 1. Start local Supabase
supabase start

# 2. Install pgTAP extension in local DB
supabase db execute --local --command "CREATE EXTENSION IF NOT EXISTS pgtap;"

# 3. Run the test file directly
pg_prove --verbose supabase/tests/rls_policies.sql

# Expected output ends with:
# Result: PASS
# Failed 0/N test scripts

# 4. Confirm zero failures via SQL
supabase db execute --local \
  --command "SELECT count(*) FROM tap_results WHERE not ok;"
# Must return 0

# 5. Verify CI job is active (no 'if: false' guard on rls-tests)
grep -A3 'rls-tests:' .github/workflows/ci.yml | grep -v 'if: false' | head -5

# 6. Confirm all 6 policies are tested by checking test descriptions
pg_prove --verbose supabase/tests/rls_policies.sql 2>&1 | grep -E '(ok|not ok)'
# All lines must start with 'ok'
```

## Notes / Open questions

- pgTAP's `throws_ok()` for the events INSERT test requires knowing the exact PostgreSQL error message string. The policy `WITH CHECK (false)` produces: `"new row violates row-level security policy for table \"events\""`. Confirm this matches in the local Supabase version before finalizing.
- The `ROLLBACK` at the end of the test file is critical — it ensures test users, pets, and events never persist in the local dev DB between test runs. If a previous run crashed mid-test and left rows, clean up with: `supabase db reset`.
- The "public profiles readable" policy (`USING (true)`) means _any_ authenticated or anon user can SELECT profiles. This is intentional (shareable public profile per §9.3). If this is ever restricted, the test in Policy 1 must be updated accordingly.
- `xp_ledger` has RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) but §5.1 does not define an explicit SELECT policy for it. This means authenticated users get zero rows by default (implicit deny). Add a test for `xp_ledger` as `Test 6.x` to confirm users can read their own ledger entries — or confirm the table intentionally returns nothing to users (API reads via service role only). Resolve this ambiguity before closing this step.
- Do not run these tests against the production Supabase project. The `create_test_user` helper inserts into `auth.users` via `SECURITY DEFINER` — this is only safe in the local Supabase instance.
