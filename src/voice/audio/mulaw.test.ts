import { describe, expect, it } from 'vitest';
import { calculateRms, downsample16kTo8k, mulawToPcm16, pcm16ToMulaw, upsample8kTo16k } from './mulaw.js';

describe('telephone audio conversion', () => {
  it('preserves frame durations across sample-rate conversion', () => {
    const mulaw20ms = Buffer.alloc(160, 0xff);
    const pcm8 = mulawToPcm16(mulaw20ms);
    const pcm16 = upsample8kTo16k(pcm8);
    expect(pcm8).toHaveLength(320);
    expect(pcm16).toHaveLength(640);
    expect(downsample16kTo8k(pcm16)).toHaveLength(320);
    expect(pcm16ToMulaw(pcm8)).toHaveLength(160);
  });

  it('reports silence close to zero RMS', () => {
    expect(calculateRms(mulawToPcm16(Buffer.alloc(160, 0xff)))).toBe(0);
  });
});
