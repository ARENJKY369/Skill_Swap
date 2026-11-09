package edu.skillswap;

import edu.skillswap.service.ReviewRulesService;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReviewRulesServiceTest {

    private ReviewRulesService.Verdict check(String status, String reviewer, String reviewee,
                                             boolean existing) {
        return ReviewRulesService.check(status, "u1", "u2", reviewer, reviewee, existing);
    }

    @Test
    void allowsValidCompletedSessionReview() {
        assertTrue(check("Completed", "u1", "u2", false).ok());
    }

    @Test
    void rejectsSessionNotCompleted() {
        ReviewRulesService.Verdict verdict = check("Accepted", "u1", "u2", false);
        assertFalse(verdict.ok());
        assertEquals(403, verdict.code());
    }

    @Test
    void rejectsNonParticipant() {
        ReviewRulesService.Verdict verdict = check("Completed", "u9", "u2", false);
        assertFalse(verdict.ok());
        assertEquals(403, verdict.code());
    }

    @Test
    void rejectsSelfReview() {
        assertFalse(check("Completed", "u1", "u1", false).ok());
    }

    @Test
    void rejectsWrongReviewee() {
        ReviewRulesService.Verdict verdict = check("Completed", "u1", "u3", false);
        assertFalse(verdict.ok());
        assertEquals(403, verdict.code());
    }

    @Test
    void rejectsDuplicateWith409() {
        ReviewRulesService.Verdict verdict = check("Completed", "u1", "u2", true);
        assertFalse(verdict.ok());
        assertEquals(409, verdict.code());
    }

    @Test
    void allowsRecipientToReviewRequester() {
        assertTrue(check("Completed", "u2", "u1", false).ok());
    }
}
