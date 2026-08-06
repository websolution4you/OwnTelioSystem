import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { env } from '../config/env.js';
import { ElevenLabsSttProvider } from '../providers/elevenlabs/ElevenLabsSttProvider.js';

const audioPath = process.argv[2];
if (!audioPath) {
  throw new Error('Usage: npm run verify:scribe -- <path-to-raw-ulaw-8000-file>');
}
if (!env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY is not configured');

const audio = await readFile(resolve(audioPath));
if (audio.length < 8000) {
  throw new Error('The raw ulaw_8000 sample must contain at least one second of audio');
}

const connectionStartedAt = performance.now();
let audioStartedAt = 0;
let audioEndedAt = 0;
let firstPartialAt = 0;
let committedAt = 0;
let committedText = '';
let resolveCommitted: (() => void) | null = null;
let rejectCommitted: ((error: Error) => void) | null = null;
const committed = new Promise<void>((resolvePromise, rejectPromise) => {
  resolveCommitted = resolvePromise;
  rejectCommitted = rejectPromise;
});

const session = new ElevenLabsSttProvider().createSession({
  callId: 'scribe-contract-test',
  language: 'sk',
  onSpeechStarted: () => undefined,
  onTranscript: (event) => {
    if (!event.isFinal && !firstPartialAt) firstPartialAt = performance.now();
    if (event.isFinal) {
      committedAt = performance.now();
      committedText = event.text;
      resolveCommitted?.();
    }
    process.stdout.write(`${event.isFinal ? 'COMMITTED' : 'PARTIAL'}: ${event.text}\n`);
  },
  onError: (error) => rejectCommitted?.(error),
});

try {
  await session.start();
  const sessionReadyAt = performance.now();
  process.stdout.write(`SESSION_READY_MS: ${Math.round(sessionReadyAt - connectionStartedAt)}\n`);

  audioStartedAt = performance.now();
  for (let offset = 0; offset < audio.length; offset += 160) {
    const frame = audio.subarray(offset, Math.min(offset + 160, audio.length));
    session.send({ data: frame, encoding: 'mulaw_8000' });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  audioEndedAt = performance.now();

  if (env.ELEVENLABS_STT_COMMIT_STRATEGY === 'manual') {
    session.commit();
  } else {
    for (let index = 0; index < 75; index += 1) {
      session.send({ data: Buffer.alloc(160, 0xff), encoding: 'mulaw_8000' });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    }
  }

  await Promise.race([
    committed,
    new Promise<never>((_, rejectPromise) => {
      setTimeout(() => rejectPromise(new Error('No committed transcript received within 15 seconds')), 15_000);
    }),
  ]);

  process.stdout.write(`FIRST_PARTIAL_FROM_AUDIO_START_MS: ${firstPartialAt ? Math.round(firstPartialAt - audioStartedAt) : 'none'}\n`);
  process.stdout.write(`COMMITTED_FROM_AUDIO_END_MS: ${Math.round(committedAt - audioEndedAt)}\n`);
  process.stdout.write(`FINAL_TEXT: ${committedText}\n`);
} finally {
  await session.close();
}
