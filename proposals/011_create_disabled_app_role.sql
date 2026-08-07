-- Creates a disabled application login role for read-path verification.
-- The role remains NOLOGIN and defaults to read-only transactions.
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
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS
  INHERIT
  CONNECTION LIMIT 4;

GRANT own_telio_runtime TO own_telio_app;

ALTER ROLE own_telio_app SET default_transaction_read_only = on;
ALTER ROLE own_telio_app SET statement_timeout = '8s';
ALTER ROLE own_telio_app SET lock_timeout = '2s';
ALTER ROLE own_telio_app SET idle_in_transaction_session_timeout = '15s';
ALTER ROLE own_telio_app SET search_path = 'pg_catalog';

COMMIT;
