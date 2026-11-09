package edu.skillswap.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import edu.skillswap.Api;
import edu.skillswap.service.AuditService;
import edu.skillswap.service.CookieService;
import edu.skillswap.service.DbSupport;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

public class CsrfDoubleSubmitFilter extends OncePerRequestFilter {

    private static final Set<String> MUTATING = Set.of("POST", "PUT", "PATCH", "DELETE");

    private final CookieService cookies;
    private final AuditService audit;
    private final ObjectMapper mapper;

    public CsrfDoubleSubmitFilter(CookieService cookies, AuditService audit, ObjectMapper mapper) {
        this.cookies = cookies;
        this.audit = audit;
        this.mapper = mapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String path = request.getRequestURI();
        if (!path.startsWith("/api") || !MUTATING.contains(request.getMethod())) {
            chain.doFilter(request, response);
            return;
        }
        String cookieToken = cookies.read(request, CookieService.CSRF_COOKIE);
        String headerToken = request.getHeader(CookieService.CSRF_HEADER);
        if (cookieToken == null || headerToken == null || !DbSupport.safeEqual(cookieToken, headerToken)) {
            String correlationId = Api.correlationId(request);
            audit.log(null, "csrf_rejected", DbSupport.clientIp(request), "denied",
                    request.getMethod() + " " + path + " (" + correlationId + ")");
            response.setStatus(403);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            mapper.writeValue(response.getOutputStream(), Api.map(
                    "error", "Invalid CSRF token",
                    "code", "CSRF_INVALID",
                    "correlationId", correlationId));
            return;
        }
        chain.doFilter(request, response);
    }
}
