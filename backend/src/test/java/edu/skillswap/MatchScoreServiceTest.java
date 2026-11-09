package edu.skillswap;

import edu.skillswap.service.MatchScoreService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertIterableEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MatchScoreServiceTest {

    private final MatchScoreService service = new MatchScoreService();

    @Test
    void returnsZeroForNoOverlap() {
        MatchScoreService.Result result = service.score(
                List.of("Guitar"), List.of("Painting"),
                List.of("SQL Database"), List.of("Guitar 2"),
                Map.of(), Map.of(), false);
        assertEquals(0, result.score());
        assertFalse(result.bidirectional());
    }

    @Test
    void scoresOneWayMatchAboveZero() {
        MatchScoreService.Result result = service.score(
                List.of("Java OOP", "SQL Database"), List.of("Python AI"),
                List.of("Cooking"), List.of("Java OOP"),
                Map.of("Java OOP", "high"), Map.of(), false);
        assertIterableEquals(List.of("Java OOP"), result.iCanTeachThem());
        assertTrue(result.theyCanTeachMe().isEmpty());
        assertEquals(16, result.score());
    }

    @Test
    void appliesBidirectionalBonus() {
        MatchScoreService.Result result = service.score(
                List.of("Java OOP", "SQL Database"), List.of("Python AI"),
                List.of("Python AI"), List.of("Java OOP"),
                Map.of("Java OOP", "high"), Map.of("Python AI", "high"), false);
        assertTrue(result.bidirectional());
        assertEquals(MatchScoreService.BIDIRECTIONAL_BONUS, result.breakdown().get("bidirectionalBonus"));
        assertEquals(16 + 16 + MatchScoreService.BIDIRECTIONAL_BONUS, result.score());
    }

    @Test
    void weightsSkillLevel() {
        MatchScoreService.Result high = service.score(
                List.of("Java OOP", "SQL Database"), List.of("Python AI"),
                List.of("Python AI"), List.of("Java OOP"),
                Map.of(), Map.of("Python AI", "high"), false);
        MatchScoreService.Result low = service.score(
                List.of("Java OOP", "SQL Database"), List.of("Python AI"),
                List.of("Python AI"), List.of("Java OOP"),
                Map.of(), Map.of("Python AI", "low"), false);
        assertTrue((Integer) high.breakdown().get("learnPoints") > (Integer) low.breakdown().get("learnPoints"));
    }

    @Test
    void addsOnlineTieBreaker() {
        int off = service.score(
                List.of("Java OOP", "SQL Database"), List.of("Python AI"),
                List.of("Python AI"), List.of("Java OOP"), Map.of(), Map.of(), false).score();
        int on = service.score(
                List.of("Java OOP", "SQL Database"), List.of("Python AI"),
                List.of("Python AI"), List.of("Java OOP"), Map.of(), Map.of(), true).score();
        assertEquals(MatchScoreService.ONLINE_BONUS, on - off);
    }

    @Test
    void clampsAt100() {
        MatchScoreService.Result result = service.score(
                List.of("A", "B", "C", "D"), List.of("E", "F", "G"),
                List.of("E", "F", "G"), List.of("A", "B", "C", "D"),
                Map.of("A", "high", "B", "high", "C", "high", "D", "high"),
                Map.of("E", "high", "F", "high", "G", "high"), true);
        assertEquals(100, result.score());
    }

    @Test
    void normalizesWhitespaceAndDuplicates() {
        MatchScoreService.Result result = service.score(
                List.of(" Java OOP ", "Java OOP", "SQL Database"), List.of("Python AI"),
                List.of("Python AI"), List.of("Java OOP"),
                Map.of(), Map.of(), false);
        assertIterableEquals(List.of("Java OOP"), result.iCanTeachThem());
    }

    @Test
    void chipBandEdges() {
        assertEquals(MatchScoreService.Chip.strong, service.chip(80));
        assertEquals(MatchScoreService.Chip.fair, service.chip(79));
        assertEquals(MatchScoreService.Chip.fair, service.chip(50));
        assertEquals(MatchScoreService.Chip.weak, service.chip(49));
    }
}
