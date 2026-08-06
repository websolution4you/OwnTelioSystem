import type { AudioEncoding, AudioFrame } from '../contracts.js';

const bytesPerMillisecond: Record<AudioEncoding, number> = {
  mulaw_8000: 8,
  pcm_s16le_16000: 32,
};

export class AudioFrameAggregator {
  private pending = Buffer.alloc(0);
  private sequence: number | undefined;
  private readonly targetBytes: number;

  constructor(
    private readonly encoding: AudioEncoding,
    targetMilliseconds: number,
  ) {
    this.targetBytes = Math.round(bytesPerMillisecond[encoding] * targetMilliseconds);
    if (this.targetBytes <= 0) throw new Error('Audio aggregation target must be positive');
  }

  push(frame: AudioFrame): AudioFrame[] {
    if (frame.encoding !== this.encoding) {
      throw new Error(`Unexpected audio encoding: ${frame.encoding}`);
    }
    if (this.sequence === undefined) this.sequence = frame.sequence;
    this.pending = Buffer.concat([this.pending, frame.data]);
    const output: AudioFrame[] = [];

    while (this.pending.length >= this.targetBytes) {
      output.push({
        data: this.pending.subarray(0, this.targetBytes),
        encoding: this.encoding,
        ...(this.sequence === undefined ? {} : { sequence: this.sequence }),
      });
      this.pending = this.pending.subarray(this.targetBytes);
      this.sequence = undefined;
    }
    return output;
  }

  flush(): AudioFrame | null {
    if (this.pending.length === 0) return null;
    const frame: AudioFrame = {
      data: this.pending,
      encoding: this.encoding,
      ...(this.sequence === undefined ? {} : { sequence: this.sequence }),
    };
    this.pending = Buffer.alloc(0);
    this.sequence = undefined;
    return frame;
  }

  reset(): void {
    this.pending = Buffer.alloc(0);
    this.sequence = undefined;
  }
}
