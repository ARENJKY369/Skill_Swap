package edu.skillswap.config;

import edu.skillswap.service.AuditService;
import edu.skillswap.service.DbSupport;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class SeedService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    private record SkillSeed(String name, String category) {}
    private record ResourceSeed(String title, String provider, String url, String skill, String category, String kind) {}

    private static final List<SkillSeed> SKILLS = List.of(
            // Tech (14)
            new SkillSeed("Java OOP", "Tech"),
            new SkillSeed("Python AI", "Tech"),
            new SkillSeed("SQL Database", "Tech"),
            new SkillSeed("C Programming", "Tech"),
            new SkillSeed("Embedded Systems", "Tech"),
            new SkillSeed("ML Fundamentals", "Tech"),
            new SkillSeed("Data Analysis", "Tech"),
            new SkillSeed("Algorithms", "Tech"),
            new SkillSeed("Web Development", "Tech"),
            new SkillSeed("Git & DevOps", "Tech"),
            new SkillSeed("Linux Systems", "Tech"),
            new SkillSeed("Cloud Basics", "Tech"),
            new SkillSeed("Networking", "Tech"),
            new SkillSeed("Cybersecurity Basics", "Tech"),
            // Arts (10)
            new SkillSeed("Painting", "Arts"),
            new SkillSeed("Guitar", "Arts"),
            new SkillSeed("Music Theory", "Arts"),
            new SkillSeed("Photography", "Arts"),
            new SkillSeed("Video Editing", "Arts"),
            new SkillSeed("Creative Writing", "Arts"),
            new SkillSeed("Art History", "Arts"),
            new SkillSeed("Drawing", "Arts"),
            new SkillSeed("Acting", "Arts"),
            new SkillSeed("Ceramics", "Arts"),
            // Languages (7)
            new SkillSeed("Spanish", "Languages"),
            new SkillSeed("French", "Languages"),
            new SkillSeed("German", "Languages"),
            new SkillSeed("Czech", "Languages"),
            new SkillSeed("Mandarin", "Languages"),
            new SkillSeed("Arabic", "Languages"),
            new SkillSeed("Japanese", "Languages"),
            // Business (8)
            new SkillSeed("Microeconomics", "Business"),
            new SkillSeed("Excel Modeling", "Business"),
            new SkillSeed("Business Strategy", "Business"),
            new SkillSeed("Marketing 101", "Business"),
            new SkillSeed("Public Speaking", "Business"),
            new SkillSeed("Technical Writing", "Business"),
            new SkillSeed("Negotiation", "Business"),
            new SkillSeed("Project Management", "Business"),
            // Design (7)
            new SkillSeed("UI Design", "Design"),
            new SkillSeed("Figma Prototyping", "Design"),
            new SkillSeed("Web Design", "Design"),
            new SkillSeed("SketchUp 3D", "Design"),
            new SkillSeed("Architectural Drawing", "Design"),
            new SkillSeed("Illustration", "Design"),
            new SkillSeed("Motion Graphics", "Design")
    );

    private static final List<ResourceSeed> RESOURCES = List.of(
            new ResourceSeed("Java OOP — Oracle Learning Path", "Oracle", "https://docs.oracle.com/en/java/javase/21/tutorial/java/concepts/object.html", "Java OOP", "Tech", "guide"),
            new ResourceSeed("SQLBolt interactive SQL lessons", "SQLBolt", "https://sqlbolt.com/", "SQL Database", "Tech", "exercise"),
            new ResourceSeed("Khan Academy — Intro to SQL", "Khan Academy", "https://www.khanacademy.org/computing/computer-programming/sql", "SQL Database", "Tech", "course"),
            new ResourceSeed("fast.ai — Practical Deep Learning", "fast.ai", "https://course.fast.ai/", "Python AI", "Tech", "course"),
            new ResourceSeed("3Blue1Brown — Neural networks", "YouTube", "https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi", "ML Fundamentals", "Tech", "video"),
            new ResourceSeed("MIT OCW 6.006 Introduction to Algorithms", "MIT OpenCourseWare", "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/", "Algorithms", "Tech", "course"),
            new ResourceSeed("CS50 — C programming", "Harvard", "https://cs50.harvard.edu/x/", "C Programming", "Tech", "course"),
            new ResourceSeed("MDN — JavaScript foundations", "MDN", "https://developer.mozilla.org/en-US/docs/Web/JavaScript", "Web Development", "Tech", "guide"),
            new ResourceSeed("Figma — Auto layout tutorial", "Figma", "https://www.figma.com/resources/learn-design/auto-layout/", "Figma Prototyping", "Design", "video"),
            new ResourceSeed("NNGroup — Usability heuristics", "Nielsen Norman Group", "https://www.nngroup.com/articles/ten-usability-heuristics/", "UI Design", "Design", "guide"),
            new ResourceSeed("SketchUp Campus — free courses", "SketchUp", "https://learn.sketchup.com/", "SketchUp 3D", "Design", "course"),
            new ResourceSeed("Khan Academy — Drawing", "Khan Academy", "https://www.khanacademy.org/partner-content/pixar/drawing", "Drawing", "Arts", "course"),
            new ResourceSeed("MusicTheory.net — lessons", "musictheory.net", "https://www.musictheory.net/lessons", "Music Theory", "Arts", "exercise"),
            new ResourceSeed("Coursera — Public speaking (rotation)", "Coursera", "https://www.coursera.org/learn/public-speaking", "Public Speaking", "Business", "course"),
            new ResourceSeed("Toastmasters — how meetings work", "Toastmasters", "https://www.toastmasters.org/about/meeting-format", "Public Speaking", "Business", "guide"),
            new ResourceSeed("Goethe-Institut — German A1 resources", "Goethe-Institut", "https://www.goethe.de/en/spr/ueb.html", "German", "Languages", "course"),
            new ResourceSeed("BBC Languages — Spanish", "BBC", "https://www.bbc.co.uk/languages/spanish/", "Spanish", "Languages", "course"),
            new ResourceSeed("Investopedia — Microeconomics basics", "Investopedia", "https://www.investopedia.com/terms/m/microeconomics.asp", "Microeconomics", "Business", "guide"),
            new ResourceSeed("Khan Academy — Statistics", "Khan Academy", "https://www.khanacademy.org/math/statistics-probability", "Data Analysis", "Tech", "course")
    );

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;
    private final AppProperties props;
    private final AuditService audit;

    public SeedService(JdbcTemplate jdbc, PasswordEncoder passwordEncoder,
                       AppProperties props, AuditService audit) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.props = props;
        this.audit = audit;
    }

    /**
     * Ensures ONLY the skill catalog and curated learning links exist.
     * Never creates demo accounts, sessions, ratings, reviews or synthetic metrics.
     */
    @Transactional
    public boolean seedIfEmpty(boolean force) {
        if (force) {
            jdbc.execute("DELETE FROM skills WHERE id NOT IN (SELECT DISTINCT skill_id FROM sessions)");
            jdbc.execute("DELETE FROM resources");
        }

        int insertedSkills = 0;
        for (SkillSeed sk : SKILLS) {
            insertedSkills += jdbc.update(
                    "INSERT OR IGNORE INTO skills (id, name, category) VALUES (?,?,?)",
                    uuid(), sk.name(), sk.category());
        }

        Integer existingResources = jdbc.queryForObject("SELECT COUNT(*) FROM resources", Integer.class);
        if (existingResources == null || existingResources == 0) {
            for (ResourceSeed r : RESOURCES) {
                jdbc.update("INSERT OR IGNORE INTO resources (id, title, provider, url, skill, category, kind) VALUES (?,?,?,?,?,?,?)",
                        uuid(), r.title(), r.provider(), r.url(), r.skill(), r.category(), r.kind());
            }
        }

        if (insertedSkills > 0) {
            System.out.printf("[catalog] Seeded %d skill catalog entries (0 users)%n", insertedSkills);
        }
        return insertedSkills > 0;
    }

    /**
     * Bootstraps the first administrator ONLY if zero admin accounts exist and both
     * ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD are set in the environment.
     * Never logs the password; forces a password change at first login.
     */
    @Transactional
    public void bootstrapAdminIfNeeded() {
        Integer adminCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM users WHERE role = 'admin'", Integer.class);
        if (adminCount != null && adminCount > 0) {
            return;
        }

        String rawEmail = props.getAdminEmail();
        String rawPassword = props.getAdminInitialPassword();
        if (rawEmail == null || rawEmail.isBlank() || rawPassword == null || rawPassword.isBlank()) {
            System.out.println("[bootstrap] No administrator account exists in the database. "
                    + "To bootstrap the first admin, set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD "
                    + "in your environment or .env file and restart the server.");
            return;
        }

        String email = rawEmail.trim().toLowerCase(Locale.ROOT);
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            System.err.println("[bootstrap] ADMIN_EMAIL is not a valid email address; skipping admin bootstrap.");
            return;
        }
        if (rawPassword.length() < 8) {
            System.err.println("[bootstrap] ADMIN_INITIAL_PASSWORD must be at least 8 characters; skipping admin bootstrap.");
            return;
        }

        Map<String, Object> existingUser = DbSupport.one(jdbc, "SELECT id FROM users WHERE lower(email) = ?", email);
        String hashedPassword = passwordEncoder.encode(rawPassword);

        if (existingUser != null) {
            String existingId = DbSupport.str(existingUser, "id");
            jdbc.update("""
                    UPDATE users
                    SET role = 'admin', password_hash = ?, email_verified = 1,
                        must_change_password = 1, demo = 0, restricted = 0,
                        failed_attempts = 0, locked_until = NULL, updated_at = ?
                    WHERE id = ?
                    """, hashedPassword, DbSupport.nowIso(), existingId);
            audit.log(existingId, "admin_bootstrapped", "local", "success", email);
            System.out.printf("[bootstrap] Promoted existing account %s to initial admin (mustChangePassword=true)%n", email);
            return;
        }

        String adminId = uuid();
        String localPart = email.split("@")[0].replaceAll("[^a-z0-9._-]", "");
        if (localPart.isBlank()) {
            localPart = "admin";
        }
        if (localPart.length() > 24) {
            localPart = localPart.substring(0, 24);
        }
        String username = localPart + "-" + randomSuffix(4);
        jdbc.update("""
                INSERT INTO users
                (id, name, email, username, password_hash, role, email_verified, must_change_password, status, demo)
                VALUES (?,?,?,?,?, 'admin', 1, 1, 'offline', 0)
                """,
                adminId, "Platform Administrator", email, username, hashedPassword);
        audit.log(adminId, "admin_bootstrapped", "local", "success", email);
        System.out.printf("[bootstrap] Created initial admin account for %s (mustChangePassword=true)%n", email);
    }

    private static String randomSuffix(int length) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < length; i++) {
            out.append(BASE36.charAt(RANDOM.nextInt(BASE36.length())));
        }
        return out.toString();
    }

    private static String uuid() {
        return UUID.randomUUID().toString();
    }
}
