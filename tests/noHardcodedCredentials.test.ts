import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');

// Assembled from parts so this test file itself never contains literal forbidden strings.
const FORBIDDEN_CREDENTIALS = [
  ['ava', '@', 'skillswap.edu'].join(''),
  ['admin', '@', 'skillswap.edu'].join(''),
  ['student', '1234'].join(''),
  ['admin', '1234'].join(''),
];

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.java',
  '.properties',
  '.xml',
  '.html',
  '.css',
  '.sh',
  '.cmd',
  '.yml',
  '.yaml',
]);

function collectFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'target') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

describe('Zero hardcoded demo credentials guard', () => {
  it('contains no hardcoded demo emails or passwords in src/, server/, docs/, backend/, scripts/, README.md, or .env.example', () => {
    const targets = [
      ...collectFiles(path.join(ROOT, 'src')),
      ...collectFiles(path.join(ROOT, 'server')),
      ...collectFiles(path.join(ROOT, 'docs')),
      ...collectFiles(path.join(ROOT, 'backend', 'src', 'main')),
      ...collectFiles(path.join(ROOT, 'scripts')),
      path.join(ROOT, 'README.md'),
      path.join(ROOT, '.env.example'),
    ].filter((f) => fs.existsSync(f));

    expect(targets.length).toBeGreaterThan(20);

    const violations: string[] = [];
    for (const file of targets) {
      const content = fs.readFileSync(file, 'utf8');
      for (const token of FORBIDDEN_CREDENTIALS) {
        if (content.includes(token)) {
          violations.push(`${path.relative(ROOT, file)} contains forbidden credential "${token}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
