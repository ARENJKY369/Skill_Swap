package edu.skillswap.security;

import edu.skillswap.Api;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

/** Assigns a safe correlation ID to every request and echoes it via X-Correlation-Id. */
public class CorrelationIdFilter extends OncePerRequestFilter {

    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9_-]{4,36}$");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String incoming = request.getHeader(Api.CORRELATION_HEADER);
        String correlationId = (incoming != null && SAFE_ID.matcher(incoming.trim()).matches())
                ? incoming.trim()
                : UUID.randomUUID().toString().substring(0, 8);
        request.setAttribute(Api.CORRELATION_ID_ATTR, correlationId);
        response.setHeader(Api.CORRELATION_HEADER, correlationId);
        chain.doFilter(request, response);
    }
}
