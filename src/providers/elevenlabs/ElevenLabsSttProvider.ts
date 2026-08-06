import WebSocket from 'ws';
import { env } from '../../config/env.js';
import { callLogger } from '../../shared/logger.js';
import type { AudioFrame, SttProvider, SttSession } from '../../voice/contracts.js';

export class ElevenLabsSttProvider implements SttProvider {
  createSession(options: Parameters<SttProvider['createSession']>[0]): SttSession {
    if (!env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY is required');
    return new ElevenLabsSttSession(options, env.ELEVENLABS_API_KEY);
  }
}

class ElevenLabsSttSession implements SttSession {
  private socket: WebSocket | null = null;

  constructor(
    private readonly options: Parameters<SttProvider['createSession']>[0],
    private readonly apiKey: string,
  ) {}

  async start(): Promise<void> {
    const query = new URLSearchParams({
      model_id: env.ELEVENLABS_STT_MODEL,
      language_code: this.options.language,
      audio_format: 'pcm_16000',
      commit_strategy: 'vad',
    });
    this.socket = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?${query}`, {
      headers: { 'xi-api-key': this.apiKey },
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ElevenLabs STT connection timeout')), 10_000);
      this.socket!.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket!.once('error', reject);
    });
    this.socket.on('message', (data) => this.handleMessage(data.toString()));
    this.socket.on('error', (error) => this.options.onError(error));
  }

  send(frame: AudioFrame): void {
    if (frame.encoding !== 'pcm_s16le_16000' || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({
      message_type: 'input_audio_chunk',
      audio_base_64: frame.data.toString('base64'),
      sample_rate: 16_000,
    }));
  }

  commit(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ message_type: 'commit' }));
    }
  }

  async close(): Promise<void> {
    if (!this.socket) return;
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close(1000, 'call ended');
    this.socket = null;
  }

  private handleMessage(raw: string): void {
    try {
      const message = JSON.parse(raw) as Record<string, unknown>;
      const type = String(message.message_type ?? message.type ?? '');
      const text = String(message.text ?? message.transcript ?? '').trim();
      if (type.includes('partial') && text) {
        this.options.onSpeechStarted();
        this.options.onTranscript({ text, isFinal: false });
      } else if ((type.includes('committed') || type.includes('final')) && text) {
        this.options.onTranscript({ text, isFinal: true });
      } else if (type === 'error') {
        this.options.onError(new Error(String(message.error ?? message.message ?? 'ElevenLabs STT error')));
      }
    } catch (error) {
      callLogger(this.options.callId).warn({ error }, 'Ignored invalid ElevenLabs STT message');
    }
  }
}
