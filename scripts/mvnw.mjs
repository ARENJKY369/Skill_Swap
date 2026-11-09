#!/usr/bin/env node
import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const command = isWin ? 'mvnw.cmd' : './mvnw';
const args = process.argv.slice(2);

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: isWin,
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (!child.killed) {
      child.kill(sig);
    }
  });
}

child.on('error', (err) => {
  console.error(`[mvnw] Failed to launch ${command}:`, err.message);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
