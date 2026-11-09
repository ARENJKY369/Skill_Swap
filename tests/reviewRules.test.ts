import { describe, expect, it } from 'vitest';
import { checkReviewEligibility } from '@shared/reviewRules';

const base = {
  sessionStatus: 'Completed',
  requesterId: 'u1',
  recipientId: 'u2',
  reviewerId: 'u1',
  revieweeId: 'u2',
  existingReview: false,
};

describe('checkReviewEligibility', () => {
  it('allows a valid completed-session review', () => {
    expect(checkReviewEligibility(base)).toEqual({ ok: true });
  });

  it('rejects when the session is not completed', () => {
    const r = checkReviewEligibility({ ...base, sessionStatus: 'Accepted' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(403);
  });

  it('rejects a reviewer who is not a participant', () => {
    const r = checkReviewEligibility({ ...base, reviewerId: 'u9', revieweeId: 'u2' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(403);
  });

  it('rejects self-reviews', () => {
    const r = checkReviewEligibility({ ...base, revieweeId: 'u1' });
    expect(r.ok).toBe(false);
  });

  it('rejects reviewing the wrong person', () => {
    const r = checkReviewEligibility({ ...base, revieweeId: 'u3' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(403);
  });

  it('rejects duplicates with 409', () => {
    const r = checkReviewEligibility({ ...base, existingReview: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(409);
  });

  it('allows the recipient to review the requester', () => {
    const r = checkReviewEligibility({ ...base, reviewerId: 'u2', revieweeId: 'u1' });
    expect(r.ok).toBe(true);
  });
});
