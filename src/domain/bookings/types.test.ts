import { describe, expect, it } from 'vitest';
import { sportCourtCounts, sportCourtIds } from './types.js';

describe('production court inventory', () => {
  it('contains exactly ten badminton courts', () => {
    expect(sportCourtIds.badminton).toEqual([
      'badminton-1', 'badminton-2', 'badminton-3', 'badminton-4', 'badminton-5',
      'badminton-6', 'badminton-7', 'badminton-8', 'badminton-9', 'badminton-10',
    ]);
    expect(sportCourtCounts.badminton).toBe(10);
  });

  it('matches the current newbookings court identifiers', () => {
    expect(sportCourtIds.tennis).toEqual([
      'tennis-1', 'tennis-2', 'tennis-3', 'tennis-4', 'tennis-5', 'tennis-6',
    ]);
    expect(sportCourtIds.squash).toEqual([
      'squash-1', 'squash-2', 'squash-3', 'squash-4',
    ]);
    expect(sportCourtIds['tennis-clay']).toEqual([
      'tennis-clay-1', 'tennis-clay-2', 'tennis-clay-10', 'tennis-clay-11',
    ]);
  });
});
