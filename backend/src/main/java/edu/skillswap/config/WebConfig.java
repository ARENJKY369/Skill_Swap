package edu.skillswap.config;

import edu.skillswap.Api;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AppProperties props;

    public WebConfig(AppProperties props) {
        this.props = props;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        if (props.isProd()) {
            config.setAllowedOrigins(props.getCorsOrigins());
        } else {
            List<String> patterns = new ArrayList<>(props.getCorsOrigins());
            patterns.add("https://*.e2b.app");
            config.setAllowedOriginPatterns(patterns);
        }
        config.setAllowedMethods(List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of(
                "Content-Type",
                "X-CSRF-Token",
                "x-csrf-token",
                "Accept",
                "Origin",
                "X-Requested-With",
                "Authorization",
                Api.CORRELATION_HEADER));
        config.setExposedHeaders(List.of(
                Api.CORRELATION_HEADER,
                "RateLimit-Limit",
                "RateLimit-Remaining",
                "RateLimit-Reset"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        source.registerCorsConfiguration("/oauth2/**", config);
        source.registerCorsConfiguration("/login/oauth2/**", config);
        return source;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        if (!props.isProd()) {
            return;
        }
        Path dist = Path.of("dist").toAbsolutePath().normalize();
        if (Files.isDirectory(dist)) {
            registry.addResourceHandler("/**")
                    .addResourceLocations(dist.toUri().toString())
                    .setCachePeriod(3600);
        }
    }
}
