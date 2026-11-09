package edu.skillswap.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import edu.skillswap.security.CsrfDoubleSubmitFilter;
import edu.skillswap.security.SessionAuthFilter;
import edu.skillswap.service.AuditService;
import edu.skillswap.service.CookieService;
import edu.skillswap.service.UserRepository;
import jakarta.servlet.Filter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.filter.CompositeFilter;

import java.util.List;

@Configuration
public class SecurityConfig {

    private static final String PROD_CSP = String.join("; ",
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "connect-src 'self'",
            "font-src 'self' data:",
            "object-src 'none'",
            "frame-ancestors 'none'",
            "form-action 'self'");

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           AppProperties props,
                                           JdbcTemplate jdbc,
                                           UserRepository users,
                                           CookieService cookies,
                                           AuditService audit,
                                           ObjectMapper mapper) throws Exception {
        // Filters are intentionally NOT beans: a CompositeFilter prevents Spring Boot
        // from auto-registering them a second time as servlet filters.
        List<Filter> apiFilters = List.of(
                new CsrfDoubleSubmitFilter(cookies, audit, mapper),
                new SessionAuthFilter(jdbc, users, cookies));
        CompositeFilter composite = new CompositeFilter();
        composite.setFilters(apiFilters);

        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/api/**").permitAll()
                        .anyRequest().permitAll())
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(cache -> cache.disable())
                .headers(headers -> {
                    headers.frameOptions(frame -> frame.deny());
                    headers.contentTypeOptions(Customizer.withDefaults());
                    headers.referrerPolicy(ref -> ref.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER));
                    if (props.isProd()) {
                        headers.contentSecurityPolicy(csp -> csp.policyDirectives(PROD_CSP));
                        headers.httpStrictTransportSecurity(hsts -> hsts
                                .maxAgeInSeconds(31536000L)
                                .includeSubDomains(true)
                                .preload(true));
                    }
                })
                .addFilterBefore(composite, AnonymousAuthenticationFilter.class);
        return http.build();
    }
}
