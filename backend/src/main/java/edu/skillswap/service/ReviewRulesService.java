package edu.skillswap.service;

/** Java mirror of shared/reviewRules.ts. */
public final class ReviewRulesService {

    public record Verdict(boolean ok, int code, String reason) {
        public static Verdict allowed() {
            return new Verdict(true, 200, null);
        }
        public static Verdict denied(int code, String reason) {
            return new Verdict(false, code, reason);
        }
    }

    private ReviewRulesService() {}

    public static Verdict check(String sessionStatus, String requesterId, String recipientId,
                                String reviewerId, String revieweeId, boolean existingReview) {
        if (!"Completed".equals(sessionStatus)) {
            return Verdict.denied(403, "Session is not completed");
        }
        if (!reviewerId.equals(requesterId) && !reviewerId.equals(recipientId)) {
            return Verdict.denied(403, "Reviewer is not a participant of this session");
        }
        if (revieweeId.equals(reviewerId)) {
            return Verdict.denied(403, "Cannot review yourself");
        }
        String expectedReviewee = reviewerId.equals(requesterId) ? recipientId : requesterId;
        if (!revieweeId.equals(expectedReviewee)) {
            return Verdict.denied(403, "Reviewee must be the other participant");
        }
        if (existingReview) {
            return Verdict.denied(409, "Review already submitted for this session");
        }
        return Verdict.allowed();
    }
}
