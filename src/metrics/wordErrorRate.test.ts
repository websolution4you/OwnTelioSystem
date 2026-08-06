import { describe, expect, it } from 'vitest';
import { normalizeTranscript, wordErrorRate } from './wordErrorRate.js';

describe('wordErrorRate', () => {
  it('ignores Slovak diacritics, case and punctuation', () => {
    expect(normalizeTranscript('Rezervovať kurt, prosím.')).toEqual(['rezervovat', 'kurt', 'prosim']);
    expect(wordErrorRate('rezervovat kurt prosim', 'Rezervovať kurt, prosím.').rate).toBe(0);
  });

  it('counts the first Scribe sample substitution and insertion', () => {
    const result = wordErrorRate(
      'potreboval by som si rezervovat kurt na zajtra na desiatu hodinu',
      'Otvor by som si rezervovať kurt na zajtra na desiatu hodinu. Ďakujem.',
    );
    expect(result).toMatchObject({
      referenceWords: 11,
      substitutions: 1,
      insertions: 1,
      deletions: 0,
      errors: 2,
    });
    expect(result.rate).toBeCloseTo(2 / 11);
  });
});
