/**
 * Review eligibility. A review is allowed only when all hold:
 *   1. the session is Completed
 *   2. reviewer and reviewee are the two distinct, authenticated participants
 *   3. no review already exists for this (session, reviewer) pair
 */
export interface ReviewEligibilityInput {
  sessionStatus: string;
  requesterId: string;
  recipientId: string;
  reviewerId: string;
  revieweeId: string;
  existingReview: boolean;
}

export type ReviewEligibility =
  | { ok: true }
  | { ok: false; code: 403 | 409; reason: string };

export function checkReviewEligibility(input: ReviewEligibilityInput): ReviewEligibility {
  if (input.sessionStatus !== 'Completed') {
    return { ok: false, code: 403, reason: 'Session is not completed' };
  }
  const { requesterId, recipientId, reviewerId, revieweeId } = input;
  if (reviewerId !== requesterId && reviewerId !== recipientId) {
    return { ok: false, code: 403, reason: 'Reviewer is not a participant of this session' };
  }
  if (revieweeId === reviewerId) {
    return { ok: false, code: 403, reason: 'Cannot review yourself' };
  }
  const expectedReviewee = reviewerId === requesterId ? recipientId : requesterId;
  if (revieweeId !== expectedReviewee) {
    return { ok: false, code: 403, reason: 'Reviewee must be the other participant' };
  }
  if (input.existingReview) {
    return { ok: false, code: 409, reason: 'Review already submitted for this session' };
  }
  return { ok: true };
}
