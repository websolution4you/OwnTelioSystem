-- Approved read-only deployment after successful transactional dry-run.
-- Tenant-scoped availability API for Own Telio. Returns court IDs only; no customer data.
BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run as postgres, not %', current_user;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'telio_voice') THEN
    RAISE EXCEPTION 'telio_voice schema already exists';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'own_telio_runtime') THEN
    RAISE EXCEPTION 'own_telio_runtime role already exists';
  END IF;
END
$preflight$;

CREATE ROLE own_telio_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE SCHEMA telio_voice AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA telio_voice FROM PUBLIC;

REVOKE CREATE ON SCHEMA public FROM own_telio_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM own_telio_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM own_telio_runtime;

CREATE FUNCTION telio_voice.occupied_courts(
  p_tenant_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
RETURNS TABLE(court_id text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_tenant_id IS DISTINCT FROM '595cbb6c-1019-41ae-b1c2-a60c13c8dcdf'::uuid THEN
    RAISE EXCEPTION 'TENANT_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at
     OR p_end_at - p_start_at > interval '4 hours' THEN
    RAISE EXCEPTION 'INVALID_BOOKING_INTERVAL' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT DISTINCT COALESCE(
           booking.court_id,
           substring(booking.notes FROM '"courtId"[[:space:]]*:[[:space:]]*"([^"]+)"')
         )
    FROM public.bookings booking
   WHERE booking.tenant_id = p_tenant_id
     AND booking.status = ANY(ARRAY['confirmed', 'pending', 'blocked'])
     AND booking.start_at < p_end_at
     AND booking.end_at > p_start_at;
END
$function$;

REVOKE ALL ON FUNCTION telio_voice.occupied_courts(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT USAGE ON SCHEMA telio_voice TO own_telio_runtime;
GRANT EXECUTE ON FUNCTION telio_voice.occupied_courts(uuid, timestamptz, timestamptz) TO own_telio_runtime;

COMMIT;
