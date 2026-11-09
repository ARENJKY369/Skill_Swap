package edu.skillswap.service;

import java.net.URI;
import java.time.Instant;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/** Java mirror of shared/sessionStateMachine.ts. */
public final class SessionStateMachine {

    public enum Status {
        Pending, Accepted, Declined, Rescheduled, Completed
    }

    private static final Map<Status, List<Status>> TRANSITIONS = new EnumMap<>(Status.class);

    static {
        TRANSITIONS.put(Status.Pending, List.of(Status.Accepted, Status.Declined, Status.Rescheduled));
        TRANSITIONS.put(Status.Accepted, List.of(Status.Completed, Status.Rescheduled, Status.Declined));
        TRANSITIONS.put(Status.Rescheduled, List.of(Status.Accepted, Status.Declined, Status.Rescheduled));
        TRANSITIONS.put(Status.Completed, List.of());
        TRANSITIONS.put(Status.Declined, List.of());
    }

    private SessionStateMachine() {}

    public static Status parse(String value) {
        try {
            return Status.valueOf(value);
        } catch (IllegalArgumentException | NullPointerException e) {
            return null;
        }
    }

    public static boolean canTransition(Status from, Status to) {
        return from != null && to != null && TRANSITIONS.getOrDefault(from, List.of()).contains(to);
    }

    public static boolean canTransition(String from, String to) {
        return canTransition(parse(from), parse(to));
    }

    public static void assertTransition(Status from, Status to) {
        if (!canTransition(from, to)) {
            throw new IllegalArgumentException("Invalid session transition: " + from + " -> " + to);
        }
    }

    public static void assertTransition(String from, String to) {
        assertTransition(parse(from), parse(to));
    }

    public static boolean canMarkCompleted(String status, String sessionEndIso, String nowIso) {
        Status current = parse(status);
        if (current != Status.Accepted) {
            return false;
        }
        Instant end = DbSupport.parseInstant(sessionEndIso);
        Instant now = nowIso == null ? Instant.now() : DbSupport.parseInstant(nowIso);
        if (end == null || now == null) {
            return false;
        }
        return !now.isBefore(end);
    }

    public static boolean canMarkCompleted(String status, String sessionEndIso) {
        return canMarkCompleted(status, sessionEndIso, DbSupport.nowIso());
    }

    public static boolean isSafeMeetingUrl(String raw) {
        if (raw == null || raw.isBlank()) {
            return false;
        }
        try {
            URI uri = new URI(raw.trim());
            return "https".equalsIgnoreCase(uri.getScheme());
        } catch (Exception e) {
            return false;
        }
    }
}
