package edu.skillswap;

import edu.skillswap.config.AppProperties;
import edu.skillswap.config.DatabaseInitializer;
import edu.skillswap.config.SeedService;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

@SpringBootApplication
public class SkillSwapApplication {

    public static void main(String[] args) {
        loadDotEnv();
        SpringApplication.run(SkillSwapApplication.class, args);
    }

    /**
     * Runs schema creation, demo-account purge migrations, skill catalog seeding,
     * and optional first-admin bootstrap BEFORE embedded Tomcat serves HTTP traffic.
     */
    @Bean
    SmartInitializingSingleton databaseStartupBootstrap(DatabaseInitializer dbInit, SeedService seedService) {
        return () -> {
            dbInit.initSchemaAndVerify();
            seedService.seedIfEmpty(false);
            seedService.bootstrapAdminIfNeeded();
        };
    }

    @Bean
    ApplicationRunner startupRunner(SeedService seedService, AppProperties props) {
        return args -> {
            List<String> rawArgs = Arrays.asList(args.getSourceArgs());
            boolean seedCmd = rawArgs.contains("--seed");
            boolean force = rawArgs.contains("--force");
            if (seedCmd) {
                seedService.seedIfEmpty(force);
                System.exit(0);
            }
            System.out.printf("[skillswap] listening on 0.0.0.0:%d (%s)%n",
                    props.getPort(), props.isProd() ? "production" : "development");
        };
    }

    /**
     * Loads .env from current working directory (without overriding existing OS env vars).
     */
    private static void loadDotEnv() {
        Path envFile = Path.of(".env");
        if (!Files.isRegularFile(envFile)) {
            return;
        }
        try {
            List<String> lines = Files.readAllLines(envFile, StandardCharsets.UTF_8);
            for (String raw : lines) {
                String line = raw.trim();
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                int eq = line.indexOf('=');
                if (eq <= 0) {
                    continue;
                }
                String key = line.substring(0, eq).trim();
                String val = line.substring(eq + 1).trim();
                if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
                    if (val.length() >= 2) {
                        val = val.substring(1, val.length() - 1);
                    }
                }
                if (System.getenv(key) == null && System.getProperty(key) == null) {
                    System.setProperty(key, val);
                }
            }
        } catch (IOException ignored) {
            // Fall back to environment defaults if .env cannot be read.
        }
    }
}
