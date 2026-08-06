import WebSocket from 'ws';
import { ConversationEngine } from '../agent/ConversationEngine.js';
import { buildSystemPrompt } from '../agent/systemPrompt.js';
import { env } from '../config/env.js';
import { createProviders } from '../providers/factory.js';
import { callLogger } from '../shared/logger.js';
import { TwilioMediaSocket } from '../telephony/TwilioMediaSocket.js';
import { twilioToStt } from './audio/twilioAudio.js';
import type { AudioFrame, SttSession } from './contracts.js';
import { CallState } from './state/CallState.js';

interface TwilioEvent {
  event: 'start' | 'media' | 'stop' | 'mark';
  start?: { streamSid: string; callSid?: string };
  media?: { payload: string; sequenceNumber?: string };
}

export class VoiceCallSession {
  private readonly state = new CallState();
  private readonly media: TwilioMediaSocket;
  private readonly log;
  private readonly providers = createProviders();
  private readonly conversation: ConversationEngine;
  private stt: SttSession | null = null;
  private ttsAbort: AbortController | null = null;
  private processingTurn = false;
  private queuedTranscript: string | null = null;
  private sttReady = false;
  private pendingInboundFrames: AudioFrame[] = [];

  constructor(
    private readonly socket: WebSocket,
    private readonly callSid: string,
  ) {
    this.media = new TwilioMediaSocket(socket);
    this.log = callLogger(callSid);
    this.conversation = new ConversationEngine(
      callSid,
      buildSystemPrompt('Telio športové centrum', env.TELIO_TIME_ZONE),
      this.providers.llm,
    );
  }

  async start(): Promise<void> {
    this.socket.on('message', (raw) => this.handleTwilioEvent(raw.toString()));
    this.socket.once('close', () => void this.close());
    this.socket.once('error', (error) => this.log.error({ error }, 'Twilio WebSocket error'));

    this.stt = this.providers.stt.createSession({
      callId: this.callSid,
      language: 'sk',
      onTranscript: (event) => {
        if (event.isFinal) void this.enqueueTurn(event.text);
      },
      onSpeechStarted: () => this.handleBargeIn(),
      onError: (error) => this.log.error({ error }, 'STT session error'),
    });
    await this.stt.start();
    if (this.state.isClosed) return;
    this.sttReady = true;
    for (const frame of this.pendingInboundFrames) this.stt.send(frame);
    this.pendingInboundFrames = [];
    this.state.transition('listening');
    this.log.info('Voice call session started');
  }

  private handleTwilioEvent(raw: string): void {
    try {
      const message = JSON.parse(raw) as TwilioEvent;
      if (message.event === 'start' && message.start) {
        this.media.setStreamSid(message.start.streamSid);
      } else if (message.event === 'media' && message.media) {
        const frame = {
          data: Buffer.from(message.media.payload, 'base64'),
          encoding: 'mulaw_8000' as const,
          sequence: Number(message.media.sequenceNumber ?? 0),
        };
        const sttFrame = twilioToStt(frame);
        if (this.sttReady) {
          this.stt?.send(sttFrame);
        } else {
          this.pendingInboundFrames.push(sttFrame);
          if (this.pendingInboundFrames.length > 250) this.pendingInboundFrames.shift();
        }
      } else if (message.event === 'stop') {
        void this.close();
      }
    } catch (error) {
      this.log.warn({ error }, 'Ignored invalid Twilio media event');
    }
  }

  private handleBargeIn(): void {
    if (!this.state.isSpeaking && this.state.phase !== 'thinking') return;
    this.log.info('Barge-in detected');
    this.ttsAbort?.abort();
    this.ttsAbort = null;
    this.conversation.cancelActiveTurn();
    this.media.clear();
    if (this.state.phase !== 'listening') this.state.transition('listening');
  }

  private async enqueueTurn(text: string): Promise<void> {
    if (!text.trim() || this.state.isClosed) return;
    if (this.processingTurn) {
      this.queuedTranscript = text;
      return;
    }
    this.processingTurn = true;
    try {
      let current: string | null = text;
      while (current) {
        this.queuedTranscript = null;
        await this.processTurn(current);
        current = this.queuedTranscript;
      }
    } finally {
      this.processingTurn = false;
    }
  }

  private async processTurn(text: string): Promise<void> {
    if (this.state.phase !== 'listening') this.state.transition('listening');
    this.state.transition('thinking');
    const startedAt = performance.now();
    try {
      const response = await this.conversation.processUserText(text);
      if (this.state.phase !== 'thinking') return;
      this.state.transition('speaking');
      const controller = new AbortController();
      this.ttsAbort = controller;
      await this.providers.tts.synthesize({
        callId: this.callSid,
        text: response,
        signal: controller.signal,
        onAudio: (frame) => this.media.sendAudio(frame),
      });
      if (!controller.signal.aborted) this.media.mark('assistant-response-complete');
      this.finishSpeaking();
      this.log.info({ latencyMs: Math.round(performance.now() - startedAt) }, 'Voice turn completed');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') this.log.error({ error }, 'Voice turn failed');
      if (this.state.phase === 'thinking' || this.state.phase === 'speaking') this.state.transition('listening');
    } finally {
      this.ttsAbort = null;
    }
  }

  private finishSpeaking(): void {
    if (this.state.isSpeaking) this.state.transition('listening');
  }

  async close(): Promise<void> {
    if (this.state.isClosed) return;
    this.ttsAbort?.abort();
    this.conversation.cancelActiveTurn();
    if (this.state.phase !== 'ending') this.state.transition('ending');
    this.sttReady = false;
    this.pendingInboundFrames = [];
    await this.stt?.close();
    this.state.transition('closed');
    this.log.info('Voice call session closed');
  }
}
