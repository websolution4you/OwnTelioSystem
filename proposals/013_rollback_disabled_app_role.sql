-- Exact rollback for the still-disabled own_telio_app role.
BEGIN;

DO $guard$
DECLARE
  v_can_login boolean;
BEGIN
  SELECT role.rolcanlogin INTO v_can_login
    FROM pg_roles role
   WHERE role.rolname = 'own_telio_app';
  IF NOT FOUND THEN RAISE EXCEPTION 'own_telio_app does not exist'; END IF;
  IF v_can_login THEN
    RAISE EXCEPTION 'Rollback refused: own_telio_app has LOGIN enabled';
  END IF;
END
$guard$;

REVOKE own_telio_runtime FROM own_telio_app;
DROP ROLE own_telio_app;

COMMIT;
