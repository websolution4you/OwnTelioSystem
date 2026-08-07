-- Emergency rollback for 003a only. Review before running.
-- Uses only exact object drops and refuses rollback if telio_voice contains unexpected objects.
BEGIN;

DO $guard$
DECLARE
  v_unexpected_count integer;
BEGIN
  SELECT count(*)
    INTO v_unexpected_count
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
   WHERE namespace.nspname = 'telio_voice'
     AND NOT (
       procedure.proname = 'occupied_courts'
       AND pg_get_function_identity_arguments(procedure.oid) =
           'p_tenant_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone'
     );

  IF v_unexpected_count > 0 THEN
    RAISE EXCEPTION 'Rollback refused: telio_voice contains unexpected functions';
  END IF;
END
$guard$;

REVOKE ALL ON FUNCTION telio_voice.occupied_courts(uuid, timestamptz, timestamptz)
  FROM own_telio_runtime;
REVOKE ALL ON SCHEMA telio_voice FROM own_telio_runtime;
DROP FUNCTION telio_voice.occupied_courts(uuid, timestamptz, timestamptz);
DROP SCHEMA telio_voice;
DROP ROLE own_telio_runtime;

COMMIT;
