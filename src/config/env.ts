import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DRY_RUN: booleanFromString.default('true'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_VALIDATE_SIGNATURES: booleanFromString.default('true'),
  DATABASE_URL: z.string().optional(),
  TELIO_TENANT_ID: z.string().uuid().optional(),
  TELIO_TIME_ZONE: z.string().default('Europe/Bratislava'),
  STT_PROVIDER: z.enum(['mock', 'elevenlabs']).default('mock'),
  LLM_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  TTS_PROVIDER: z.enum(['mock', 'elevenlabs']).default('mock'),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  ELEVENLABS_STT_MODEL: z.string().default('scribe_v2_realtime'),
  ELEVENLABS_STT_AUDIO_FORMAT: z.enum(['ulaw_8000', 'pcm_16000']).default('ulaw_8000'),
  ELEVENLABS_STT_COMMIT_STRATEGY: z.enum(['vad', 'manual']).default('vad'),
  ELEVENLABS_STT_CHUNK_MS: z.coerce.number().int().min(100).max(1000).default(100),
  ELEVENLABS_STT_VAD_SILENCE_SECONDS: z.coerce.number().min(0.3).max(3).default(1),
  ELEVENLABS_STT_VAD_THRESHOLD: z.coerce.number().min(0).max(1).default(0.4),
  ELEVENLABS_STT_MIN_SPEECH_MS: z.coerce.number().int().min(50).max(2000).default(100),
  ELEVENLABS_STT_MIN_SILENCE_MS: z.coerce.number().int().min(50).max(2000).default(100),
  ELEVENLABS_STT_SESSION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  ELEVENLABS_TTS_MODEL: z.string().default('eleven_flash_v2_5'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_LLM_MODEL: z.string().default('gpt-4o-mini'),
});

export const env = schema.parse(process.env);
export type Environment = z.infer<typeof schema>;
