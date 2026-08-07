-- REVIEW ONLY. Do not run yet.
-- Atomic tenant-scoped create API. No update, cancel, delete or restore operation exists.
BEGIN;

CREATE OR REPLACE FUNCTION telio_voice.create_booking(
  p_tenant_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_sport text,
  p_court_id text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_idempotency_key text
)
RETURNS TABLE(
  id uuid, tenant_id uuid, user_id uuid, customer_name text, customer_phone text,
  sport text, court_id text, start_at timestamptz, end_at timestamptz,
  status text, notes text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_notes text;
  v_expected_courts text[];
BEGIN
  IF p_tenant_id IS DISTINCT FROM '595cbb6c-1019-41ae-b1c2-a60c13c8dcdf'::uuid THEN
    RAISE EXCEPTION 'TENANT_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  v_expected_courts := CASE p_sport
    WHEN 'badminton' THEN ARRAY['badminton-1','badminton-2','badminton-3','badminton-4','badminton-5','badminton-6','badminton-7','badminton-8','badminton-9','badminton-10']
    WHEN 'tennis' THEN ARRAY['tennis-1','tennis-2','tennis-3','tennis-4','tennis-5','tennis-6']
    WHEN 'squash' THEN ARRAY['squash-1','squash-2','squash-3','squash-4']
    WHEN 'tennis-clay' THEN ARRAY['tennis-clay-1','tennis-clay-2','tennis-clay-10','tennis-clay-11']
    ELSE NULL
  END;

  IF v_expected_courts IS NULL OR NOT (p_court_id = ANY(v_expected_courts)) THEN
    RAISE EXCEPTION 'INVALID_COURT' USING ERRCODE = '22023';
  END IF;
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2
     OR length(p_customer_name) > 120 THEN
    RAISE EXCEPTION 'INVALID_CUSTOMER_NAME' USING ERRCODE = '22023';
  END IF;
  IF p_customer_phone IS NULL OR length(p_customer_phone) < 7
     OR length(p_customer_phone) > 30 THEN
    RAISE EXCEPTION 'INVALID_CUSTOMER_PHONE' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8
     OR length(p_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING ERRCODE = '22023';
  END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at
     OR p_end_at - p_start_at > interval '3 hours' THEN
    RAISE EXCEPTION 'INVALID_BOOKING_INTERVAL' USING ERRCODE = '22023';
  END IF;

  v_notes := jsonb_build_object(
    'courtId', p_court_id,
    'source', 'own-telio-voice-assistant',
    'notes', 'Rezervácia vytvorená hlasovým asistentom Telio',
    'idempotencyKey', p_idempotency_key
  )::text;

  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || ':' || p_court_id));

  RETURN QUERY
  SELECT booking.id, booking.tenant_id, booking.user_id, booking.customer_name,
         booking.customer_phone, booking.sport, booking.court_id,
         booking.start_at, booking.end_at, booking.status, booking.notes
    FROM public.bookings booking
   WHERE booking.tenant_id = p_tenant_id AND booking.notes = v_notes
   LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings booking
     WHERE booking.tenant_id = p_tenant_id
       AND COALESCE(booking.court_id,
         substring(booking.notes FROM '"courtId"[[:space:]]*:[[:space:]]*"([^"]+)"')) = p_court_id
       AND booking.status = ANY(ARRAY['confirmed', 'pending', 'blocked'])
       AND booking.start_at < p_end_at
       AND booking.end_at > p_start_at
  ) THEN
    RAISE EXCEPTION 'BOOKING_CONFLICT' USING ERRCODE = '23P01';
  END IF;

  RETURN QUERY
  INSERT INTO public.bookings (
    tenant_id, customer_name, customer_phone, sport, court_id,
    start_at, end_at, status, notes
  ) VALUES (
    p_tenant_id, trim(p_customer_name), p_customer_phone, p_sport, p_court_id,
    p_start_at, p_end_at, 'confirmed', v_notes
  )
  RETURNING bookings.id, bookings.tenant_id, bookings.user_id, bookings.customer_name,
            bookings.customer_phone, bookings.sport, bookings.court_id,
            bookings.start_at, bookings.end_at, bookings.status, bookings.notes;
END
$function$;

REVOKE ALL ON FUNCTION telio_voice.create_booking(
  uuid, text, text, text, text, timestamptz, timestamptz, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION telio_voice.create_booking(
  uuid, text, text, text, text, timestamptz, timestamptz, text
) TO own_telio_runtime;

COMMIT;
