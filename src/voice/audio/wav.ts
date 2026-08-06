export function createPcm16Wav(pcm: Buffer, sampleRate: number): Buffer {
  return createWav(pcm, { formatCode: 1, sampleRate, bitsPerSample: 16 });
}

export function createMulawWav(mulaw: Buffer, sampleRate: number): Buffer {
  return createWav(mulaw, { formatCode: 7, sampleRate, bitsPerSample: 8 });
}

function createWav(
  audio: Buffer,
  options: { formatCode: 1 | 7; sampleRate: number; bitsPerSample: 8 | 16 },
): Buffer {
  const channels = 1;
  const bytesPerSample = options.bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = options.sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + audio.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(options.formatCode, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(options.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(options.bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(audio.length, 40);
  return Buffer.concat([header, audio]);
}
