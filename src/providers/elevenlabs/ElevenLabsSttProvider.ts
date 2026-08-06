import WebSocket from 'ws';
import { env } from '../../config/env.js';
import { callLogger } from '../../shared/logger.js';
import type { AudioFrame, SttProvider, SttSession } from '../../voice/contracts.js';
import { AudioFrameAggregator } from '../../voice/audio/AudioFrameAggregator.js';
import { twilioToStt } from '../../voice/audio/twilioAudio.js';

export class ElevenLabsSttProvider implements SttProvider {
  createSession(options: Parameters<SttProvider['createSession']>[0]): SttSession {
    if (!env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY is required');
    return new ElevenLabsSttSession(options, env.ELEVENLABS_API_KEY);
  }
}

const errorEventTypes = new Set([
  'auth_error',
  'quota_exceeded',
  'transcriber_error',
  'input_error',
  'error',
  'commit_throttled',
  'rate_limited',
  'queue_overflow',
  'resource_exhausted',
  'session_time_limit_exceeded',
  'chunk_size_exceeded',
  'insufficient_audio_activity',
  'unaccepted_terms',
]);

class ElevenLabsSttSession implements SttSession {
  private socket: WebSocket | null = null;
  private readonly audio = new AudioFrameAggregator(env.ELEVENLABS_STT_AUDIO_FORMAT === 'ulaw_8000' ? 'mulaw_8000' : 'pcm_s16le_16000', env.ELEVENLABS_STT_CHUNK_MS);
  private sessionStarted = false;
  private startResolve: (() => void) | null = null;
  private startReject: ((error: Error) => void) | null = null;
  private startTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly options: Parameters<SttProvider['createSession']>[0],
    private readonly apiKey: string,
  ) {}

  async start(): Promise<void> {
    if (this.socket) throw new Error('ElevenLabs STT session already started');
    const query = new URLSearchParams({
      model_id: env.ELEVENLABS_STT_MODEL,
      language_code: this.options.language,
      audio_format: env.ELEVENLABS_STT_AUDIO_FORMAT,
      commit_strategy: env.ELEVENLABS_STT_COMMIT_STRATEGY,
    });
    if (env.ELEVENLABS_STT_COMMIT_STRATEGY === 'vad') {
      query.set('vad_silence_threshold_secs', String(env.ELEVENLABS_STT_VAD_SILENCE_SECONDS));
      query.set('vad_threshold', String(env.ELEVENLABS_STT_VAD_THRESHOLD));
      query.set('min_speech_duration_ms', String(env.ELEVENLABS_STT_MIN_SPEECH_MS));
      query.set('min_silence_duration_ms', String(env.ELEVENLABS_STT_MIN_SILENCE_MS));
    }

    this.socket = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?${query}`, {
      headers: { 'xi-api-key': this.apiKey },
    });
    this.socket.on('message', (data) => this.handleMessage(data.toString()));
    this.socket.on('error', (error) => this.handleSocketError(error));
    this.socket.on('close', (code, reason) => this.handleClose(code, reason.toString()));

    await new Promise<void>((resolve, reject) => {
      this.startResolve = resolve;
      this.startReject = reject;
      this.startTimer = setTimeout(() => {
        this.rejectStart(new Error('ELEVENLABS_STT_SESSION_START_TIMEOUT'));
        this.socket?.close(1000, 'session start timeout');
      }, env.ELEVENLABS_STT_SESSION_TIMEOUT_MS);
    });
  }

  send(frame: AudioFrame): void {
    if (!this.sessionStarted || this.socket?.readyState !== WebSocket.OPEN) return;
    const providerFrame = env.ELEVENLABS_STT_AUDIO_FORMAT === 'pcm_16000' ? twilioToStt(frame) : frame;
    for (const chunk of this.audio.push(providerFrame)) this.sendChunk(chunk.data);
  }

  commit(): void {
    if (!this.sessionStarted || this.socket?.readyState !== WebSocket.OPEN) return;
    const remaining = this.audio.flush();
    if (remaining) this.sendChunk(remaining.data);
    this.socket.send(JSON.stringify({ message_type: 'commit' }));
  }

  async close(): Promise<void> {
    const socket = this.socket;
    if (!socket) return;
    this.clearStartTimer();
    this.startReject?.(new Error('ELEVENLABS_STT_SESSION_CLOSED'));
    this.startResolve = null;
    this.startReject = null;
    this.sessionStarted = false;
    this.audio.reset();
    this.socket = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, 'call ended');
    }
  }

  private handleMessage(raw: string): void {
    try {
      const message = JSON.parse(raw) as Record<string, unknown>;
      const type = String(message.message_type ?? message.type ?? '');
      const text = String(message.text ?? message.transcript ?? '').trim();
      if (type === 'session_started') {
        this.sessionStarted = true;
        this.clearStartTimer();
        this.startResolve?.();
        this.startResolve = null;
        this.startReject = null;
        callLogger(this.options.callId).info({
          sessionId: message.session_id,
          config: message.config,
        }, 'ElevenLabs Scribe session confirmed');
      } else if (type === 'partial_transcript' && text) {
        this.options.onSpeechStarted();
        this.options.onTranscript({ text, isFinal: false });
      } else if (type === 'committed_transcript' && text) {
        this.options.onTranscript({ text, isFinal: true });
      } else if (errorEventTypes.has(type)) {
        const error = new Error(`ELEVENLABS_STT_${type.toUpperCase()}: ${String(message.error ?? message.message ?? type)}`);
        this.rejectStart(error);
        this.options.onError(error);
      }
    } catch (error) {
      callLogger(this.options.callId).warn({ error }, 'Ignored invalid ElevenLabs STT message');
    }
  }

  private sendChunk(data: Buffer): void {
    this.socket?.send(JSON.stringify({
      message_type: 'input_audio_chunk',
      audio_base_64: data.toString('base64'),
    }));
  }

  private handleSocketError(error: Error): void {
    this.rejectStart(error);
    this.options.onError(error);
  }

  private handleClose(code: number, reason: string): void {
    this.sessionStarted = false;
    const error = new Error(`ELEVENLABS_STT_SOCKET_CLOSED: ${code} ${reason}`.trim());
    this.rejectStart(error);
    if (code !== 1000 && this.socket) this.options.onError(error);
  }

  private rejectStart(error: Error): void {
    if (!this.startReject) return;
    this.clearStartTimer();
    this.startReject(error);
    this.startResolve = null;
    this.startReject = null;
  }

  private clearStartTimer(): void {
    if (!this.startTimer) return;
    clearTimeout(this.startTimer);
    this.startTimer = null;
  }
}
