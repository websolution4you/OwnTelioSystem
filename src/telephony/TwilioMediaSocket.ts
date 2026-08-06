import WebSocket from 'ws';
import type { AudioFrame } from '../voice/contracts.js';
import { splitTwilioFrames, ttsToTwilio } from '../voice/audio/twilioAudio.js';

export class TwilioMediaSocket {
  private streamSid = '';
  private pendingMulaw = Buffer.alloc(0);

  constructor(private readonly socket: WebSocket) {}

  setStreamSid(streamSid: string): void {
    this.streamSid = streamSid;
  }

  sendAudio(frame: AudioFrame): void {
    if (!this.streamSid || this.socket.readyState !== WebSocket.OPEN) return;
    const twilioFrame = ttsToTwilio(frame);
    this.pendingMulaw = Buffer.concat([this.pendingMulaw, twilioFrame.data]);
    const completeLength = this.pendingMulaw.length - (this.pendingMulaw.length % 160);
    const completeAudio = this.pendingMulaw.subarray(0, completeLength);
    this.pendingMulaw = this.pendingMulaw.subarray(completeLength);
    for (const chunk of splitTwilioFrames(completeAudio)) {
      this.socket.send(JSON.stringify({
        event: 'media',
        streamSid: this.streamSid,
        media: { payload: chunk.toString('base64') },
      }));
    }
  }

  clear(): void {
    this.pendingMulaw = Buffer.alloc(0);
    if (!this.streamSid || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ event: 'clear', streamSid: this.streamSid }));
  }

  mark(name: string): void {
    if (!this.streamSid || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ event: 'mark', streamSid: this.streamSid, mark: { name } }));
  }
}
