import { env } from '../config/env.js';
import type { LlmProvider, SttProvider, TtsProvider } from '../voice/contracts.js';
import { ElevenLabsSttProvider } from './elevenlabs/ElevenLabsSttProvider.js';
import { ElevenLabsTtsProvider } from './elevenlabs/ElevenLabsTtsProvider.js';
import { MockLlmProvider, MockSttProvider, MockTtsProvider } from './mock/MockProviders.js';
import { OpenAiLlmProvider } from './openai/OpenAiLlmProvider.js';

export function createProviders(): {
  stt: SttProvider;
  llm: LlmProvider;
  tts: TtsProvider;
} {
  return {
    stt: env.STT_PROVIDER === 'elevenlabs' ? new ElevenLabsSttProvider() : new MockSttProvider(),
    llm: env.LLM_PROVIDER === 'openai' ? new OpenAiLlmProvider() : new MockLlmProvider(),
    tts: env.TTS_PROVIDER === 'elevenlabs' ? new ElevenLabsTtsProvider() : new MockTtsProvider(),
  };
}
