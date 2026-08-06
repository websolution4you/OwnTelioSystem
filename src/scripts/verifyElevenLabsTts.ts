import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '../config/env.js';
import { ElevenLabsTtsProvider } from '../providers/elevenlabs/ElevenLabsTtsProvider.js';
import { downsample16kTo8k, pcm16ToMulaw } from '../voice/audio/mulaw.js';
import { createMulawWav, createPcm16Wav } from '../voice/audio/wav.js';

if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) {
  throw new Error('ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be configured');
}

const text = process.argv.slice(2).join(' ').trim() || 'Dobrý deň, ako vám môžem pomôcť?';
const outputDirectory = join(tmpdir(), 'own-telio-tts-test');
await mkdir(outputDirectory, { recursive: true });

const startedAt = performance.now();
let firstAudioAt = 0;
let chunks = 0;
const audio: Buffer[] = [];
const provider = new ElevenLabsTtsProvider();
await provider.synthesize({
  callId: 'tts-contract-test',
  text,
  signal: new AbortController().signal,
  onAudio: (frame) => {
    if (!firstAudioAt) firstAudioAt = performance.now();
    chunks += 1;
    audio.push(frame.data);
  },
});
const completedAt = performance.now();
const pcm = Buffer.concat(audio);
if (pcm.length === 0) throw new Error('ElevenLabs TTS returned no audio');
const mulaw = pcm16ToMulaw(downsample16kTo8k(pcm));
const pcmPath = join(outputDirectory, 'elevenlabs-pcm16.wav');
const phonePath = join(outputDirectory, 'twilio-mulaw8k.wav');
await writeFile(pcmPath, createPcm16Wav(pcm, 16_000));
await writeFile(phonePath, createMulawWav(mulaw, 8_000));

process.stdout.write(`TIME_TO_FIRST_AUDIO_MS: ${Math.round(firstAudioAt - startedAt)}\n`);
process.stdout.write(`TOTAL_GENERATION_MS: ${Math.round(completedAt - startedAt)}\n`);
process.stdout.write(`AUDIO_CHUNKS: ${chunks}\n`);
process.stdout.write(`PCM_DURATION_SECONDS: ${(pcm.length / 32_000).toFixed(3)}\n`);
process.stdout.write(`PHONE_DURATION_SECONDS: ${(mulaw.length / 8_000).toFixed(3)}\n`);
process.stdout.write(`PCM_FILE: ${pcmPath}\n`);
process.stdout.write(`PHONE_FILE: ${phonePath}\n`);
