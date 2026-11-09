import './env';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { db } from './db';

type Cat = 'Tech' | 'Arts' | 'Languages' | 'Business' | 'Design';

const SKILLS: Array<{ name: string; category: Cat }> = [
  { name: 'Java OOP', category: 'Tech' },
  { name: 'Python AI', category: 'Tech' },
  { name: 'SQL Database', category: 'Tech' },
  { name: 'C Programming', category: 'Tech' },
  { name: 'Embedded Systems', category: 'Tech' },
  { name: 'ML Fundamentals', category: 'Tech' },
  { name: 'Data Analysis', category: 'Tech' },
  { name: 'Algorithms', category: 'Tech' },
  { name: 'Web Development', category: 'Tech' },
  { name: 'Git & DevOps', category: 'Tech' },
  { name: 'Linux Systems', category: 'Tech' },
  { name: 'Cloud Basics', category: 'Tech' },
  { name: 'Networking', category: 'Tech' },
  { name: 'Cybersecurity Basics', category: 'Tech' },
  { name: 'Painting', category: 'Arts' },
  { name: 'Guitar', category: 'Arts' },
  { name: 'Music Theory', category: 'Arts' },
  { name: 'Photography', category: 'Arts' },
  { name: 'Video Editing', category: 'Arts' },
  { name: 'Creative Writing', category: 'Arts' },
  { name: 'Art History', category: 'Arts' },
  { name: 'Drawing', category: 'Arts' },
  { name: 'Acting', category: 'Arts' },
  { name: 'Ceramics', category: 'Arts' },
  { name: 'Spanish', category: 'Languages' },
  { name: 'French', category: 'Languages' },
  { name: 'German', category: 'Languages' },
  { name: 'Czech', category: 'Languages' },
  { name: 'Mandarin', category: 'Languages' },
  { name: 'Arabic', category: 'Languages' },
  { name: 'Japanese', category: 'Languages' },
  { name: 'Microeconomics', category: 'Business' },
  { name: 'Excel Modeling', category: 'Business' },
  { name: 'Business Strategy', category: 'Business' },
  { name: 'Marketing 101', category: 'Business' },
  { name: 'Public Speaking', category: 'Business' },
  { name: 'Technical Writing', category: 'Business' },
  { name: 'Negotiation', category: 'Business' },
  { name: 'Project Management', category: 'Business' },
  { name: 'UI Design', category: 'Design' },
  { name: 'Figma Prototyping', category: 'Design' },
  { name: 'Web Design', category: 'Design' },
  { name: 'SketchUp 3D', category: 'Design' },
  { name: 'Architectural Drawing', category: 'Design' },
  { name: 'Illustration', category: 'Design' },
  { name: 'Motion Graphics', category: 'Design' },
];

