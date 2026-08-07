import { ElevenLabsTtsProvider } from '../providers/elevenlabs/ElevenLabsTtsProvider.js';

const provider = new ElevenLabsTtsProvider();
const controller = new AbortController();
const startedAt = performance.now();
let firstAudioAt = 0;
let abortedAt = 0;
let callbacksAtAbort = 0;
let callbacks = 0;
let bytesBeforeAbort = 0;

await provider.synthesize({
  callId: 'tts-barge-in-contract-test',
  text: 'Rozumiem. Najskôr spolu pokojne overíme dátum, čas, šport a dostupnosť kurtu. Potom vám všetky údaje zrozumiteľne zopakujem a rezerváciu vytvorím až po vašom potvrdení.',
  signal: controller.signal,
  onAudio: (frame) => {
    callbacks += 1;
    bytesBeforeAbort += frame.data.length;
    if (!firstAudioAt) {
      firstAudioAt = performance.now();
      callbacksAtAbort = callbacks;
      abortedAt = performance.now();
      controller.abort();
    }
  },
});
const resolvedAt = performance.now();
await new Promise((resolve) => setTimeout(resolve, 500));

if (!controller.signal.aborted) throw new Error('TTS barge-in test did not abort');
if (!firstAudioAt) throw new Error('TTS barge-in test received no audio');
if (callbacks !== callbacksAtAbort) {
  throw new Error(`TTS emitted ${callbacks - callbacksAtAbort} audio callbacks after barge-in`);
}
if (resolvedAt - abortedAt > 500) {
  throw new Error(`TTS took ${Math.round(resolvedAt - abortedAt)} ms to resolve after barge-in`);
}

process.stdout.write(`TIME_TO_FIRST_AUDIO_MS: ${Math.round(firstAudioAt - startedAt)}\n`);
process.stdout.write(`ABORT_TO_RESOLVED_MS: ${Math.round(resolvedAt - abortedAt)}\n`);
process.stdout.write(`AUDIO_CALLBACKS_BEFORE_ABORT: ${callbacksAtAbort}\n`);
process.stdout.write(`AUDIO_CALLBACKS_AFTER_ABORT: ${callbacks - callbacksAtAbort}\n`);
process.stdout.write(`BYTES_RECEIVED_BEFORE_ABORT: ${bytesBeforeAbort}\n`);
process.stdout.write('BARGE_IN_RESULT: passed\n');
