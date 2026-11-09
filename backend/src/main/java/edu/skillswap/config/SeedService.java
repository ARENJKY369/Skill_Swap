package edu.skillswap.config;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class SeedService {

    private record SkillSeed(String name, String category) {}
    private record StudentSeed(
            String name, String username, String email, String major, String university, String year,
            String bio, List<String> teaches, List<String> wants,
            Map<String, String> teachLevels, Map<String, String> wantLevels, String status
    ) {}
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

    private static final List<StudentSeed> STUDENTS = List.of(
            new StudentSeed("Ava Rahman", "ava.codes", "ava@skillswap.edu", "Computer Science", "IIT Delhi", "3rd year",
                    "Backend-leaning full-stack student. Java by day, Figma by night. Happy to trade UI critique for Python help.",
                    List.of("Java OOP", "SQL Database", "UI Design"), List.of("Python AI", "UI Design"),
                    Map.of("Java OOP", "high", "SQL Database", "high", "UI Design", "med"),
                    Map.of("Python AI", "low"), "online"),
            new StudentSeed("Mateo Alvarez", "mateo.speaks", "mateo@skillswap.edu", "Mechanical Engineering", "Purdue University", "2nd year",
                    "Debate captain. I teach presentations and technical writing to engineers who would rather not present.",
                    List.of("Public Speaking", "Technical Writing", "Negotiation"), List.of("SQL Database", "Java OOP"),
                    Map.of("Public Speaking", "high", "Technical Writing", "med", "Negotiation", "med"),
                    Map.of("SQL Database", "low", "Java OOP", "low"), "online"),
            new StudentSeed("Priya Natarajan", "priya.stats", "priya@skillswap.edu", "Biochemistry", "Stanford University", "4th year",
                    "Wet-lab by day, data by night. I can take you from raw CSV to a defensible chart.",
                    List.of("Data Analysis", "Algorithms"), List.of("UI Design", "Public Speaking"),
                    Map.of("Data Analysis", "high", "Algorithms", "med"),
                    Map.of("UI Design", "low", "Public Speaking", "low"), "busy"),
            new StudentSeed("Jonas Weber", "jonas.embedded", "jonas@skillswap.edu", "Electrical Engineering", "TU Berlin", "3rd year",
                    "Firmware and bare-metal C. Currently soldering my way through a sensor-fusion project.",
                    List.of("Embedded Systems", "C Programming"), List.of("ML Fundamentals", "Python AI"),
                    Map.of("Embedded Systems", "high", "C Programming", "high"),
                    Map.of("ML Fundamentals", "low", "Python AI", "low"), "online"),
            new StudentSeed("Sara Lindqvist", "sara.paints", "sara@skillswap.edu", "Art History", "Uppsala University", "2nd year",
                    "Painting, printmaking and long museum walks. Ask me about Goya or glazing.",
                    List.of("Painting", "Art History", "Drawing"), List.of("Web Design", "Photography"),
                    Map.of("Painting", "high", "Art History", "high", "Drawing", "med"),
                    Map.of("Web Design", "low", "Photography", "med"), "offline"),
            new StudentSeed("Dmitri Volkov", "dmitri.math", "dmitri@skillswap.edu", "Mathematics", "ETH Zürich", "4th year",
                    "Proofs, eigenvalues and the occasional optimization problem. I write things down carefully.",
                    List.of("Algorithms"), List.of("Technical Writing", "Public Speaking"),
                    Map.of("Algorithms", "high"),
                    Map.of("Technical Writing", "low", "Public Speaking", "low"), "busy"),
            new StudentSeed("Lila Haddad", "lila.writes", "lila@skillswap.edu", "English Literature", "American University of Beirut", "3rd year",
                    "Creative writing workshops every Friday. I edit gently but honestly.",
                    List.of("Creative Writing", "Public Speaking"), List.of("Data Analysis", "Web Development"),
                    Map.of("Creative Writing", "high", "Public Speaking", "med"),
                    Map.of("Data Analysis", "low", "Web Development", "low"), "online"),
            new StudentSeed("Chen Wei", "chen.ml", "chen@skillswap.edu", "Computer Science", "National University of Singapore", "Masters",
                    "ML research assistant. Transformers, PyTorch, and a soft spot for linear algebra.",
                    List.of("Python AI", "ML Fundamentals"), List.of("UI Design", "Algorithms"),
                    Map.of("Python AI", "high", "ML Fundamentals", "high"),
                    Map.of("UI Design", "med", "Algorithms", "med"), "online"),
            new StudentSeed("Noor Abbasi", "noor.sketch", "noor@skillswap.edu", "Architecture", "CEPT University", "3rd year",
                    "Model-making and SketchUp. I think in sections and elevations.",
                    List.of("SketchUp 3D", "Architectural Drawing"), List.of("Web Design", "UI Design"),
                    Map.of("SketchUp 3D", "high", "Architectural Drawing", "high"),
                    Map.of("Web Design", "low", "UI Design", "low"), "offline"),
            new StudentSeed("Tomás Silva", "tomas.music", "tomas@skillswap.edu", "Music", "UFRJ", "2nd year",
                    "Classical guitar and theory. I also edit recital videos, badly but lovingly.",
                    List.of("Music Theory", "Guitar"), List.of("Video Editing"),
                    Map.of("Music Theory", "high", "Guitar", "med"),
                    Map.of("Video Editing", "low"), "busy"),
            new StudentSeed("Grace Mbeki", "grace.econ", "grace@skillswap.edu", "Economics", "University of Nairobi", "4th year",
                    "Econometrics and Excel wizardry. I explain supply curves with chapati analogies.",
                    List.of("Microeconomics", "Excel Modeling"), List.of("Python AI", "Data Analysis"),
                    Map.of("Microeconomics", "high", "Excel Modeling", "high"),
                    Map.of("Python AI", "low", "Data Analysis", "med"), "online"),
            new StudentSeed("Hannah Kim", "hannah.pixels", "hannah@skillswap.edu", "Visual Design", "Hongik University", "Masters",
                    "Product designer. Figma auto-layout evangelist; grids or nothing.",
                    List.of("UI Design", "Figma Prototyping"), List.of("SQL Database", "Python AI"),
                    Map.of("UI Design", "high", "Figma Prototyping", "high"),
                    Map.of("SQL Database", "low", "Python AI", "low"), "online"),
            new StudentSeed("Omar Farouk", "omar.strategy", "omar@skillswap.edu", "Business Administration", "American University in Cairo", "3rd year",
                    "Marketing case competitions and dry humour. I can workshop your pitch deck.",
                    List.of("Business Strategy", "Marketing 101"), List.of("Video Editing", "Motion Graphics"),
                    Map.of("Business Strategy", "med", "Marketing 101", "high"),
                    Map.of("Video Editing", "low", "Motion Graphics", "low"), "online"),
            new StudentSeed("Elena Petrova", "elena.langs", "elena@skillswap.edu", "Linguistics", "Charles University", "2nd year",
                    "Native Czech, fluent German, working English. Happy to trade conversation practice.",
                    List.of("Czech", "German"), List.of("Public Speaking", "Mandarin"),
                    Map.of("Czech", "high", "German", "high"),
                    Map.of("Public Speaking", "med", "Mandarin", "low"), "offline"),
            new StudentSeed("Diego Ramírez", "diego.data", "diego@skillswap.edu", "Computer Science", "Universidad Nacional Autónoma de México", "3rd year",
                    "Databases, query plans and C. I will not judge your SELECT * habit. Much.",
                    List.of("SQL Database", "C Programming"), List.of("Guitar", "Music Theory"),
                    Map.of("SQL Database", "high", "C Programming", "med"),
                    Map.of("Guitar", "low", "Music Theory", "low"), "online")
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
    private final ObjectMapper objectMapper;

    public SeedService(JdbcTemplate jdbc, PasswordEncoder passwordEncoder, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public boolean seedIfEmpty(boolean force) {
        Integer existing = jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class);
        if (existing != null && existing > 0 && !force) {
            System.out.printf("[seed] skipped (%d users present)%n", existing);
            return false;
        }
        if (force) {
            for (String table : List.of(
                    "reviews", "sessions", "connection_requests", "notifications",
                    "email_codes", "mfa_pending", "auth_sessions", "admin_metrics",
                    "skills", "users", "resources")) {
                jdbc.execute("DELETE FROM " + table);
            }
        }

        for (SkillSeed sk : SKILLS) {
            jdbc.update("INSERT OR IGNORE INTO skills (id, name, category) VALUES (?,?,?)",
                    uuid(), sk.name(), sk.category());
        }

        Map<String, String> skillIdByName = new HashMap<>();
        jdbc.query("SELECT id, name FROM skills", rs -> {
            skillIdByName.put(rs.getString("name"), rs.getString("id"));
        });

        String pwStudent = passwordEncoder.encode("student1234");
        String pwAdmin = passwordEncoder.encode("admin1234");

        String insertUserSql = """
                INSERT INTO users
                (id, name, email, username, password_hash, role, major, university, year, bio, teaches, wants, teach_levels, want_levels, avg_rating, review_count, status, email_verified, demo)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 0, 0, ?, 1, 1)
                """;

        Map<String, String> idByUsername = new HashMap<>();
        for (StudentSeed s : STUDENTS) {
            String id = uuid();
            idByUsername.put(s.username(), id);
            jdbc.update(insertUserSql,
                    id, s.name(), s.email(), s.username(), pwStudent, "student",
                    s.major(), s.university(), s.year(), s.bio(),
                    toJson(s.teaches()), toJson(s.wants()),
                    toJson(s.teachLevels()), toJson(s.wantLevels()), s.status());
        }

        String adminId = uuid();
        jdbc.update(insertUserSql,
                adminId, "Rhea Kapoor", "admin@skillswap.edu", "rhea.admin", pwAdmin, "admin",
                "Computer Science", "IIT Delhi", "Graduate",
                "Platform administrator. Accounts, categories and audit trails.",
                "[]", "[]", "{}", "{}", "offline");

        String ava = idByUsername.get("ava.codes");
        String diego = idByUsername.get("diego.data");
        String chen = idByUsername.get("chen.ml");
        String hannah = idByUsername.get("hannah.pixels");
        String jonas = idByUsername.get("jonas.embedded");
        String sara = idByUsername.get("sara.paints");
        String mateo = idByUsername.get("mateo.speaks");
        String lila = idByUsername.get("lila.writes");
        String priya = idByUsername.get("priya.stats");

        String sqlSkill = skillIdByName.get("SQL Database");
        String pySkill = skillIdByName.get("Python AI");
        String uiSkill = skillIdByName.get("UI Design");
        String embSkill = skillIdByName.get("Embedded Systems");
        String paintSkill = skillIdByName.get("Painting");
        String speakSkill = skillIdByName.get("Public Speaking");
        String javaSkill = skillIdByName.get("Java OOP");

        String insertSessionSql = """
                INSERT INTO sessions
                (id, requester_id, recipient_id, skill_id, start, duration_min, status, message, meeting_url, completed_by_requester, completed_by_recipient, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """;
        String now = nowIso();
        jdbc.update(insertSessionSql, uuid(), diego, ava, sqlSkill, mk(1, 9, 0), 60, "Accepted",
                "Bring your query plan questions. We will walk through EXPLAIN ANALYZE together.",
                "https://zoom.us/j/94173322187?pwd=sqldemo", 0, 0, now, now);
        jdbc.update(insertSessionSql, uuid(), chen, ava, pySkill, mk(3, 17, 30), 90, "Accepted",
                "Gradient descent intuition session. Bring a laptop.",
                "https://zoom.us/j/94173390112?pwd=pydemo", 0, 0, now, now);
        jdbc.update(insertSessionSql, uuid(), jonas, ava, embSkill, mk(1, 18, 0), 60, "Pending",
                "I can show you bare-metal timers and interrupts if you bring SQL practice.",
                null, 0, 0, now, now);
        jdbc.update(insertSessionSql, uuid(), sara, ava, paintSkill, mk(2, 15, 0), 45, "Pending",
                "Watercolor basics. Brushes and paper provided at the studio.",
                null, 0, 0, now, now);
        jdbc.update(insertSessionSql, uuid(), ava, chen, pySkill, mk(-6, 18, 0), 60, "Completed",
                "First Python AI session — tensors and autograd.",
                "https://zoom.us/j/94122210009?pwd=done1", 1, 1, now, now);
        jdbc.update(insertSessionSql, uuid(), hannah, ava, uiSkill, mk(-13, 16, 30), 75, "Completed",
                "Figma variables and auto-layout critique of my portfolio.",
                null, 1, 1, now, now);
        jdbc.update(insertSessionSql, uuid(), ava, mateo, speakSkill, mk(-20, 10, 0), 30, "Declined",
                "Reschedule after finals?", null, 0, 0, now, now);
        jdbc.update(insertSessionSql, uuid(), ava, mateo, javaSkill, mk(-9, 18, 0), 60, "Completed",
                "OOP crash course: classes, inheritance, interfaces.",
                null, 1, 1, now, now);
        jdbc.update(insertSessionSql, uuid(), ava, priya, javaSkill, mk(-15, 19, 0), 90, "Completed",
                "Java collections and streams for interview prep.",
                null, 1, 1, now, now);

        String insertRequestSql = "INSERT INTO connection_requests (id, from_id, to_id, skill, message, status, created_at) VALUES (?,?,?,?,?,?,?)";
        jdbc.update(insertRequestSql, uuid(), mateo, ava, "SQL Database", "Saw your SQL pills — pairwise trade for rhetoric practice?", "Pending", now);
        jdbc.update(insertRequestSql, uuid(), lila, ava, "UI Design", "Would love feedback on my newsletter layout.", "Pending", now);
        jdbc.update(insertRequestSql, uuid(), priya, ava, "Java OOP", "Need a Java crash course before interviews.", "Pending", now);
        jdbc.update(insertRequestSql, uuid(), ava, chen, "Python AI", "I will teach SQL in exchange.", "Accepted", now);

        String insertNotifSql = "INSERT INTO notifications (id, user_id, title, body, kind, read, created_at) VALUES (?,?,?,?,?,?,?)";
        jdbc.update(insertNotifSql, uuid(), ava, "New connection request", "Mateo Alvarez wants to connect over SQL Database.", "request", 0, now);
        jdbc.update(insertNotifSql, uuid(), ava, "New connection request", "Lila Haddad wants to connect over UI Design.", "request", 0, now);
        jdbc.update(insertNotifSql, uuid(), ava, "New connection request", "Priya Natarajan wants to connect over Java OOP.", "request", 0, now);
        jdbc.update(insertNotifSql, uuid(), ava, "Session tomorrow", "SQL Database with Diego Ramírez at 09:00.", "reminder", 1, now);

        String insertResourceSql = "INSERT OR IGNORE INTO resources (id, title, provider, url, skill, category, kind) VALUES (?,?,?,?,?,?,?)";
        for (ResourceSeed r : RESOURCES) {
            jdbc.update(insertResourceSql, uuid(), r.title(), r.provider(), r.url(), r.skill(), r.category(), r.kind());
        }

        // Deterministic 30-day LCG metrics
        long[] seedState = { 1337L & 0xffffffffL };
        List<String> chartSkills = List.of("Java OOP", "Python AI", "SQL Database", "UI Design", "Public Speaking");
        String insertMetricSql = "INSERT OR REPLACE INTO admin_metrics (day, skill, matches, sessions) VALUES (?,?,?,?)";
        for (String skill : chartSkills) {
            int matches = 18 + (int) Math.floor(nextRand(seedState) * 20);
            int sessions = 6 + (int) Math.floor(nextRand(seedState) * 8);
            for (int i = 29; i >= 0; i--) {
                String day = LocalDate.now().minusDays(i).toString();
                matches = Math.max(4, Math.min(60, (int) Math.round(matches + (nextRand(seedState) - 0.45) * 9)));
                sessions = Math.max(2, Math.min(24, (int) Math.round(sessions + (nextRand(seedState) - 0.45) * 4)));
                jdbc.update(insertMetricSql, day, skill, matches, sessions);
            }
        }

        System.out.printf("[seed] complete: %d students + 1 admin (demo accounts), %d skills, 0 reviews%n",
                STUDENTS.size(), SKILLS.size());
        return true;
    }

    private static double nextRand(long[] state) {
        state[0] = (state[0] * 1664525L + 1013904223L) & 0xffffffffL;
        return (double) state[0] / (double) 0xffffffffL;
    }

    private static String mk(int daysOffset, int hour, int minute) {
        LocalDate date = LocalDate.now().plusDays(daysOffset);
        Instant instant = date.atTime(LocalTime.of(hour, minute)).atZone(ZoneId.systemDefault()).toInstant();
        return DateTimeFormatter.ISO_INSTANT.format(instant);
    }

    private static String nowIso() {
        return DateTimeFormatter.ISO_INSTANT.format(Instant.now());
    }

    private static String uuid() {
        return UUID.randomUUID().toString();
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("JSON serialization failure", e);
        }
    }
}
