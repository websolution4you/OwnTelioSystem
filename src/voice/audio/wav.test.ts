import { describe, expect, it } from 'vitest';
import { createMulawWav, createPcm16Wav } from './wav.js';

describe('WAV encoding', () => {
  it('creates a mono PCM 16 kHz header', () => {
    const wav = createPcm16Wav(Buffer.alloc(32_000), 16_000);
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(16_000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav).toHaveLength(32_044);
  });

  it('creates a mono G.711 mulaw 8 kHz header', () => {
    const wav = createMulawWav(Buffer.alloc(8_000), 8_000);
    expect(wav.readUInt16LE(20)).toBe(7);
    expect(wav.readUInt32LE(24)).toBe(8_000);
    expect(wav.readUInt16LE(34)).toBe(8);
    expect(wav).toHaveLength(8_044);
  });
});
