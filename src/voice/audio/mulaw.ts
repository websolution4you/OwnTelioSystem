export function mulawToPcm16(input: Buffer): Buffer {
  const output = Buffer.allocUnsafe(input.length * 2);
  for (let index = 0; index < input.length; index += 1) {
    const value = 0xff ^ (input[index] ?? 0);
    const sign = value & 0x80;
    const exponent = (value >> 4) & 0x07;
    const mantissa = value & 0x0f;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    sample -= 0x84;
    output.writeInt16LE(sign ? -sample : sample, index * 2);
  }
  return output;
}

export function pcm16ToMulaw(input: Buffer): Buffer {
  const output = Buffer.allocUnsafe(Math.floor(input.length / 2));
  for (let offset = 0; offset + 1 < input.length; offset += 2) {
    let sample = input.readInt16LE(offset);
    const sign = sample < 0 ? 0x80 : 0;
    if (sample < 0) sample = -sample;
    sample = Math.min(sample, 32635) + 132;

    let exponent = 7;
    for (let mask = 0x4000; exponent > 0 && (sample & mask) === 0; mask >>= 1) {
      exponent -= 1;
    }
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    output[offset / 2] = ~(sign | (exponent << 4) | mantissa) & 0xff;
  }
  return output;
}

export function upsample8kTo16k(input: Buffer): Buffer {
  const samples = Math.floor(input.length / 2);
  if (samples === 0) return Buffer.alloc(0);
  const output = Buffer.allocUnsafe(samples * 4);
  for (let index = 0; index < samples; index += 1) {
    const current = input.readInt16LE(index * 2);
    const next = index + 1 < samples ? input.readInt16LE((index + 1) * 2) : current;
    output.writeInt16LE(current, index * 4);
    output.writeInt16LE(Math.round((current + next) / 2), index * 4 + 2);
  }
  return output;
}

export function downsample16kTo8k(input: Buffer): Buffer {
  const output = Buffer.allocUnsafe(Math.floor(input.length / 4) * 2);
  for (let source = 0, target = 0; source + 3 < input.length; source += 4, target += 2) {
    output.writeInt16LE(input.readInt16LE(source), target);
  }
  return output;
}

export function calculateRms(pcm16: Buffer): number {
  const sampleCount = Math.floor(pcm16.length / 2);
  if (sampleCount === 0) return 0;
  let sum = 0;
  for (let offset = 0; offset + 1 < pcm16.length; offset += 2) {
    const sample = pcm16.readInt16LE(offset);
    sum += sample * sample;
  }
  return Math.sqrt(sum / sampleCount);
}
