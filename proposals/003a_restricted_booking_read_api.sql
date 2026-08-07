-- REVIEW ONLY. Do not run yet.
-- Tenant-scoped read API for Own Telio. Reads no booking_users data.
BEGIN;

CREATE SCHEMA IF NOT EXISTS telio_voice;
REVOKE ALL ON SCHEMA telio_voice FROM PUBLIC;

DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'own_telio_runtime') THEN
    CREATE ROLE own_telio_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$role$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM own_telio_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM own_telio_runtime;

CREATE OR REPLACE FUNCTION telio_voice.occupied_courts(
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

CREATE OR REPLACE FUNCTION telio_voice.find_upcoming_bookings(
  p_tenant_id uuid,
  p_customer_phone text
)
RETURNS TABLE(
  id uuid, tenant_id uuid, customer_name text, customer_phone text,
  sport text, court_id text, start_at timestamptz, end_at timestamptz,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_tenant_id IS DISTINCT FROM '595cbb6c-1019-41ae-b1c2-a60c13c8dcdf'::uuid THEN
    RAISE EXCEPTION 'TENANT_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF p_customer_phone IS NULL OR length(p_customer_phone) < 7
     OR length(p_customer_phone) > 30 THEN
    RAISE EXCEPTION 'INVALID_CUSTOMER_PHONE' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT booking.id, booking.tenant_id, booking.customer_name,
         booking.customer_phone, booking.sport,
         COALESCE(booking.court_id,
           substring(booking.notes FROM '"courtId"[[:space:]]*:[[:space:]]*"([^"]+)"')),
         booking.start_at, booking.end_at, booking.status
    FROM public.bookings booking
   WHERE booking.tenant_id = p_tenant_id
     AND booking.customer_phone = p_customer_phone
     AND booking.status = 'confirmed'
     AND booking.start_at > statement_timestamp()
   ORDER BY booking.start_at ASC
   LIMIT 10;
END
$function$;

REVOKE ALL ON FUNCTION telio_voice.occupied_courts(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION telio_voice.find_upcoming_bookings(uuid, text) FROM PUBLIC;
GRANT USAGE ON SCHEMA telio_voice TO own_telio_runtime;
GRANT EXECUTE ON FUNCTION telio_voice.occupied_courts(uuid, timestamptz, timestamptz) TO own_telio_runtime;
GRANT EXECUTE ON FUNCTION telio_voice.find_upcoming_bookings(uuid, text) TO own_telio_runtime;

COMMIT;
