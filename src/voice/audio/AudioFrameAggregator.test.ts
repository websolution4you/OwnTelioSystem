import { describe, expect, it } from 'vitest';
import { AudioFrameAggregator } from './AudioFrameAggregator.js';

describe('AudioFrameAggregator', () => {
  it('aggregates five Twilio 20 ms frames into one 100 ms Scribe chunk', () => {
    const aggregator = new AudioFrameAggregator('mulaw_8000', 100);
    const output = Array.from({ length: 5 }, (_, index) => aggregator.push({
      data: Buffer.alloc(160, index),
      encoding: 'mulaw_8000' as const,
      sequence: index,
    })).flat();

    expect(output).toHaveLength(1);
    expect(output[0]?.data).toHaveLength(800);
    expect(output[0]?.sequence).toBe(0);
    expect(aggregator.flush()).toBeNull();
  });

  it('flushes a final partial chunk without padding it with fake audio', () => {
    const aggregator = new AudioFrameAggregator('mulaw_8000', 100);
    aggregator.push({ data: Buffer.alloc(320), encoding: 'mulaw_8000' });
    expect(aggregator.flush()?.data).toHaveLength(320);
    expect(aggregator.flush()).toBeNull();
  });

  it('rejects an unexpected encoding', () => {
    const aggregator = new AudioFrameAggregator('mulaw_8000', 100);
    expect(() => aggregator.push({
      data: Buffer.alloc(320),
      encoding: 'pcm_s16le_16000',
    })).toThrow(/Unexpected audio encoding/);
  });
});
