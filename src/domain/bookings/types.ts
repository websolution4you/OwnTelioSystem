export const sportCourtCounts = {
  badminton: 10,
  tennis: 8,
  squash: 4,
  'tennis-clay': 4,
} as const;

export type Sport = keyof typeof sportCourtCounts;

export interface Booking {
  id: string;
  tenantId: string;
  userId: string | null;
  customerName: string;
  customerPhone: string | null;
  courtId: string;
  startAt: string;
  endAt: string;
  status: 'confirmed' | 'blocked' | 'cancelled';
  source: 'voice-assistant' | 'web' | 'admin';
}

export interface CreateBookingInput {
  tenantId: string;
  customerName: string;
  customerPhone: string;
  courtId: string;
  startAt: Date;
  endAt: Date;
  idempotencyKey: string;
  userId?: string;
}
