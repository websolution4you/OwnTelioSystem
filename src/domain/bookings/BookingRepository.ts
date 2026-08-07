import type { PoolClient } from 'pg';
import { requirePool } from '../../db/pool.js';
import type { Booking, CreateBookingInput, Sport } from './types.js';
import { sportCourtIds } from './types.js';

interface CourtOccupancyRow {
  court_id: string | null;
  notes: string | Record<string, unknown> | null;
}

interface BookingRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  sport: Sport | null;
  court_id: string | null;
  start_at: string;
  end_at: string;
  status: 'confirmed' | 'pending' | 'blocked' | 'cancelled';
  notes: string | Record<string, unknown> | null;
}

function metadata(row: { notes: string | Record<string, unknown> | null }): Record<string, unknown> {
  if (!row.notes) return {};
  if (typeof row.notes === 'object') return row.notes;
  try {
    return JSON.parse(row.notes) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function courtId(row: CourtOccupancyRow): string {
  return row.court_id ?? String(metadata(row).courtId ?? '');
}

function toBooking(row: BookingRow): Booking {
  const notes = metadata(row);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    customerName: row.customer_name ?? '',
    customerPhone: row.customer_phone,
    courtId: row.court_id ?? String(notes.courtId ?? ''),
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    source: notes.source === 'admin' || notes.source === 'web' || notes.source === 'own-telio-voice-assistant'
      ? notes.source
      : 'voice-assistant',
  };
}

export class BookingRepository {
  async findFreeCourts(tenantId: string, sport: Sport, startAt: Date, endAt: Date): Promise<string[]> {
    const result = await requirePool().query<CourtOccupancyRow>(
      `SELECT court_id, notes
         FROM bookings
        WHERE tenant_id = $1
          AND status = ANY(ARRAY['confirmed', 'pending', 'blocked'])
          AND start_at < $3
          AND end_at > $2`,
      [tenantId, startAt.toISOString(), endAt.toISOString()],
    );
    const busy = new Set(result.rows.map(courtId));
    return [...sportCourtIds[sport]].filter((courtId) => !busy.has(courtId));
  }

  async create(input: CreateBookingInput): Promise<Booking> {
    const notes = JSON.stringify({
      courtId: input.courtId,
      source: 'own-telio-voice-assistant',
      notes: 'Rezervácia vytvorená hlasovým asistentom Telio',
      idempotencyKey: input.idempotencyKey,
    });
    const client = await requirePool().connect();
    try {
      await client.query('BEGIN');
      await this.lockCourt(client, input.tenantId, input.courtId);

      const duplicate = await client.query<BookingRow>(
        `SELECT id, tenant_id, user_id, customer_name, customer_phone, sport, court_id,
                start_at, end_at, status, notes
           FROM bookings
          WHERE tenant_id = $1
            AND notes = $2
          LIMIT 1`,
        [input.tenantId, notes],
      );
      const existing = duplicate.rows[0];
      if (existing) {
        await client.query('COMMIT');
        return toBooking(existing);
      }

      const conflicts = await client.query<CourtOccupancyRow>(
        `SELECT court_id, notes
           FROM bookings
          WHERE tenant_id = $1
            AND status = ANY(ARRAY['confirmed', 'pending', 'blocked'])
            AND start_at < $3
            AND end_at > $2`,
        [input.tenantId, input.startAt.toISOString(), input.endAt.toISOString()],
      );
      if (conflicts.rows.some((row) => courtId(row) === input.courtId)) {
        throw new Error('BOOKING_CONFLICT');
      }

      const inserted = await client.query<BookingRow>(
        `INSERT INTO bookings
          (tenant_id, user_id, customer_name, customer_phone, sport, court_id, start_at, end_at, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', $9)
         RETURNING id, tenant_id, user_id, customer_name, customer_phone, sport, court_id,
                   start_at, end_at, status, notes`,
        [
          input.tenantId,
          input.userId ?? null,
          input.customerName,
          input.customerPhone,
          input.sport,
          input.courtId,
          input.startAt.toISOString(),
          input.endAt.toISOString(),
          notes,
        ],
      );
      await client.query('COMMIT');
      return toBooking(inserted.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findUpcomingByPhone(tenantId: string, phone: string): Promise<Booking[]> {
    const result = await requirePool().query<BookingRow>(
      `SELECT id, tenant_id, user_id, customer_name, customer_phone, sport, court_id,
              start_at, end_at, status, notes
         FROM bookings
        WHERE tenant_id = $1 AND customer_phone = $2
          AND status = 'confirmed' AND start_at > NOW()
        ORDER BY start_at ASC LIMIT 10`,
      [tenantId, phone],
    );
    return result.rows.map(toBooking);
  }

  private async lockCourt(client: PoolClient, tenantId: string, courtId: string): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${tenantId}:${courtId}`]);
  }
}
