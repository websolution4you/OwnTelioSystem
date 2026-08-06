export type AudioEncoding = 'mulaw_8000' | 'pcm_s16le_16000';

export interface AudioFrame {
  data: Buffer;
  encoding: AudioEncoding;
  sequence?: number;
}

export interface TranscriptEvent {
  text: string;
  isFinal: boolean;
  confidence?: number;
}

export interface SttSession {
  start(): Promise<void>;
  send(frame: AudioFrame): void;
  commit(): void;
  close(): Promise<void>;
}

export interface SttProvider {
  createSession(options: {
    callId: string;
    language: string;
    onTranscript: (event: TranscriptEvent) => void;
    onSpeechStarted: () => void;
    onError: (error: Error) => void;
  }): SttSession;
}

export interface TtsProvider {
  synthesize(options: {
    callId: string;
    text: string;
    signal: AbortSignal;
    onAudio: (frame: AudioFrame) => void;
  }): Promise<void>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export type ConversationMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
};

export interface LlmTurnResult {
  text: string;
  toolCalls: ToolCall[];
}

export interface LlmProvider {
  complete(options: {
    callId: string;
    messages: ConversationMessage[];
    tools: ToolDefinition[];
    signal: AbortSignal;
  }): Promise<LlmTurnResult>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
