export type CallPhase = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ending' | 'closed';

const allowedTransitions: Record<CallPhase, CallPhase[]> = {
  connecting: ['listening', 'ending', 'closed'],
  listening: ['thinking', 'speaking', 'ending', 'closed'],
  thinking: ['listening', 'speaking', 'ending', 'closed'],
  speaking: ['listening', 'thinking', 'ending', 'closed'],
  ending: ['closed'],
  closed: [],
};

export class CallState {
  private current: CallPhase = 'connecting';

  get phase(): CallPhase {
    return this.current;
  }

  transition(next: CallPhase): void {
    if (next === this.current) return;
    if (!allowedTransitions[this.current].includes(next)) {
      throw new Error(`Invalid call phase transition: ${this.current} -> ${next}`);
    }
    this.current = next;
  }

  get isSpeaking(): boolean {
    return this.current === 'speaking';
  }

  get isClosed(): boolean {
    return this.current === 'closed';
  }
}
