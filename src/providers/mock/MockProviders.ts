import type {
  AudioFrame,
  LlmProvider,
  LlmTurnResult,
  SttProvider,
  SttSession,
  TtsProvider,
} from '../../voice/contracts.js';

export class MockSttProvider implements SttProvider {
  createSession(): SttSession {
    return {
      start: async () => undefined,
      send: () => undefined,
      commit: () => undefined,
      close: async () => undefined,
    };
  }
}

export class MockLlmProvider implements LlmProvider {
  async complete(): Promise<LlmTurnResult> {
    return {
      text: 'Mock režim je aktívny. Hlasový systém je pripravený na pripojenie providerov.',
      toolCalls: [],
    };
  }
}

export class MockTtsProvider implements TtsProvider {
  async synthesize(options: {
    onAudio: (frame: AudioFrame) => void;
  }): Promise<void> {
    options.onAudio({ data: Buffer.alloc(1600, 0xff), encoding: 'mulaw_8000' });
  }
}
