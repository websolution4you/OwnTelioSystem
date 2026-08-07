export const sportCourtIds = {
  badminton: Array.from({ length: 10 }, (_, index) => `badminton-${index + 1}`),
  tennis: Array.from({ length: 6 }, (_, index) => `tennis-${index + 1}`),
  squash: Array.from({ length: 4 }, (_, index) => `squash-${index + 1}`),
  'tennis-clay': ['tennis-clay-1', 'tennis-clay-2', 'tennis-clay-10', 'tennis-clay-11'],
} as const;

export type Sport = keyof typeof sportCourtIds;

export const sportCourtCounts: Record<Sport, number> = {
  badminton: sportCourtIds.badminton.length,
  tennis: sportCourtIds.tennis.length,
  squash: sportCourtIds.squash.length,
  'tennis-clay': sportCourtIds['tennis-clay'].length,
};

export interface Booking {
  id: string;
  tenantId: string;
  userId: string | null;
  customerName: string;
  customerPhone: string | null;
  courtId: string;
  startAt: string;
  endAt: string;
  status: 'confirmed' | 'pending' | 'blocked' | 'cancelled';
  source: 'own-telio-voice-assistant' | 'voice-assistant' | 'web' | 'admin';
}

export interface CreateBookingInput {
  tenantId: string;
  customerName: string;
  customerPhone: string;
  sport: Sport;
  courtId: string;
  startAt: Date;
  endAt: Date;
  idempotencyKey: string;
}
