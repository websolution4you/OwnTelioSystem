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
  BOOKING_WRITES_ENABLED: booleanFromString.default('false'),
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
  ELEVENLABS_TTS_OUTPUT_FORMAT: z.enum(['pcm_16000', 'ulaw_8000']).default('ulaw_8000'),
  ELEVENLABS_TTS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(30000),
  ELEVENLABS_TTS_STABILITY: z.coerce.number().min(0).max(1).default(0.4),
  ELEVENLABS_TTS_SIMILARITY_BOOST: z.coerce.number().min(0).max(1).default(0.75),
  ELEVENLABS_TTS_STYLE: z.coerce.number().min(0).max(1).default(0.25),
  ELEVENLABS_TTS_SPEED: z.coerce.number().min(0.7).max(1.2).default(0.84),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_LLM_MODEL: z.string().default('gpt-4o-mini'),
}).superRefine((value, context) => {
  if (value.BOOKING_WRITES_ENABLED && !value.DATABASE_URL) {
    context.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Required when booking writes are enabled' });
  }
  if (value.NODE_ENV !== 'production') return;

  const required: Array<[keyof typeof value, unknown]> = [
    ['PUBLIC_BASE_URL', value.PUBLIC_BASE_URL],
    ['TWILIO_ACCOUNT_SID', value.TWILIO_ACCOUNT_SID],
    ['TWILIO_AUTH_TOKEN', value.TWILIO_AUTH_TOKEN],
    ['TWILIO_PHONE_NUMBER', value.TWILIO_PHONE_NUMBER],
    ['DATABASE_URL', value.DATABASE_URL],
    ['TELIO_TENANT_ID', value.TELIO_TENANT_ID],
    ['ELEVENLABS_API_KEY', value.ELEVENLABS_API_KEY],
    ['ELEVENLABS_VOICE_ID', value.ELEVENLABS_VOICE_ID],
    ['OPENAI_API_KEY', value.OPENAI_API_KEY],
  ];
  for (const [path, configured] of required) {
    if (!configured) context.addIssue({ code: 'custom', path: [path], message: 'Required in production' });
  }
  if (value.PUBLIC_BASE_URL && !value.PUBLIC_BASE_URL.startsWith('https://')) {
    context.addIssue({ code: 'custom', path: ['PUBLIC_BASE_URL'], message: 'Must use HTTPS in production' });
  }
  if (!value.TWILIO_VALIDATE_SIGNATURES) {
    context.addIssue({ code: 'custom', path: ['TWILIO_VALIDATE_SIGNATURES'], message: 'Must be enabled in production' });
  }
  if (value.STT_PROVIDER !== 'elevenlabs') {
    context.addIssue({ code: 'custom', path: ['STT_PROVIDER'], message: 'Mock STT is forbidden in production' });
  }
  if (value.LLM_PROVIDER !== 'openai') {
    context.addIssue({ code: 'custom', path: ['LLM_PROVIDER'], message: 'Mock LLM is forbidden in production' });
  }
  if (value.TTS_PROVIDER !== 'elevenlabs') {
    context.addIssue({ code: 'custom', path: ['TTS_PROVIDER'], message: 'Mock TTS is forbidden in production' });
  }
});

export function parseEnvironment(input: NodeJS.ProcessEnv): z.infer<typeof schema> {
  return schema.parse(input);
}

export const env = parseEnvironment(process.env);
export type Environment = z.infer<typeof schema>;
