// Test fixtures backed by the real OpenSpec CLI and Git (local, offline, no credentials).
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, realpathSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PKG } from './helpers.mjs';

export const BIN = join(PKG, 'bin', 'openspec-assess.mjs');
export const DEMO = join(PKG, 'examples', 'demo-project');
export const CHANGE = 'add-shout-flag';
export const AS_OF = '2026-11-14T12:00:00Z';

export function tmp(prefix = 'osa-') {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

export function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, '-c', 'user.email=test@example.invalid', '-c', 'user.name=test', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

// Copies the demo project into a fresh Git repository and returns its paths.
export function demoProject({ gitInit = true } = {}) {
  const dir = tmp();
  cpSync(DEMO, dir, { recursive: true });
  if (gitInit) {
    git(dir, 'init', '-q');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'init');
  }
  return { dir, changeRoot: join(dir, 'openspec', 'changes', CHANGE) };
}

export function cli(cwd, args, env = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  let json = null;
  if (args.includes('--json')) {
    try { json = JSON.parse(r.stdout); } catch { json = null; }
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

export function sandboxHome() {
  const h = tmp('osa-home-');
  return { HOME: h, USERPROFILE: h, XDG_CONFIG_HOME: join(h, '.config'), XDG_DATA_HOME: join(h, '.local', 'share'), APPDATA: join(h, 'AppData', 'Roaming'), LOCALAPPDATA: join(h, 'AppData', 'Local') };
}

// Pins and assesses the demo change; returns the CLI JSON of assess.
export function assessDemo(project, extra = []) {
  const p = cli(project.dir, ['pin-evidence', '--change', CHANGE, '--json']);
  if (p.code !== 0) throw new Error(`pin failed: ${p.stdout}${p.stderr}`);
  const a = cli(project.dir, ['assess', '--change', CHANGE, '--as-of', AS_OF, '--json', ...extra]);
  if (a.code !== 0) throw new Error(`assess failed: ${a.stdout}${a.stderr}`);
  return a.json;
}

// Digest of every file under dir (relative path → sha256), for "nothing changed" assertions.
export function treeDigest(dir) {
  const out = {};
  const walk = (d, rel) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      const r = rel ? `${rel}/${n}` : n;
      if (statSync(p).isDirectory()) walk(p, r);
      else out[r] = createHash('sha256').update(readFileSync(p)).digest('hex');
    }
  };
  walk(dir, '');
  return out;
}

export function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function writeJson(p, v) {
  writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
}
