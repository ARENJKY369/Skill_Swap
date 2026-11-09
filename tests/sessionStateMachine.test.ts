import { describe, expect, it } from 'vitest';
import { canTransition, assertTransition, canMarkCompleted, isSafeMeetingUrl } from '@shared/sessionStateMachine';

describe('session state machine', () => {
  it('allows the documented happy path Pending -> Accepted -> Completed', () => {
    expect(canTransition('Pending', 'Accepted')).toBe(true);
    expect(canTransition('Accepted', 'Completed')).toBe(true);
  });

  it('allows decline from pending', () => {
    expect(canTransition('Pending', 'Declined')).toBe(true);
  });

  it('forbids skipping Accepted', () => {
    expect(canTransition('Pending', 'Completed')).toBe(false);
    expect(() => assertTransition('Pending', 'Completed')).toThrow(/Invalid session transition/);
  });

  it('terminal states have no outbound transitions', () => {
    for (const to of ['Pending', 'Accepted', 'Rescheduled', 'Completed', 'Declined'] as const) {
      expect(canTransition('Completed', to)).toBe(false);
      expect(canTransition('Declined', to)).toBe(false);
    }
  });

  it('rescheduling loops back into the review cycle', () => {
    expect(canTransition('Pending', 'Rescheduled')).toBe(true);
    expect(canTransition('Accepted', 'Rescheduled')).toBe(true);
    expect(canTransition('Rescheduled', 'Accepted')).toBe(true);
  });

  it('canMarkCompleted requires end time to have passed', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(canMarkCompleted('Accepted', past)).toBe(true);
    expect(canMarkCompleted('Accepted', future)).toBe(false);
    expect(canMarkCompleted('Pending', past)).toBe(false);
    expect(canMarkCompleted('Completed', past)).toBe(false);
  });

  it('rejects non-https meeting URLs', () => {
    expect(isSafeMeetingUrl('https://zoom.us/j/123456789')).toBe(true);
    expect(isSafeMeetingUrl('http://zoom.us/j/123')).toBe(false);
    expect(isSafeMeetingUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeMeetingUrl('not a url')).toBe(false);
  });
});
