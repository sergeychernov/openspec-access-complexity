#!/usr/bin/env node
// Portable test runner: lists test files itself (no shell globbing, works on Windows and every
// supported Node version) and runs them with the built-in node:test runner.
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const suite = process.argv[2] || 'unit';
const dirs = { unit: ['test'], integration: ['test/integration'], all: ['test', 'test/integration'] }[suite];
if (!dirs) {
  console.error(`unknown suite "${suite}" (unit | integration | all)`);
  process.exit(2);
}
const files = dirs.flatMap((d) => readdirSync(join(root, d)).filter((n) => n.endsWith('.test.mjs')).sort().map((n) => join(d, n)));
const r = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
