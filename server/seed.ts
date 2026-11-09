import './env';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { db, nowIso, uuid } from './db';

/**
 * Seeds the demo catalog + 17 accounts (all flagged demo=1).
 * Zero reviews / ratings are seeded by design.
 */
const SKILLS: Array<[string, string]> = [
  // Tech
  ['Java OOP', 'Tech'], ['Python AI', 'Tech'], ['SQL Database', 'Tech'], ['C Programming', 'Tech'],
  ['Embedded Systems', 'Tech'], ['ML Fundamentals', 'Tech'], ['Data Analysis', 'Tech'], ['Algorithms', 'Tech'],
  ['Web Development', 'Tech'], ['Git & DevOps', 'Tech'], ['Linux Systems', 'Tech'], ['Cloud Basics', 'Tech'],
  ['Networking', 'Tech'], ['Cybersecurity Basics', 'Tech'],
  // Arts
  ['Painting', 'Arts'], ['Guitar', 'Arts'], ['Music Theory', 'Arts'], ['Photography', 'Arts'],
  ['Video Editing', 'Arts'], ['Creative Writing', 'Arts'], ['Art History', 'Arts'], ['Drawing', 'Arts'],
  ['Acting', 'Arts'], ['Ceramics', 'Arts'],
  // Languages
  ['Spanish', 'Languages'], ['French', 'Languages'], ['German', 'Languages'], ['Czech', 'Languages'],
  ['Mandarin', 'Languages'], ['Arabic', 'Languages'], ['Japanese', 'Languages'],
  // Business
  ['Microeconomics', 'Business'], ['Excel Modeling', 'Business'], ['Business Strategy', 'Business'],
  ['Marketing 101', 'Business'], ['Public Speaking', 'Business'], ['Technical Writing', 'Business'],
  ['Negotiation', 'Business'], ['Project Management', 'Business'],
  // Design
  ['UI Design', 'Design'], ['Figma Prototyping', 'Design'], ['Web Design', 'Design'], ['SketchUp 3D', 'Design'],
  ['Architectural Drawing', 'Design'], ['Illustration', 'Design'], ['Motion Graphics', 'Design'],
];

interface SeedUser {
  name: string; username: string; email: string; major: string; university: string; year: string;
  bio: string; teaches: string[]; wants: string[];
  teachLevels: Record<string, 'low' | 'med' | 'high'>;
  wantLevels: Record<string, 'low' | 'med' | 'high'>;
  status: 'online' | 'busy' | 'offline';
}

