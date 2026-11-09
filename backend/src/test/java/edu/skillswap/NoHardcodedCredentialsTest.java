package edu.skillswap;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertTrue;

class NoHardcodedCredentialsTest {

    private static final List<String> FORBIDDEN = List.of(
            String.join("", "ava", "@", "skillswap.edu"),
            String.join("", "admin", "@", "skillswap.edu"),
            String.join("", "student", "1234"),
            String.join("", "admin", "1234")
    );

    private static final Set<String> EXTENSIONS = Set.of(
            ".ts", ".tsx", ".js", ".mjs", ".md", ".java", ".properties", ".html", ".css", ".sh", ".cmd"
    );

    @Test
    void repositoryContainsNoHardcodedDemoCredentials() throws IOException {
        Path root = Path.of("").toAbsolutePath().normalize();
        List<Path> files = new ArrayList<>();
        for (String dir : List.of("src", "server", "docs", "backend/src/main", "scripts")) {
            Path p = root.resolve(dir);
            if (Files.isDirectory(p)) {
                try (Stream<Path> walk = Files.walk(p)) {
                    walk.filter(Files::isRegularFile)
                            .filter(NoHardcodedCredentialsTest::hasCheckedExtension)
                            .forEach(files::add);
                }
            }
        }
        for (String single : List.of("README.md", ".env.example")) {
            Path p = root.resolve(single);
            if (Files.isRegularFile(p)) {
                files.add(p);
            }
        }

        assertTrue(files.size() > 20, "Expected source files to scan");

        List<String> violations = new ArrayList<>();
        for (Path file : files) {
            String content = Files.readString(file, StandardCharsets.UTF_8);
            for (String forbidden : FORBIDDEN) {
                if (content.contains(forbidden)) {
                    violations.add(root.relativize(file) + " contains forbidden credential: " + forbidden);
                }
            }
        }
        assertTrue(violations.isEmpty(), () -> "Hardcoded demo credentials found:\n" + String.join("\n", violations));
    }

    private static boolean hasCheckedExtension(Path path) {
        String name = path.getFileName().toString();
        int dot = name.lastIndexOf('.');
        return dot >= 0 && EXTENSIONS.contains(name.substring(dot));
    }
}
