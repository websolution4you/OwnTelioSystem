import { describe, expect, it } from 'vitest';
import { bookingToolDefinitions } from './bookingTools.js';

describe('booking tool permissions', () => {
  it('exposes only read and create operations', () => {
    expect(bookingToolDefinitions.map((tool) => tool.name)).toEqual([
      'check_availability',
      'create_booking',
      'find_upcoming_bookings',
    ]);
  });

  it('never exposes destructive or mutation tools for existing bookings', () => {
    const names = bookingToolDefinitions.map((tool) => tool.name.toLowerCase());
    expect(names.some((name) => /cancel|delete|remove|update|restore/.test(name))).toBe(false);
  });
});
