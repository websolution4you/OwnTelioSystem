import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.xi-api-key',
      '*.apiKey',
      '*.authToken',
      '*.customerPhone',
    ],
    censor: '[REDACTED]',
  },
});

export const callLogger = (callSid: string) => logger.child({ callSid });
