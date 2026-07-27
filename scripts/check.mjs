#!/usr/bin/env node
// Full check for roadmap-be: syntax-check every source file, then run the
// service-level flow tests. Exits non-zero on the first failure.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

function run(label, cmd, args) {
  process.stdout.write(`\n▶ ${label}\n`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`✖ ${label} FAILED`);
    process.exit(r.status || 1);
  }
}

// 1) syntax check
const files = walk('src');
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`✖ Syntax error in ${f}`);
    process.exit(1);
  }
}
console.log(`✓ Syntax OK (${files.length} files)`);

// 2) flow tests
run('Flow tests', process.execPath, ['--test', 'tests/flow/**/*.test.js']);

console.log('\n✅ roadmap-be check passed');
