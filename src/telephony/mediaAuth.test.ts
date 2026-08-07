import { describe, expect, it } from 'vitest';
import { createMediaAccessToken, validateMediaAccessToken } from './mediaAuth.js';

const callSid = 'CA1234567890abcdef';
const authToken = 'test-auth-token';
const now = Date.parse('2026-08-07T12:00:00Z');

describe('Twilio media access token', () => {
  it('accepts only the signed call within its short lifetime', () => {
    const access = createMediaAccessToken(callSid, authToken, now);
    expect(validateMediaAccessToken(callSid, String(access.expiresAt), access.token, authToken, now)).toBe(true);
    expect(validateMediaAccessToken('CAother', String(access.expiresAt), access.token, authToken, now)).toBe(false);
    expect(validateMediaAccessToken(callSid, String(access.expiresAt), `${access.token}x`, authToken, now)).toBe(false);
  });

  it('rejects expired, excessively future and malformed tokens', () => {
    const access = createMediaAccessToken(callSid, authToken, now);
    expect(validateMediaAccessToken(callSid, String(access.expiresAt), access.token, authToken, now + 301_000)).toBe(false);
    expect(validateMediaAccessToken(callSid, String(access.expiresAt + 1), access.token, authToken, now)).toBe(false);
    expect(validateMediaAccessToken(callSid, 'invalid', access.token, authToken, now)).toBe(false);
    expect(validateMediaAccessToken(callSid, null, null, authToken, now)).toBe(false);
  });
});
