import { z } from 'zod';
import { env } from '../../config/env.js';
import { BookingRepository } from '../../domain/bookings/BookingRepository.js';
import { sportCourtCounts, type Sport } from '../../domain/bookings/types.js';
import type { ToolDefinition } from '../../voice/contracts.js';

const sportSchema = z.enum(['badminton', 'tennis', 'squash', 'tennis-clay']);
const intervalSchema = z.object({
  sport: sportSchema,
  startAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(30).max(180),
});
const createSchema = intervalSchema.extend({
  courtId: z.string().min(3),
  customerName: z.string().min(2).max(120),
  customerPhone: z.string().min(7).max(30),
  idempotencyKey: z.string().min(8).max(200),
});
const phoneSchema = z.object({ customerPhone: z.string().min(7).max(30) });

export const bookingToolDefinitions: ToolDefinition[] = [
  {
    name: 'check_availability',
    description: 'Find free Telio courts for a sport and exact interval.',
    inputSchema: {
      type: 'object',
      properties: {
        sport: { type: 'string', enum: Object.keys(sportCourtCounts) },
        startAt: { type: 'string', description: 'ISO 8601 with Europe/Bratislava offset' },
        durationMinutes: { type: 'integer', minimum: 30, maximum: 180 },
      },
      required: ['sport', 'startAt', 'durationMinutes'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_booking',
    description: 'Create a confirmed booking after the caller explicitly confirms all details.',
    inputSchema: {
      type: 'object',
      properties: {
        sport: { type: 'string', enum: Object.keys(sportCourtCounts) },
        courtId: { type: 'string' },
        startAt: { type: 'string' },
        durationMinutes: { type: 'integer', minimum: 30, maximum: 180 },
        customerName: { type: 'string' },
        customerPhone: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      required: ['sport', 'courtId', 'startAt', 'durationMinutes', 'customerName', 'customerPhone', 'idempotencyKey'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_upcoming_bookings',
    description: 'Find upcoming confirmed bookings by caller phone.',
    inputSchema: {
      type: 'object', properties: { customerPhone: { type: 'string' } },
      required: ['customerPhone'], additionalProperties: false,
    },
  },
];

export class BookingToolExecutor {
  constructor(private readonly repository = new BookingRepository()) {}

  async execute(name: string, rawInput: unknown): Promise<unknown> {
    const tenantId = env.TELIO_TENANT_ID;
    if (!tenantId) throw new Error('TELIO_TENANT_ID is required');

    if (name === 'check_availability') {
      const input = intervalSchema.parse(rawInput);
      const start = new Date(input.startAt);
      const end = new Date(start.getTime() + input.durationMinutes * 60_000);
      const freeCourts = await this.repository.findFreeCourts(tenantId, input.sport as Sport, start, end);
      return { available: freeCourts.length > 0, freeCourts };
    }
    if (name === 'create_booking') {
      if (!env.BOOKING_WRITES_ENABLED) throw new Error('BOOKING_WRITES_DISABLED');
      const input = createSchema.parse(rawInput);
      if (!input.courtId.startsWith(`${input.sport}-`)) throw new Error('COURT_SPORT_MISMATCH');
      const start = new Date(input.startAt);
      const end = new Date(start.getTime() + input.durationMinutes * 60_000);
      const booking = await this.repository.create({
        tenantId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        courtId: input.courtId,
        startAt: start,
        endAt: end,
        idempotencyKey: input.idempotencyKey,
      });
      return { created: true, booking };
    }
    if (name === 'find_upcoming_bookings') {
      const input = phoneSchema.parse(rawInput);
      return { bookings: await this.repository.findUpcomingByPhone(tenantId, input.customerPhone) };
    }
    throw new Error(`Unknown tool: ${name}`);
  }
}
