package edu.skillswap.service;

import edu.skillswap.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** In-memory per-IP limiter mirroring express-rate-limit (single-process only). */
@Service
public class RateLimitService {

    private final Map<String, Deque<Long>> buckets = new ConcurrentHashMap<>();

    public void check(String name, HttpServletRequest request, HttpServletResponse response,
                      int max, long windowMs, String message) {
        String key = name + ":" + DbSupport.clientIp(request);
        long now = System.currentTimeMillis();
        Deque<Long> bucket = buckets.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        int count;
        long resetSeconds;
        synchronized (bucket) {
            while (!bucket.isEmpty() && now - bucket.peekFirst() >= windowMs) {
                bucket.removeFirst();
            }
            count = bucket.size();
            if (count >= max) {
                resetSeconds = Math.max(1, (windowMs - (now - bucket.peekFirst()) + 999) / 1000);
                setHeaders(response, max, 0, resetSeconds);
                throw new ApiException(429, message);
            }
            bucket.addLast(now);
            count += 1;
            resetSeconds = Math.max(1, (windowMs - (now - bucket.peekFirst()) + 999) / 1000);
            setHeaders(response, max, Math.max(0, max - count), resetSeconds);
        }
    }

    private static void setHeaders(HttpServletResponse response, int limit, int remaining, long resetSeconds) {
        response.setHeader("RateLimit-Limit", String.valueOf(limit));
        response.setHeader("RateLimit-Remaining", String.valueOf(remaining));
        response.setHeader("RateLimit-Reset", String.valueOf(resetSeconds));
    }
}
