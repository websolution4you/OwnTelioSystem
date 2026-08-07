import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_SECONDS = 5 * 60;

function signature(callSid: string, expiresAt: number, authToken: string): Buffer {
  return createHmac('sha256', authToken).update(`${callSid}.${expiresAt}`).digest();
}

export function createMediaAccessToken(callSid: string, authToken: string, now = Date.now()): {
  expiresAt: number;
  token: string;
} {
  const expiresAt = Math.floor(now / 1000) + TOKEN_TTL_SECONDS;
  return { expiresAt, token: signature(callSid, expiresAt, authToken).toString('base64url') };
}

export function validateMediaAccessToken(
  callSid: string,
  expiresAtText: string | null,
  token: string | null,
  authToken: string,
  now = Date.now(),
): boolean {
  if (!expiresAtText || !token || !/^\d{10}$/.test(expiresAtText)) return false;
  const expiresAt = Number(expiresAtText);
  const nowSeconds = Math.floor(now / 1000);
  if (expiresAt < nowSeconds || expiresAt > nowSeconds + TOKEN_TTL_SECONDS) return false;

  let supplied: Buffer;
  try {
    supplied = Buffer.from(token, 'base64url');
  } catch {
    return false;
  }
  const expected = signature(callSid, expiresAt, authToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
