-- Review before applying to the shared Telio database.
-- This migration is intentionally not executed by the application automatically.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS court_id text;

UPDATE bookings
   SET court_id = COALESCE(court_id, notes::jsonb ->> 'courtId')
 WHERE court_id IS NULL
   AND notes IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_tenant_interval_idx
  ON bookings (tenant_id, start_at, end_at)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS bookings_tenant_court_interval_idx
  ON bookings (tenant_id, court_id, start_at, end_at)
  WHERE status <> 'cancelled';

CREATE UNIQUE INDEX IF NOT EXISTS bookings_voice_idempotency_idx
  ON bookings (tenant_id, ((notes::jsonb ->> 'idempotencyKey')))
  WHERE notes::jsonb ? 'idempotencyKey';
