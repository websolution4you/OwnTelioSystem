-- Transactional rehearsal for creating the disabled application role.
-- Always rolls back and leaves no own_telio_app role behind.
BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run as postgres, not %', current_user;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'own_telio_runtime') THEN
    RAISE EXCEPTION 'Required role own_telio_runtime does not exist';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'own_telio_app') THEN
    RAISE EXCEPTION 'own_telio_app role already exists';
  END IF;
END
$preflight$;

CREATE ROLE own_telio_app
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  INHERIT CONNECTION LIMIT 4;
GRANT own_telio_runtime TO own_telio_app;
ALTER ROLE own_telio_app SET default_transaction_read_only = on;
ALTER ROLE own_telio_app SET statement_timeout = '8s';
ALTER ROLE own_telio_app SET lock_timeout = '2s';
ALTER ROLE own_telio_app SET idle_in_transaction_session_timeout = '15s';
ALTER ROLE own_telio_app SET search_path = 'pg_catalog';

DO $verify$
DECLARE
  v_can_login boolean;
  v_memberships integer;
BEGIN
  SELECT role.rolcanlogin INTO v_can_login
    FROM pg_roles role
   WHERE role.rolname = 'own_telio_app';
  IF v_can_login IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'own_telio_app is unexpectedly login-enabled';
  END IF;

  SELECT count(*) INTO v_memberships
    FROM pg_auth_members membership
    JOIN pg_roles parent ON parent.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
   WHERE member.rolname = 'own_telio_app'
     AND parent.rolname = 'own_telio_runtime';
  IF v_memberships <> 1 THEN
    RAISE EXCEPTION 'Runtime membership was not applied';
  END IF;

  IF has_table_privilege('own_telio_app', 'public.bookings', 'SELECT')
     OR has_table_privilege('own_telio_app', 'public.booking_users', 'SELECT')
     OR NOT has_function_privilege(
       'own_telio_app',
       'telio_voice.occupied_courts(uuid,timestamptz,timestamptz)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Unexpected effective privileges';
  END IF;
END
$verify$;

ROLLBACK;

SELECT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'own_telio_app'
) AS app_role_still_exists;