const RESOURCES: Array<{ title: string; provider: string; url: string; skill: string; category: Cat; kind: 'guide' | 'video' | 'course' | 'exercise' }> = [
  { title: 'Java OOP — Oracle Learning Path', provider: 'Oracle', url: 'https://docs.oracle.com/en/java/javase/21/tutorial/java/concepts/object.html', skill: 'Java OOP', category: 'Tech', kind: 'guide' },
  { title: 'SQLBolt interactive SQL lessons', provider: 'SQLBolt', url: 'https://sqlbolt.com/', skill: 'SQL Database', category: 'Tech', kind: 'exercise' },
  { title: 'Khan Academy — Intro to SQL', provider: 'Khan Academy', url: 'https://www.khanacademy.org/computing/computer-programming/sql', skill: 'SQL Database', category: 'Tech', kind: 'course' },
  { title: 'fast.ai — Practical Deep Learning', provider: 'fast.ai', url: 'https://course.fast.ai/', skill: 'Python AI', category: 'Tech', kind: 'course' },
  { title: '3Blue1Brown — Neural networks', provider: 'YouTube', url: 'https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi', skill: 'ML Fundamentals', category: 'Tech', kind: 'video' },
  { title: 'MIT OCW 6.006 Introduction to Algorithms', provider: 'MIT OpenCourseWare', url: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/', skill: 'Algorithms', category: 'Tech', kind: 'course' },
  { title: 'CS50 — C programming', provider: 'Harvard', url: 'https://cs50.harvard.edu/x/', skill: 'C Programming', category: 'Tech', kind: 'course' },
  { title: 'MDN — JavaScript foundations', provider: 'MDN', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', skill: 'Web Development', category: 'Tech', kind: 'guide' },
  { title: 'Figma — Auto layout tutorial', provider: 'Figma', url: 'https://www.figma.com/resources/learn-design/auto-layout/', skill: 'Figma Prototyping', category: 'Design', kind: 'video' },
  { title: 'NNGroup — Usability heuristics', provider: 'Nielsen Norman Group', url: 'https://www.nngroup.com/articles/ten-usability-heuristics/', skill: 'UI Design', category: 'Design', kind: 'guide' },
  { title: 'SketchUp Campus — free courses', provider: 'SketchUp', url: 'https://learn.sketchup.com/', skill: 'SketchUp 3D', category: 'Design', kind: 'course' },
  { title: 'Khan Academy — Drawing', provider: 'Khan Academy', url: 'https://www.khanacademy.org/partner-content/pixar/drawing', skill: 'Drawing', category: 'Arts', kind: 'course' },
  { title: 'MusicTheory.net — lessons', provider: 'musictheory.net', url: 'https://www.musictheory.net/lessons', skill: 'Music Theory', category: 'Arts', kind: 'exercise' },
  { title: 'Coursera — Public speaking (rotation)', provider: 'Coursera', url: 'https://www.coursera.org/learn/public-speaking', skill: 'Public Speaking', category: 'Business', kind: 'course' },
  { title: 'Toastmasters — how meetings work', provider: 'Toastmasters', url: 'https://www.toastmasters.org/about/meeting-format', skill: 'Public Speaking', category: 'Business', kind: 'guide' },
  { title: 'Goethe-Institut — German A1 resources', provider: 'Goethe-Institut', url: 'https://www.goethe.de/en/spr/ueb.html', skill: 'German', category: 'Languages', kind: 'course' },
  { title: 'BBC Languages — Spanish', provider: 'BBC', url: 'https://www.bbc.co.uk/languages/spanish/', skill: 'Spanish', category: 'Languages', kind: 'course' },
  { title: 'Investopedia — Microeconomics basics', provider: 'Investopedia', url: 'https://www.investopedia.com/terms/m/microeconomics.asp', skill: 'Microeconomics', category: 'Business', kind: 'guide' },
  { title: 'Khan Academy — Statistics', provider: 'Khan Academy', url: 'https://www.khanacademy.org/math/statistics-probability', skill: 'Data Analysis', category: 'Tech', kind: 'course' },
];

/**
 * Seeds ONLY the skill catalog and static learning resources (never creates demo users,
 * sessions, reviews, notifications or synthetic metrics).
 */
export function seedIfEmpty(force = false): boolean {
  const tx = db.transaction(() => {
    if (force) {
      db.exec('DELETE FROM skills WHERE id NOT IN (SELECT DISTINCT skill_id FROM sessions)');
      db.exec('DELETE FROM resources');
    }

    const insertSkill = db.prepare('INSERT OR IGNORE INTO skills (id, name, category) VALUES (?,?,?)');
    let inserted = 0;
    for (const sk of SKILLS) {
      const res = insertSkill.run(randomUUID(), sk.name, sk.category);
      inserted += res.changes;
    }

    const resourceCount = db.prepare('SELECT COUNT(*) AS n FROM resources').get() as { n: number };
    if (resourceCount.n === 0) {
      const insertResource = db.prepare('INSERT OR IGNORE INTO resources (id, title, provider, url, skill, category, kind) VALUES (?,?,?,?,?,?,?)');
      for (const r of RESOURCES) {
        insertResource.run(randomUUID(), r.title, r.provider, r.url, r.skill, r.category, r.kind);
      }
    }

    return inserted > 0;
  });

  const seeded = tx();
  bootstrapAdminIfNeeded();
  return seeded;
}

export function bootstrapAdminIfNeeded(): void {
  const adminCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number };
  if (adminCount.n > 0) return;

  const rawEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? '';
  const rawPassword = process.env.ADMIN_INITIAL_PASSWORD ?? '';
  if (!rawEmail || !rawPassword) {
    console.log(
      '[bootstrap] No administrator account exists in the database. ' +
      'To bootstrap the first admin, set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD in .env and restart.',
    );
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail) || rawPassword.length < 8) {
    console.error('[bootstrap] Invalid ADMIN_EMAIL or ADMIN_INITIAL_PASSWORD (<8 chars); skipping admin bootstrap.');
    return;
  }

  const hash = bcrypt.hashSync(rawPassword, 10);
  const id = randomUUID();
  const localPart = (rawEmail.split('@')[0] ?? 'admin').replace(/[^a-z0-9._-]/g, '').slice(0, 24) || 'admin';
  const username = `${localPart}-${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO users (id, name, email, username, password_hash, role, email_verified, must_change_password, status, demo)
    VALUES (?,?,?,?,?, 'admin', 1, 1, 'offline', 0)
  `).run(id, 'Platform Administrator', rawEmail, username, hash);
  console.log(`[bootstrap] Created initial admin account for ${rawEmail} (mustChangePassword=true)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force');
  seedIfEmpty(force);
}