const STUDENTS: SeedUser[] = [
  { name: 'Ava Rahman', username: 'ava.codes', email: 'ava@skillswap.edu', major: 'Computer Science', university: 'IIT Delhi', year: '3rd year',
    bio: 'Backend-leaning full-stack student. Java by day, Figma by night. Happy to trade UI critique for Python help.',
    teaches: ['Java OOP', 'SQL Database', 'UI Design'], wants: ['Python AI', 'Blender 3D'].filter(s => ['Python AI','Blender 3D'].includes(s)),
    teachLevels: { 'Java OOP': 'high', 'SQL Database': 'high', 'UI Design': 'med' },
    wantLevels: { 'Python AI': 'low' }, status: 'online' },
  { name: 'Mateo Alvarez', username: 'mateo.speaks', email: 'mateo@skillswap.edu', major: 'Mechanical Engineering', university: 'Purdue University', year: '2nd year',
    bio: 'Debate captain. I teach presentations and technical writing to engineers who would rather not present.',
    teaches: ['Public Speaking', 'Technical Writing', 'Negotiation'], wants: ['SQL Database', 'Java OOP'],
    teachLevels: { 'Public Speaking': 'high', 'Technical Writing': 'med', 'Negotiation': 'med' },
    wantLevels: { 'SQL Database': 'low', 'Java OOP': 'low' }, status: 'online' },
  { name: 'Priya Natarajan', username: 'priya.stats', email: 'priya@skillswap.edu', major: 'Biochemistry', university: 'Stanford University', year: '4th year',
    bio: 'Wet-lab by day, data by night. I can take you from raw CSV to a defensible chart.',
    teaches: ['Data Analysis', 'Algorithms'], wants: ['UI Design', 'Public Speaking'],
    teachLevels: { 'Data Analysis': 'high', 'Algorithms': 'med' },
    wantLevels: { 'UI Design': 'low', 'Public Speaking': 'low' }, status: 'busy' },
  { name: 'Jonas Weber', username: 'jonas.embedded', email: 'jonas@skillswap.edu', major: 'Electrical Engineering', university: 'TU Berlin', year: '3rd year',
    bio: 'Firmware and bare-metal C. Currently soldering my way through a sensor-fusion project.',
    teaches: ['Embedded Systems', 'C Programming'], wants: ['ML Fundamentals', 'Python AI'],
    teachLevels: { 'Embedded Systems': 'high', 'C Programming': 'high' },
    wantLevels: { 'ML Fundamentals': 'low', 'Python AI': 'low' }, status: 'online' },
  { name: 'Sara Lindqvist', username: 'sara.paints', email: 'sara@skillswap.edu', major: 'Art History', university: 'Uppsala University', year: '2nd year',
    bio: 'Painting, printmaking and long museum walks. Ask me about Goya or glazing.',
    teaches: ['Painting', 'Art History', 'Drawing'], wants: ['Web Design', 'Photography'],
    teachLevels: { 'Painting': 'high', 'Art History': 'high', 'Drawing': 'med' },
    wantLevels: { 'Web Design': 'low', 'Photography': 'med' }, status: 'offline' },
  { name: 'Dmitri Volkov', username: 'dmitri.math', email: 'dmitri@skillswap.edu', major: 'Mathematics', university: 'ETH Zürich', year: '4th year',
    bio: 'Proofs, eigenvalues and the occasional optimization problem. I write things down carefully.',
    teaches: ['Algorithms'], wants: ['Technical Writing', 'Public Speaking'],
    teachLevels: { 'Algorithms': 'high' },
    wantLevels: { 'Technical Writing': 'low', 'Public Speaking': 'low' }, status: 'busy' },
  { name: 'Lila Haddad', username: 'lila.writes', email: 'lila@skillswap.edu', major: 'English Literature', university: 'American University of Beirut', year: '3rd year',
    bio: 'Creative writing workshops every Friday. I edit gently but honestly.',
    teaches: ['Creative Writing', 'Public Speaking'], wants: ['Data Analysis', 'Web Development'],
    teachLevels: { 'Creative Writing': 'high', 'Public Speaking': 'med' },
    wantLevels: { 'Data Analysis': 'low', 'Web Development': 'low' }, status: 'online' },
  { name: 'Chen Wei', username: 'chen.ml', email: 'chen@skillswap.edu', major: 'Computer Science', university: 'National University of Singapore', year: 'Masters',
    bio: 'ML research assistant. Transformers, PyTorch, and a soft spot for linear algebra.',
    teaches: ['Python AI', 'ML Fundamentals'], wants: ['UI Design', 'Algorithms'],
    teachLevels: { 'Python AI': 'high', 'ML Fundamentals': 'high' },
    wantLevels: { 'UI Design': 'med', 'Algorithms': 'med' }, status: 'online' },
  { name: 'Noor Abbasi', username: 'noor.sketch', email: 'noor@skillswap.edu', major: 'Architecture', university: 'CEPT University', year: '3rd year',
    bio: 'Model-making and SketchUp. I think in sections and elevations.',
    teaches: ['SketchUp 3D', 'Architectural Drawing'], wants: ['Web Design', 'UI Design'],
    teachLevels: { 'SketchUp 3D': 'high', 'Architectural Drawing': 'high' },
    wantLevels: { 'Web Design': 'low', 'UI Design': 'low' }, status: 'offline' },
  { name: 'Tomás Silva', username: 'tomas.music', email: 'tomas@skillswap.edu', major: 'Music', university: 'UFRJ', year: '2nd year',
    bio: 'Classical guitar and theory. I also edit recital videos, badly but lovingly.',
    teaches: ['Music Theory', 'Guitar'], wants: ['Video Editing'],
    teachLevels: { 'Music Theory': 'high', 'Guitar': 'med' },
    wantLevels: { 'Video Editing': 'low' }, status: 'busy' },
  { name: 'Grace Mbeki', username: 'grace.econ', email: 'grace@skillswap.edu', major: 'Economics', university: 'University of Nairobi', year: '4th year',
    bio: 'Econometrics and Excel wizardry. I explain supply curves with chapati analogies.',
    teaches: ['Microeconomics', 'Excel Modeling'], wants: ['Python AI', 'Data Analysis'],
    teachLevels: { 'Microeconomics': 'high', 'Excel Modeling': 'high' },
    wantLevels: { 'Python AI': 'low', 'Data Analysis': 'med' }, status: 'online' },
  { name: 'Hannah Kim', username: 'hannah.pixels', email: 'hannah@skillswap.edu', major: 'Visual Design', university: 'Hongik University', year: 'Masters',
    bio: 'Product designer. Figma auto-layout evangelist; grids or nothing.',
    teaches: ['UI Design', 'Figma Prototyping'], wants: ['SQL Database', 'Python AI'],
    teachLevels: { 'UI Design': 'high', 'Figma Prototyping': 'high' },
    wantLevels: { 'SQL Database': 'low', 'Python AI': 'low' }, status: 'online' },
  { name: 'Omar Farouk', username: 'omar.strategy', email: 'omar@skillswap.edu', major: 'Business Administration', university: 'American University in Cairo', year: '3rd year',
    bio: 'Marketing case competitions and dry humour. I can workshop your pitch deck.',
    teaches: ['Business Strategy', 'Marketing 101'], wants: ['Video Editing', 'Motion Graphics'],
    teachLevels: { 'Business Strategy': 'med', 'Marketing 101': 'high' },
    wantLevels: { 'Video Editing': 'low', 'Motion Graphics': 'low' }, status: 'online' },
  { name: 'Elena Petrova', username: 'elena.langs', email: 'elena@skillswap.edu', major: 'Linguistics', university: 'Charles University', year: '2nd year',
    bio: 'Native Czech, fluent German, working English. Happy to trade conversation practice.',
    teaches: ['Czech', 'German'], wants: ['Public Speaking', 'Mandarin'],
    teachLevels: { 'Czech': 'high', 'German': 'high' },
    wantLevels: { 'Public Speaking': 'med', 'Mandarin': 'low' }, status: 'offline' },
  { name: 'Diego Ramírez', username: 'diego.data', email: 'diego@skillswap.edu', major: 'Computer Science', university: 'Universidad Nacional Autónoma de México', year: '3rd year',
    bio: 'Databases, query plans and C. I will not judge your SELECT * habit. Much.',
    teaches: ['SQL Database', 'C Programming'], wants: ['Guitar', 'Music Theory'],
    teachLevels: { 'SQL Database': 'high', 'C Programming': 'med' },
    wantLevels: { 'Guitar': 'low', 'Music Theory': 'low' }, status: 'online' },
];
// Keep 'Blender 3D'-style wants honest: catalog-only skills.
STUDENTS.forEach((s) => { s.wants = s.wants.filter((w) => !w.startsWith('Blender')); });
STUDENTS[0].wants = ['Python AI', 'UI Design']; // ava trades back into design

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function seedIfEmpty(force: boolean): boolean {
  const existing = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  if (existing > 0 && !force) {
    console.log(`[seed] skipped (${existing} users present)`);
    return false;
  }
  if (force) {
    for (const t of ['reviews', 'sessions', 'connection_requests', 'notifications', 'email_codes', 'mfa_pending', 'auth_sessions', 'admin_metrics', 'skills', 'users', 'resources']) {
      db.prepare(`DELETE FROM ${t}`).run();
    }
  }

  const insertSkill = db.prepare('INSERT OR IGNORE INTO skills (id, name, category) VALUES (?,?,?)');
  for (const [name, category] of SKILLS) insertSkill.run(uuid(), name, category);
  const skillIdByName = new Map<string, string>(
    (db.prepare('SELECT id, name FROM skills').all() as Array<{ id: string; name: string }>).map((r) => [r.name, r.id]),
  );

  const pwStudent = bcrypt.hashSync('student1234', 10);
  const pwAdmin = bcrypt.hashSync('admin1234', 10);
  const insertUser = db.prepare(`INSERT INTO users
    (id, name, email, username, password_hash, role, major, university, year, bio, teaches, wants, teach_levels, want_levels, avg_rating, review_count, status, email_verified, demo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 0, 0, ?, 1, 1)`);

  const idByUsername = new Map<string, string>();
  for (const s of STUDENTS) {
    const id = uuid();
    idByUsername.set(s.username, id);
    insertUser.run(id, s.name, s.email, s.username, pwStudent, 'student', s.major, s.university, s.year, s.bio,
      JSON.stringify(s.teaches), JSON.stringify(s.wants), JSON.stringify(s.teachLevels), JSON.stringify(s.wantLevels), s.status);
  }
  const adminId = uuid();
  insertUser.run(adminId, 'Rhea Kapoor', 'admin@skillswap.edu', 'rhea.admin', pwAdmin, 'admin', 'Computer Science', 'IIT Delhi', 'Graduate',
    'Platform administrator. Accounts, categories and audit trails.', '[]', '[]', '{}', '{}', 'offline');

  // --- Demo sessions for ava.codes ---
  const ava = idByUsername.get('ava.codes')!;
  const diego = idByUsername.get('diego.data')!;
  const chen = idByUsername.get('chen.ml')!;
  const hannah = idByUsername.get('hannah.pixels')!;
  const jonas = idByUsername.get('jonas.embedded')!;
  const sara = idByUsername.get('sara.paints')!;
  const mateo = idByUsername.get('mateo.speaks')!;

  const insertSession = db.prepare(`INSERT INTO sessions
    (id, requester_id, recipient_id, skill_id, start, duration_min, status, message, meeting_url, completed_by_requester, completed_by_recipient, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const dayOffset = (days: number, h: number, m: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const mk = (days: number, h: number, m: number) => dayOffset(days, h, m);
  const sqlSkill = skillIdByName.get('SQL Database')!;
  const pySkill = skillIdByName.get('Python AI')!;
  const uiSkill = skillIdByName.get('UI Design')!;
  const embSkill = skillIdByName.get('Embedded Systems')!;
  const paintSkill = skillIdByName.get('Painting')!;
  const speakSkill = skillIdByName.get('Public Speaking')!;

  insertSession.run(uuid(), diego, ava, sqlSkill, mk(1, 9, 0), 60, 'Accepted',
    'Bring your query plan questions. We will walk through EXPLAIN ANALYZE together.',
    'https://zoom.us/j/94173322187?pwd=sqldemo', 0, 0, nowIso(), nowIso());
  insertSession.run(uuid(), chen, ava, pySkill, mk(3, 17, 30), 90, 'Accepted',
    'Gradient descent intuition session. Bring a laptop.',
    'https://zoom.us/j/94173390112?pwd=pydemo', 0, 0, nowIso(), nowIso());
  insertSession.run(uuid(), jonas, ava, embSkill, mk(1, 18, 0), 60, 'Pending',
    'I can show you bare-metal timers and interrupts if you bring SQL practice.',
    null, 0, 0, nowIso(), nowIso());
  insertSession.run(uuid(), sara, ava, paintSkill, mk(2, 15, 0), 45, 'Pending',
    'Watercolor basics. Brushes and paper provided at the studio.',
    null, 0, 0, nowIso(), nowIso());
  insertSession.run(uuid(), ava, chen, pySkill, mk(-6, 18, 0), 60, 'Completed',
    'First Python AI session — tensors and autograd.',
    'https://zoom.us/j/94122210009?pwd=done1', 1, 1, nowIso(), nowIso());
  insertSession.run(uuid(), hannah, ava, uiSkill, mk(-13, 16, 30), 75, 'Completed',
    'Figma variables and auto-layout critique of my portfolio.',
    null, 1, 1, nowIso(), nowIso());
  insertSession.run(uuid(), ava, mateo, speakSkill, mk(-20, 10, 0), 30, 'Declined',
    'Reschedule after finals?', null, 0, 0, nowIso(), nowIso());
  const javaSkill = skillIdByName.get('Java OOP')!;
  insertSession.run(uuid(), ava, mateo, javaSkill, mk(-9, 18, 0), 60, 'Completed',
    'OOP crash course: classes, inheritance, interfaces.',
    null, 1, 1, nowIso(), nowIso());
  insertSession.run(uuid(), ava, idByUsername.get('priya.stats')!, javaSkill, mk(-15, 19, 0), 90, 'Completed',
    'Java collections and streams for interview prep.',
    null, 1, 1, nowIso(), nowIso());

  // --- Connection requests to ava ---
  const insertRequest = db.prepare('INSERT INTO connection_requests (id, from_id, to_id, skill, message, status, created_at) VALUES (?,?,?,?,?,?,?)');
  insertRequest.run(uuid(), mateo, ava, 'SQL Database', 'Saw your SQL pills — pairwise trade for rhetoric practice?', 'Pending', nowIso());
  insertRequest.run(uuid(), idByUsername.get('lila.writes')!, ava, 'UI Design', 'Would love feedback on my newsletter layout.', 'Pending', nowIso());
  insertRequest.run(uuid(), idByUsername.get('priya.stats')!, ava, 'Java OOP', 'Need a Java crash course before interviews.', 'Pending', nowIso());
  insertRequest.run(uuid(), ava, chen, 'Python AI', 'I will teach SQL in exchange.', 'Accepted', nowIso());

  // --- Notifications ---
  const insertNotif = db.prepare('INSERT INTO notifications (id, user_id, title, body, kind, read, created_at) VALUES (?,?,?,?,?,?,?)');
  insertNotif.run(uuid(), ava, 'New connection request', 'Mateo Alvarez wants to connect over SQL Database.', 'request', 0, nowIso());
  insertNotif.run(uuid(), ava, 'New connection request', 'Lila Haddad wants to connect over UI Design.', 'request', 0, nowIso());
  insertNotif.run(uuid(), ava, 'New connection request', 'Priya Natarajan wants to connect over Java OOP.', 'request', 0, nowIso());
  insertNotif.run(uuid(), ava, 'Session tomorrow', 'SQL Database with Diego Ramírez at 09:00.', 'reminder', 1, nowIso());

  // --- Resource library (curated, public links) ---
  const RESOURCES: Array<[string, string, string, string, string, 'guide'|'video'|'course'|'exercise']> = [
    ['Java OOP — Oracle Learning Path', 'Oracle', 'https://docs.oracle.com/en/java/javase/21/tutorial/java/concepts/object.html', 'Java OOP', 'Tech', 'guide'],
    ['SQLBolt interactive SQL lessons', 'SQLBolt', 'https://sqlbolt.com/', 'SQL Database', 'Tech', 'exercise'],
    ['Khan Academy — Intro to SQL', 'Khan Academy', 'https://www.khanacademy.org/computing/computer-programming/sql', 'SQL Database', 'Tech', 'course'],
    ['fast.ai — Practical Deep Learning', 'fast.ai', 'https://course.fast.ai/', 'Python AI', 'Tech', 'course'],
    ['3Blue1Brown — Neural networks', 'YouTube', 'https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi', 'ML Fundamentals', 'Tech', 'video'],
    ['MIT OCW 6.006 Introduction to Algorithms', 'MIT OpenCourseWare', 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/', 'Algorithms', 'Tech', 'course'],
    ['CS50 — C programming', 'Harvard', 'https://cs50.harvard.edu/x/', 'C Programming', 'Tech', 'course'],
    ['MDN — JavaScript foundations', 'MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', 'Web Development', 'Tech', 'guide'],
    ['Figma — Auto layout tutorial', 'Figma', 'https://www.figma.com/resources/learn-design/auto-layout/', 'Figma Prototyping', 'Design', 'video'],
    ['NNGroup — Usability heuristics', 'Nielsen Norman Group', 'https://www.nngroup.com/articles/ten-usability-heuristics/', 'UI Design', 'Design', 'guide'],
    ['SketchUp Campus — free courses', 'SketchUp', 'https://learn.sketchup.com/', 'SketchUp 3D', 'Design', 'course'],
    ['Khan Academy — Drawing', 'Khan Academy', 'https://www.khanacademy.org/partner-content/pixar/drawing', 'Drawing', 'Arts', 'course'],
    ['MusicTheory.net — lessons', 'musictheory.net', 'https://www.musictheory.net/lessons', 'Music Theory', 'Arts', 'exercise'],
    ['Coursera — Public speaking (rotation)', 'Coursera', 'https://www.coursera.org/learn/public-speaking', 'Public Speaking', 'Business', 'course'],
    ['Toastmasters — how meetings work', 'Toastmasters', 'https://www.toastmasters.org/about/meeting-format', 'Public Speaking', 'Business', 'guide'],
    ['Goethe-Institut — German A1 resources', 'Goethe-Institut', 'https://www.goethe.de/en/spr/ueb.html', 'German', 'Languages', 'course'],
    ['BBC Languages — Spanish', 'BBC', 'https://www.bbc.co.uk/languages/spanish/', 'Spanish', 'Languages', 'course'],
    ['Investopedia — Microeconomics basics', 'Investopedia', 'https://www.investopedia.com/terms/m/microeconomics.asp', 'Microeconomics', 'Business', 'guide'],
    ['Khan Academy — Statistics', 'Khan Academy', 'https://www.khanacademy.org/math/statistics-probability', 'Data Analysis', 'Tech', 'course'],
  ];
  const insertResource = db.prepare('INSERT OR IGNORE INTO resources (id, title, provider, url, skill, category, kind) VALUES (?,?,?,?,?,?,?)');
  for (const [title, provider, url, skill, category, kind] of RESOURCES) {
    insertResource.run(uuid(), title, provider, url, skill, category, kind);
  }

  // --- Admin metrics: 30-day plausible series ---
  const rand = lcg(1337);
  const chartSkills = ['Java OOP', 'Python AI', 'SQL Database', 'UI Design', 'Public Speaking'];
  const insertMetric = db.prepare('INSERT OR REPLACE INTO admin_metrics (day, skill, matches, sessions) VALUES (?,?,?,?)');
  for (const skill of chartSkills) {
    let matches = 18 + Math.floor(rand() * 20);
    let sessions = 6 + Math.floor(rand() * 8);
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const day = d.toISOString().slice(0, 10);
      matches = Math.max(4, Math.min(60, Math.round(matches + (rand() - 0.45) * 9)));
      sessions = Math.max(2, Math.min(24, Math.round(sessions + (rand() - 0.45) * 4)));
      insertMetric.run(day, skill, matches, sessions);
    }
  }

  console.log(`[seed] complete: ${STUDENTS.length} students + 1 admin (demo accounts), ${SKILLS.length} skills, 0 reviews`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const force = process.argv.includes('--force');
  if (force) console.log('[seed] --force: wiping and reseeding');
  seedIfEmpty(force);
}
