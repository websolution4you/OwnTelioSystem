import { describe, expect, it } from 'vitest';
import { parseEnvironment } from './env.js';

const production = {
  NODE_ENV: 'production',
  PUBLIC_BASE_URL: 'https://voice.example.com',
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_AUTH_TOKEN: 'secret',
  TWILIO_PHONE_NUMBER: '+421900000000',
  TWILIO_VALIDATE_SIGNATURES: 'true',
  DATABASE_URL: 'postgresql://runtime:secret@example.com/postgres',
  BOOKING_WRITES_ENABLED: 'false',
  TELIO_TENANT_ID: '595cbb6c-1019-41ae-b1c2-a60c13c8dcdf',
  STT_PROVIDER: 'elevenlabs',
  LLM_PROVIDER: 'openai',
  TTS_PROVIDER: 'elevenlabs',
  ELEVENLABS_API_KEY: 'secret',
  ELEVENLABS_VOICE_ID: 'voice',
  OPENAI_API_KEY: 'secret',
} satisfies NodeJS.ProcessEnv;

describe('environment safety', () => {
  it('accepts a complete production configuration with writes disabled', () => {
    expect(parseEnvironment(production).BOOKING_WRITES_ENABLED).toBe(false);
  });

  it('rejects mock providers and disabled Twilio validation in production', () => {
    expect(() => parseEnvironment({
      ...production,
      STT_PROVIDER: 'mock',
      TWILIO_VALIDATE_SIGNATURES: 'false',
    })).toThrow();
  });
});
