import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import twilio from 'twilio';
import { env } from '../config/env.js';
import { logger } from '../shared/logger.js';
import { failureTwiml, mediaStreamTwiml } from './twiml.js';

function publicRequestUrl(request: FastifyRequest): string {
  if (env.PUBLIC_BASE_URL) return `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}${request.url}`;
  const protocol = String(request.headers['x-forwarded-proto'] ?? 'https').split(',')[0];
  return `${protocol}://${request.headers.host}${request.url}`;
}

function hasValidTwilioSignature(request: FastifyRequest): boolean {
  if (!env.TWILIO_VALIDATE_SIGNATURES || env.NODE_ENV !== 'production') return true;
  if (!env.TWILIO_AUTH_TOKEN) return false;
  const signature = request.headers['x-twilio-signature'];
  if (typeof signature !== 'string') return false;
  return twilio.validateRequest(
    env.TWILIO_AUTH_TOKEN,
    signature,
    publicRequestUrl(request),
    (request.body ?? {}) as Record<string, string>,
  );
}

export async function registerTwilioRoutes(app: FastifyInstance): Promise<void> {
  app.post('/twilio/incoming', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.type('text/xml');
    if (!hasValidTwilioSignature(request)) {
      logger.warn('Rejected Twilio webhook with invalid signature');
      return reply.status(403).send(failureTwiml());
    }

    const body = (request.body ?? {}) as Record<string, string>;
    const callSid = body.CallSid;
    if (!callSid || !/^CA[a-zA-Z0-9]+$/.test(callSid) || !env.PUBLIC_BASE_URL) {
      return reply.status(400).send(failureTwiml());
    }
    const websocketBase = env.PUBLIC_BASE_URL.replace(/^http/, 'ws').replace(/\/$/, '');
    return reply.send(mediaStreamTwiml(`${websocketBase}/twilio/media/${callSid}`));
  });

  app.post('/twilio/status', async (request, reply) => {
    if (!hasValidTwilioSignature(request)) return reply.status(403).send({ ok: false });
    logger.info({ status: request.body }, 'Twilio status callback');
    return reply.send({ ok: true });
  });
}
