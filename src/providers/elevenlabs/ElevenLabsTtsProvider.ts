import WebSocket from 'ws';
import { env } from '../../config/env.js';
import type { AudioFrame, TtsProvider } from '../../voice/contracts.js';

export class ElevenLabsTtsProvider implements TtsProvider {
  async synthesize(options: Parameters<TtsProvider['synthesize']>[0]): Promise<void> {
    if (options.signal.aborted) return;
    if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) {
      throw new Error('ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID are required');
    }
    const query = new URLSearchParams({
      model_id: env.ELEVENLABS_TTS_MODEL,
      output_format: env.ELEVENLABS_TTS_OUTPUT_FORMAT,
      optimize_streaming_latency: '3',
    });
    const socket = new WebSocket(
      `wss://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}/stream-input?${query}`,
    );

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        options.signal.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve();
      };
      const timeout = setTimeout(() => {
        socket.close(1000, 'timeout');
        finish(new Error('ELEVENLABS_TTS_TIMEOUT'));
      }, env.ELEVENLABS_TTS_TIMEOUT_MS);
      const abort = () => {
        socket.close(1000, 'barge-in');
        finish();
      };
      options.signal.addEventListener('abort', abort, { once: true });

      socket.on('open', () => {
        if (options.signal.aborted) {
          abort();
          return;
        }
        socket.send(JSON.stringify({
          text: ' ',
          voice_settings: {
            stability: env.ELEVENLABS_TTS_STABILITY,
            similarity_boost: env.ELEVENLABS_TTS_SIMILARITY_BOOST,
            use_speaker_boost: true,
            style: env.ELEVENLABS_TTS_STYLE,
            speed: env.ELEVENLABS_TTS_SPEED,
          },
          generation_config: { chunk_length_schedule: [80, 120, 180, 250] },
          xi_api_key: env.ELEVENLABS_API_KEY,
        }));
        socket.send(JSON.stringify({ text: options.text, flush: true }));
        socket.send(JSON.stringify({ text: '' }));
      });
      socket.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as {
            audio?: string;
            isFinal?: boolean;
            error?: string;
            message?: string;
            detail?: string | { message?: string };
          };
          if (message.error || message.detail) {
            const detail = typeof message.detail === 'object' ? message.detail.message : message.detail;
            finish(new Error(`ELEVENLABS_TTS_ERROR: ${message.error ?? detail ?? message.message ?? 'unknown'}`));
            socket.close(1000, 'provider error');
            return;
          }
          if (message.audio && !options.signal.aborted) {
            const frame: AudioFrame = {
              data: Buffer.from(message.audio, 'base64'),
              encoding: env.ELEVENLABS_TTS_OUTPUT_FORMAT === 'ulaw_8000' ? 'mulaw_8000' : 'pcm_s16le_16000',
            };
            options.onAudio(frame);
          }
          if (message.isFinal) {
            finish();
            socket.close(1000, 'complete');
          }
        } catch {
          finish(new Error('ELEVENLABS_TTS_INVALID_MESSAGE'));
          socket.close(1000, 'invalid message');
        }
      });
      socket.once('error', (error) => finish(error));
      socket.once('close', (code, reason) => {
        if (code === 1000 || options.signal.aborted) finish();
        else finish(new Error(`ELEVENLABS_TTS_SOCKET_CLOSED: ${code} ${reason.toString()}`.trim()));
      });
    });
  }
}
