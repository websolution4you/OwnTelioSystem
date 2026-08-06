import { describe, expect, it } from 'vitest';
import { CallState } from './CallState.js';

describe('CallState', () => {
  it('supports a normal voice turn', () => {
    const state = new CallState();
    state.transition('listening');
    state.transition('thinking');
    state.transition('speaking');
    state.transition('listening');
    expect(state.phase).toBe('listening');
  });

  it('rejects unsafe transitions', () => {
    const state = new CallState();
    expect(() => state.transition('speaking')).toThrow(/Invalid call phase transition/);
  });
});
