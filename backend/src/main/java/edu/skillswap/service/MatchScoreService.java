package edu.skillswap.service;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Java mirror of shared/matchScore.ts; no TypeScript is imported. */
@Service
public class MatchScoreService {

    public static final int POINTS_PER_SKILL = 16;
    public static final int BIDIRECTIONAL_BONUS = 18;
    public static final int ONLINE_BONUS = 4;

    public record Result(
            int score,
            List<String> iCanTeachThem,
            List<String> theyCanTeachMe,
            boolean bidirectional,
            Map<String, Object> breakdown
    ) {}

    public enum Chip { strong, fair, weak }

    private static double levelFactor(Map<String, String> levels, String skill) {
        String level = levels == null ? null : levels.get(skill);
        if (level == null) {
            level = "med";
        }
        return switch (level) {
            case "low" -> 0.55;
            case "high" -> 1.0;
            default -> 0.78;
        };
    }

    private static List<String> normalize(List<String> values) {
        Set<String> seen = new LinkedHashSet<>();
        if (values == null) {
            return List.of();
        }
        for (String value : values) {
            if (value == null) {
                continue;
            }
            String trimmed = value.trim();
            if (!trimmed.isEmpty()) {
                seen.add(trimmed);
            }
        }
        return new ArrayList<>(seen);
    }

    public Result score(List<String> myTeaches, List<String> myWants,
                        List<String> theirTeaches, List<String> theirWants,
                        Map<String, String> myLevels, Map<String, String> theirLevels,
                        boolean theirOnline) {
        List<String> myT = normalize(myTeaches);
        List<String> myW = normalize(myWants);
        List<String> theirT = normalize(theirTeaches);
        List<String> theirW = normalize(theirWants);

        List<String> iCanTeachThem = new ArrayList<>();
        for (String skill : myT) {
            if (theirW.contains(skill)) {
                iCanTeachThem.add(skill);
            }
        }
        List<String> theyCanTeachMe = new ArrayList<>();
        for (String skill : myW) {
            if (theirT.contains(skill)) {
                theyCanTeachMe.add(skill);
            }
        }

        double teachSum = 0;
        for (String skill : iCanTeachThem) {
            teachSum += POINTS_PER_SKILL * levelFactor(myLevels, skill);
        }
        double learnSum = 0;
        for (String skill : theyCanTeachMe) {
            learnSum += POINTS_PER_SKILL * levelFactor(theirLevels, skill);
        }
        int teachPoints = (int) Math.round(teachSum);
        int learnPoints = (int) Math.round(learnSum);
        boolean bidirectional = !iCanTeachThem.isEmpty() && !theyCanTeachMe.isEmpty();
        int bidirectionalBonus = bidirectional ? BIDIRECTIONAL_BONUS : 0;
        int onlineBonus = theirOnline ? ONLINE_BONUS : 0;
        int score = Math.max(0, Math.min(100,
                (int) Math.round(teachPoints + learnPoints + bidirectionalBonus + onlineBonus)));

        Map<String, Object> breakdown = new LinkedHashMap<>();
        breakdown.put("teachPoints", teachPoints);
        breakdown.put("learnPoints", learnPoints);
        breakdown.put("bidirectionalBonus", bidirectionalBonus);
        breakdown.put("onlineBonus", onlineBonus);
        return new Result(score, iCanTeachThem, theyCanTeachMe, bidirectional, breakdown);
    }

    public Chip chip(int score) {
        if (score >= 80) {
            return Chip.strong;
        }
        if (score >= 50) {
            return Chip.fair;
        }
        return Chip.weak;
    }
}
