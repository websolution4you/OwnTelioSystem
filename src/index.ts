import formBody from '@fastify/formbody';
import Fastify from 'fastify';
import { WebSocketServer } from 'ws';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { logger } from './shared/logger.js';
import { registerTwilioRoutes } from './telephony/routes.js';
import { VoiceCallSession } from './voice/VoiceCallSession.js';

const app = Fastify({ logger: false, trustProxy: true });
const websocketServer = new WebSocketServer({ noServer: true });

await app.register(formBody);
await registerTwilioRoutes(app);

app.get('/health/live', async () => ({ status: 'ok' }));
app.get('/health/ready', async (_request, reply) => {
  try {
    if (pool) await pool.query('SELECT 1');
    return { status: 'ready', database: pool ? 'connected' : 'mock' };
  } catch {
    return reply.status(503).send({ status: 'not-ready' });
  }
});

app.server.on('upgrade', (request, socket, head) => {
  const match = request.url?.match(/^\/twilio\/media\/(CA[a-zA-Z0-9]+)(?:\?.*)?$/);
  if (!match?.[1]) {
    socket.destroy();
    return;
  }
  const callSid = match[1];
  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    const session = new VoiceCallSession(websocket, callSid);
    void session.start().catch((error) => {
      logger.error({ error, callSid }, 'Failed to start voice session');
      websocket.close(1011, 'voice session failed');
    });
  });
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Graceful shutdown started');
  websocketServer.clients.forEach((client) => client.close(1001, 'server shutdown'));
  await app.close();
  await pool?.end();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: '0.0.0.0', port: env.PORT });
logger.info({ port: env.PORT }, 'Own Telio System listening');
