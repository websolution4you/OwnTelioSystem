import { describe, expect, it } from 'vitest';
import { bookingToolDefinitions } from './bookingTools.js';

describe('booking tool permissions', () => {
  it('exposes only anonymous availability and create operations', () => {
    expect(bookingToolDefinitions.map((tool) => tool.name)).toEqual([
      'check_availability',
      'create_booking',
    ]);
  });

  it('never exposes destructive or mutation tools for existing bookings', () => {
    const names = bookingToolDefinitions.map((tool) => tool.name.toLowerCase());
    expect(names.some((name) => /find|list|cancel|delete|remove|update|restore/.test(name))).toBe(false);
  });
});
