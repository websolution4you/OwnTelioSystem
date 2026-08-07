export type ProviderHealthStatus = 'ok' | 'mock' | 'misconfigured' | 'unavailable';

export interface ProviderHealthResult {
  status: 'ok' | 'degraded';
  cached: boolean;
  checkedAt: string;
  providers: {
    stt: ProviderComponentHealth;
    llm: ProviderComponentHealth;
    tts: ProviderComponentHealth;
  };
}

interface ProviderComponentHealth {
  provider: string;
  status: ProviderHealthStatus;
  code?: string;
}

export interface ProviderHealthConfig {
  sttProvider: 'mock' | 'elevenlabs';
  llmProvider: 'mock' | 'openai';
  ttsProvider: 'mock' | 'elevenlabs';
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  openAiApiKey?: string;
  openAiModel: string;
}

export class ProviderHealthService {
  private cached: Omit<ProviderHealthResult, 'cached'> | null = null;
  private cachedAt = 0;
  private inFlight: Promise<Omit<ProviderHealthResult, 'cached'>> | null = null;

  constructor(
    private readonly config: ProviderHealthConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly cacheMilliseconds = 300_000,
    private readonly timeoutMilliseconds = 5_000,
  ) {}

  async check(): Promise<ProviderHealthResult> {
    if (this.cached && Date.now() - this.cachedAt < this.cacheMilliseconds) {
      return { ...this.cached, cached: true };
    }
    this.inFlight ??= this.performCheck().finally(() => { this.inFlight = null; });
    const result = await this.inFlight;
    this.cached = result;
    this.cachedAt = Date.now();
    return { ...result, cached: false };
  }

  private async performCheck(): Promise<Omit<ProviderHealthResult, 'cached'>> {
    const [stt, llm, tts] = await Promise.all([
      this.checkElevenLabs('stt'),
      this.checkOpenAi(),
      this.checkElevenLabs('tts'),
    ]);
    const providers = { stt, llm, tts };
    return {
      status: Object.values(providers).every((provider) => provider.status === 'ok' || provider.status === 'mock')
        ? 'ok'
        : 'degraded',
      checkedAt: new Date().toISOString(),
      providers,
    };
  }

  private async checkElevenLabs(kind: 'stt' | 'tts'): Promise<ProviderComponentHealth> {
    const selected = kind === 'stt' ? this.config.sttProvider : this.config.ttsProvider;
    if (selected === 'mock') return { provider: 'mock', status: 'mock' };
    if (!this.config.elevenLabsApiKey || (kind === 'tts' && !this.config.elevenLabsVoiceId)) {
      return { provider: 'elevenlabs', status: 'misconfigured', code: 'missing_credentials' };
    }
    const tokenType = kind === 'stt' ? 'realtime_scribe' : 'tts_websocket';
    return this.requestHealth('elevenlabs', `https://api.elevenlabs.io/v1/single-use-token/${tokenType}`, {
      method: 'POST',
      headers: { 'xi-api-key': this.config.elevenLabsApiKey },
    });
  }

  private async checkOpenAi(): Promise<ProviderComponentHealth> {
    if (this.config.llmProvider === 'mock') return { provider: 'mock', status: 'mock' };
    if (!this.config.openAiApiKey) {
      return { provider: 'openai', status: 'misconfigured', code: 'missing_credentials' };
    }
    return this.requestHealth('openai', `https://api.openai.com/v1/models/${encodeURIComponent(this.config.openAiModel)}`, {
      headers: { authorization: `Bearer ${this.config.openAiApiKey}` },
    });
  }

  private async requestHealth(
    provider: string,
    url: string,
    init: RequestInit,
  ): Promise<ProviderComponentHealth> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMilliseconds);
    try {
      const response = await this.fetcher(url, { ...init, signal: controller.signal });
      if (response.ok) return { provider, status: 'ok' };
      return { provider, status: 'unavailable', code: safeHttpCode(response.status) };
    } catch (error) {
      return {
        provider,
        status: 'unavailable',
        code: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network_error',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function safeHttpCode(status: number): string {
  if (status === 401 || status === 403) return 'authentication_failed';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'upstream_error';
  return 'request_rejected';
}
