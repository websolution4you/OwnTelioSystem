import type { AudioFrame } from '../contracts.js';
import { downsample16kTo8k, mulawToPcm16, pcm16ToMulaw, upsample8kTo16k } from './mulaw.js';

export function twilioToStt(frame: AudioFrame): AudioFrame {
  if (frame.encoding !== 'mulaw_8000') return frame;
  return {
    data: upsample8kTo16k(mulawToPcm16(frame.data)),
    encoding: 'pcm_s16le_16000',
    ...(frame.sequence === undefined ? {} : { sequence: frame.sequence }),
  };
}

export function ttsToTwilio(frame: AudioFrame): AudioFrame {
  if (frame.encoding === 'mulaw_8000') return frame;
  return {
    data: pcm16ToMulaw(downsample16kTo8k(frame.data)),
    encoding: 'mulaw_8000',
    ...(frame.sequence === undefined ? {} : { sequence: frame.sequence }),
  };
}

export function splitTwilioFrames(data: Buffer): Buffer[] {
  const frameBytes = 160;
  const frames: Buffer[] = [];
  for (let offset = 0; offset < data.length; offset += frameBytes) {
    const frame = data.subarray(offset, Math.min(offset + frameBytes, data.length));
    if (frame.length === frameBytes) frames.push(frame);
  }
  return frames;
}
