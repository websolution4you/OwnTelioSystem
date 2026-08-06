import WebSocket from 'ws';
import { env } from '../../config/env.js';
import type { AudioFrame, TtsProvider } from '../../voice/contracts.js';

export class ElevenLabsTtsProvider implements TtsProvider {
  async synthesize(options: Parameters<TtsProvider['synthesize']>[0]): Promise<void> {
    if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) {
      throw new Error('ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID are required');
    }
    const query = new URLSearchParams({
      model_id: env.ELEVENLABS_TTS_MODEL,
      output_format: 'pcm_16000',
      optimize_streaming_latency: '3',
    });
    const socket = new WebSocket(
      `wss://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}/stream-input?${query}`,
      { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY } },
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('ElevenLabs TTS timeout')), 30_000);
      const abort = () => socket.close(1000, 'barge-in');
      options.signal.addEventListener('abort', abort, { once: true });

      socket.on('open', () => {
        socket.send(JSON.stringify({
          text: ' ',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, use_speaker_boost: true },
          generation_config: { chunk_length_schedule: [80, 120, 180, 250] },
        }));
        socket.send(JSON.stringify({ text: options.text, try_trigger_generation: true }));
        socket.send(JSON.stringify({ text: '' }));
      });
      socket.on('message', (data) => {
        const message = JSON.parse(data.toString()) as { audio?: string; isFinal?: boolean };
        if (message.audio && !options.signal.aborted) {
          const frame: AudioFrame = {
            data: Buffer.from(message.audio, 'base64'),
            encoding: 'pcm_s16le_16000',
          };
          options.onAudio(frame);
        }
        if (message.isFinal) socket.close(1000, 'complete');
      });
      socket.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      socket.once('close', () => {
        clearTimeout(timeout);
        options.signal.removeEventListener('abort', abort);
        resolve();
      });
    });
  }
}
