import { requirePool } from '../../db/pool.js';
import type { Booking, CreateBookingInput, Sport } from './types.js';
import { sportCourtIds } from './types.js';

interface CourtOccupancyRow {
  court_id: string | null;
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
      'SELECT court_id FROM telio_voice.occupied_courts($1, $2, $3)',
      [tenantId, startAt.toISOString(), endAt.toISOString()],
    );
    const busy = new Set(result.rows.map((row) => row.court_id).filter((id): id is string => id !== null));
    return [...sportCourtIds[sport]].filter((courtId) => !busy.has(courtId));
  }

  async create(input: CreateBookingInput): Promise<Booking> {
    const result = await requirePool().query<BookingRow>(
      `SELECT * FROM telio_voice.create_booking($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.tenantId,
        input.customerName,
        input.customerPhone,
        input.sport,
        input.courtId,
        input.startAt.toISOString(),
        input.endAt.toISOString(),
        input.idempotencyKey,
      ],
    );
    const booking = result.rows[0];
    if (!booking) throw new Error('BOOKING_CREATE_EMPTY_RESULT');
    return toBooking(booking);
  }

  async findUpcomingByPhone(tenantId: string, phone: string): Promise<Booking[]> {
    const result = await requirePool().query<BookingRow>(
      'SELECT * FROM telio_voice.find_upcoming_bookings($1, $2)',
      [tenantId, phone],
    );
    return result.rows.map(toBooking);
  }
}
