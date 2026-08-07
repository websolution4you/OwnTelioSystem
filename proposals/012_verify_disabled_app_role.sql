-- Metadata-only verification for own_telio_app. Does not assume the role or invoke routines.
DO $verify$
DECLARE
  v_role record;
  v_memberships integer;
BEGIN
  SELECT role.rolcanlogin, role.rolsuper, role.rolcreatedb, role.rolcreaterole,
         role.rolreplication, role.rolbypassrls, role.rolinherit,
         role.rolconnlimit, role.rolconfig
    INTO v_role
    FROM pg_roles role
   WHERE role.rolname = 'own_telio_app';

  IF NOT FOUND THEN RAISE EXCEPTION 'own_telio_app does not exist'; END IF;
  IF v_role.rolcanlogin OR v_role.rolsuper OR v_role.rolcreatedb OR v_role.rolcreaterole
     OR v_role.rolreplication OR v_role.rolbypassrls OR NOT v_role.rolinherit THEN
    RAISE EXCEPTION 'Unsafe own_telio_app role attributes';
  END IF;
  IF v_role.rolconnlimit IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'Unexpected connection limit: %', v_role.rolconnlimit;
  END IF;
  IF NOT (v_role.rolconfig @> ARRAY[
    'default_transaction_read_only=on',
    'statement_timeout=8s',
    'lock_timeout=2s',
    'idle_in_transaction_session_timeout=15s',
    'search_path=pg_catalog'
  ]::text[]) THEN
    RAISE EXCEPTION 'Missing role configuration: %', v_role.rolconfig;
  END IF;

  SELECT count(*) INTO v_memberships
    FROM pg_auth_members membership
    JOIN pg_roles parent ON parent.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
   WHERE member.rolname = 'own_telio_app'
     AND parent.rolname = 'own_telio_runtime';
  IF v_memberships <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one runtime membership';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_auth_members membership
      JOIN pg_roles parent ON parent.oid = membership.roleid
      JOIN pg_roles member ON member.oid = membership.member
     WHERE member.rolname = 'own_telio_app'
       AND parent.rolname <> 'own_telio_runtime'
  ) THEN
    RAISE EXCEPTION 'own_telio_app inherits an unexpected role';
  END IF;

  IF has_database_privilege('own_telio_app', current_database(), 'CREATE')
     OR has_schema_privilege('own_telio_app', 'public', 'CREATE')
     OR has_schema_privilege('own_telio_app', 'telio_voice', 'CREATE')
     OR has_table_privilege('own_telio_app', 'public.bookings', 'SELECT')
     OR has_table_privilege('own_telio_app', 'public.bookings', 'INSERT')
     OR has_table_privilege('own_telio_app', 'public.bookings', 'UPDATE')
     OR has_table_privilege('own_telio_app', 'public.bookings', 'DELETE')
     OR has_table_privilege('own_telio_app', 'public.booking_users', 'SELECT') THEN
    RAISE EXCEPTION 'own_telio_app has forbidden effective privileges';
  END IF;

  IF NOT has_schema_privilege('own_telio_app', 'telio_voice', 'USAGE')
     OR NOT has_function_privilege(
       'own_telio_app',
       'telio_voice.occupied_courts(uuid,timestamptz,timestamptz)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'own_telio_app is missing the restricted read API';
  END IF;
END
$verify$;

SELECT 'verified' AS disabled_app_role_status;
