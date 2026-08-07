import { describe, expect, it, vi } from 'vitest';
import { ProviderHealthService, type ProviderHealthConfig } from './ProviderHealthService.js';

const baseConfig: ProviderHealthConfig = {
  sttProvider: 'mock',
  llmProvider: 'mock',
  ttsProvider: 'mock',
  openAiModel: 'gpt-4o-mini',
};

describe('ProviderHealthService', () => {
  it('does not call external services in mock mode', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await new ProviderHealthService(baseConfig, fetcher).check();
    expect(result.status).toBe('ok');
    expect(result.providers.stt.status).toBe('mock');
    expect(result.providers.llm.status).toBe('mock');
    expect(result.providers.tts.status).toBe('mock');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports missing credentials without making a request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const service = new ProviderHealthService({
      ...baseConfig,
      sttProvider: 'elevenlabs',
      ttsProvider: 'elevenlabs',
      llmProvider: 'openai',
    }, fetcher);
    const result = await service.check();
    expect(result.status).toBe('degraded');
    expect(result.providers.stt.code).toBe('missing_credentials');
    expect(result.providers.tts.code).toBe('missing_credentials');
    expect(result.providers.llm.code).toBe('missing_credentials');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns safe status codes and never includes upstream response bodies', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ detail: 'secret upstream diagnostic' }),
      { status: 401 },
    ));
    const service = new ProviderHealthService({
      ...baseConfig,
      sttProvider: 'elevenlabs',
      elevenLabsApiKey: 'test-key',
    }, fetcher);
    const result = await service.check();
    expect(result.providers.stt).toEqual({
      provider: 'elevenlabs',
      status: 'unavailable',
      code: 'authentication_failed',
    });
    expect(JSON.stringify(result)).not.toContain('secret upstream diagnostic');
    expect(JSON.stringify(result)).not.toContain('test-key');
  });

  it('caches successful checks', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    const service = new ProviderHealthService({
      ...baseConfig,
      sttProvider: 'elevenlabs',
      elevenLabsApiKey: 'test-key',
    }, fetcher);
    expect((await service.check()).cached).toBe(false);
    expect((await service.check()).cached).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
