import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '../config/env.js';
import { ElevenLabsTtsProvider } from '../providers/elevenlabs/ElevenLabsTtsProvider.js';
import type { AudioEncoding } from '../voice/contracts.js';
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
let encoding: AudioEncoding | null = null;
const audio: Buffer[] = [];
const provider = new ElevenLabsTtsProvider();
await provider.synthesize({
  callId: 'tts-contract-test',
  text,
  signal: new AbortController().signal,
  onAudio: (frame) => {
    if (!firstAudioAt) firstAudioAt = performance.now();
    if (encoding && encoding !== frame.encoding) throw new Error('TTS returned mixed audio encodings');
    encoding = frame.encoding;
    chunks += 1;
    audio.push(frame.data);
  },
});
const completedAt = performance.now();
const generated = Buffer.concat(audio);
if (generated.length === 0 || !encoding) throw new Error('ElevenLabs TTS returned no audio');

let durationSeconds: number;
let outputPath: string;
if (encoding === 'mulaw_8000') {
  durationSeconds = generated.length / 8_000;
  outputPath = join(outputDirectory, 'elevenlabs-direct-mulaw8k.wav');
  await writeFile(outputPath, createMulawWav(generated, 8_000));
} else {
  durationSeconds = generated.length / 32_000;
  const mulaw = pcm16ToMulaw(downsample16kTo8k(generated));
  const pcmPath = join(outputDirectory, 'elevenlabs-pcm16.wav');
  outputPath = join(outputDirectory, 'locally-converted-mulaw8k.wav');
  await writeFile(pcmPath, createPcm16Wav(generated, 16_000));
  await writeFile(outputPath, createMulawWav(mulaw, 8_000));
  process.stdout.write(`PCM_FILE: ${pcmPath}\n`);
}

process.stdout.write(`TIME_TO_FIRST_AUDIO_MS: ${Math.round(firstAudioAt - startedAt)}\n`);
process.stdout.write(`TOTAL_GENERATION_MS: ${Math.round(completedAt - startedAt)}\n`);
process.stdout.write(`AUDIO_CHUNKS: ${chunks}\n`);
process.stdout.write(`AUDIO_ENCODING: ${encoding}\n`);
process.stdout.write(`AUDIO_DURATION_SECONDS: ${durationSeconds.toFixed(3)}\n`);
process.stdout.write(`OUTPUT_FILE: ${outputPath}\n`);
