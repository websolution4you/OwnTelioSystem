-- Run only after 003a_restricted_booking_read_api.sql succeeds.
-- Verifies grants and executes only the anonymous occupied-court read function.
BEGIN TRANSACTION READ ONLY;

DO $verify$
DECLARE
  v_owner text;
  v_security_definer boolean;
  v_config text[];
BEGIN
  SELECT owner.rolname, procedure.prosecdef, procedure.proconfig
    INTO v_owner, v_security_definer, v_config
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_roles owner ON owner.oid = procedure.proowner
   WHERE namespace.nspname = 'telio_voice'
     AND procedure.proname = 'occupied_courts'
     AND pg_get_function_identity_arguments(procedure.oid) =
         'p_tenant_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone';

  IF v_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'Unexpected function owner: %', v_owner;
  END IF;
  IF v_security_definer IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'occupied_courts is not SECURITY DEFINER';
  END IF;
  IF v_config IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[] THEN
    RAISE EXCEPTION 'Unsafe function configuration: %', v_config;
  END IF;

  IF has_function_privilege('anon', 'telio_voice.occupied_courts(uuid,timestamptz,timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'telio_voice.occupied_courts(uuid,timestamptz,timestamptz)', 'EXECUTE')
     OR has_function_privilege('service_role', 'telio_voice.occupied_courts(uuid,timestamptz,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'A Supabase API role can execute occupied_courts';
  END IF;

  IF NOT has_function_privilege(
    'own_telio_runtime',
    'telio_voice.occupied_courts(uuid,timestamptz,timestamptz)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'own_telio_runtime cannot execute occupied_courts';
  END IF;

  IF has_table_privilege('own_telio_runtime', 'public.bookings', 'SELECT')
     OR has_table_privilege('own_telio_runtime', 'public.bookings', 'INSERT')
     OR has_table_privilege('own_telio_runtime', 'public.bookings', 'UPDATE')
     OR has_table_privilege('own_telio_runtime', 'public.bookings', 'DELETE')
     OR has_table_privilege('own_telio_runtime', 'public.booking_users', 'SELECT') THEN
    RAISE EXCEPTION 'own_telio_runtime has forbidden direct table privileges';
  END IF;
END
$verify$;

SET LOCAL ROLE own_telio_runtime;

SELECT court_id
  FROM telio_voice.occupied_courts(
    '595cbb6c-1019-41ae-b1c2-a60c13c8dcdf'::uuid,
    statement_timestamp(),
    statement_timestamp() + interval '30 minutes'
  )
 ORDER BY court_id;

ROLLBACK;
