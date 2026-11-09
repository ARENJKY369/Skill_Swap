import { describe, expect, it } from 'vitest';
import { scoreMatch, matchChip, BIDIRECTIONAL_BONUS, ONLINE_BONUS } from '@shared/matchScore';

const base = {
  myTeaches: ['Java OOP', 'SQL Database'],
  myWants: ['Python AI'],
  theirTeaches: ['Python AI'],
  theirWants: ['Java OOP'],
};

describe('scoreMatch', () => {
  it('returns 0 for no overlap', () => {
    const r = scoreMatch({
      myTeaches: ['Guitar'],
      myWants: ['Painting'],
      theirTeaches: ['SQL Database'],
      theirWants: ['Guitar 2'],
    });
    expect(r.score).toBe(0);
    expect(r.bidirectional).toBe(false);
  });

  it('scores a one-way match above zero', () => {
    const r = scoreMatch({ ...base, theirWants: ['Java OOP'], theirTeaches: ['Cooking'], myLevels: { 'Java OOP': 'high' } });
    expect(r.iCanTeachThem).toEqual(['Java OOP']);
    expect(r.theyCanTeachMe).toEqual([]);
    expect(r.score).toBe(16);
  });

  it('applies the bidirectional bonus when both directions overlap', () => {
    const r = scoreMatch({ ...base, theirLevels: { 'Python AI': 'high' }, myLevels: { 'Java OOP': 'high' } });
    expect(r.bidirectional).toBe(true);
    expect(r.breakdown.bidirectionalBonus).toBe(BIDIRECTIONAL_BONUS);
    expect(r.score).toBe(16 + 16 + BIDIRECTIONAL_BONUS);
  });

  it('weights skill level: low-level teachers score less', () => {
    const high = scoreMatch({ ...base, theirLevels: { 'Python AI': 'high' } });
    const low = scoreMatch({ ...base, theirLevels: { 'Python AI': 'low' } });
    expect(high.breakdown.learnPoints).toBeGreaterThan(low.breakdown.learnPoints);
  });

  it('adds an online availability tie-breaker', () => {
    const off = scoreMatch(base);
    const on = scoreMatch({ ...base, theirOnline: true });
    expect(on.score - off.score).toBe(ONLINE_BONUS);
  });

  it('clamps the score at 100', () => {
    const r = scoreMatch({
      myTeaches: ['A', 'B', 'C', 'D'],
      myWants: ['E', 'F', 'G'],
      theirWants: ['A', 'B', 'C', 'D'],
      theirTeaches: ['E', 'F', 'G'],
      myLevels: { A: 'high', B: 'high', C: 'high', D: 'high' },
      theirLevels: { E: 'high', F: 'high', G: 'high' },
      theirOnline: true,
    });
    expect(r.score).toBe(100);
  });

  it('matches are case/whitespace-normalized and deduplicated', () => {
    const r = scoreMatch({ ...base, myTeaches: [' Java OOP ', 'Java OOP'] });
    expect(r.iCanTeachThem).toEqual(['Java OOP']);
  });
});

describe('matchChip', () => {
  it('band edges', () => {
    expect(matchChip(80)).toBe('strong');
    expect(matchChip(79)).toBe('fair');
    expect(matchChip(50)).toBe('fair');
    expect(matchChip(49)).toBe('weak');
  });
});
