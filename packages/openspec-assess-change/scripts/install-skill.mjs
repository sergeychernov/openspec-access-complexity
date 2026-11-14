#!/usr/bin/env node
// Connects this package as an agent skill in a project for Codex, Claude Code and Antigravity, and
// checks that every client location resolves to the same SKILL.md digest and version identity.
//
//   node scripts/install-skill.mjs --project <dir> [--clients codex,claude-code,antigravity] [--mode copy|symlink] [--force]
// Default --mode copy: Antigravity (agy 1.5.9) does not discover a symlinked skill folder; Codex and
// Claude Code follow symlinks. A copy keeps the same SKILL.md digest and version identity (checked).
//   node scripts/install-skill.mjs --project <dir> --check
//
// Locations (see references/clients.md):
//   codex, antigravity → <project>/.agents/skills/openspec-assess-change
//   claude-code        → <project>/.claude/skills/openspec-assess-change → ../../.agents/skills/openspec-assess-change
import {
  existsSync, mkdirSync, symlinkSync, readFileSync, cpSync, lstatSync, readlinkSync, realpathSync, rmSync,
} from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const PKG = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const NAME = 'openspec-assess-change';
const CLIENTS = {
  codex: ['.agents', 'skills'],
  antigravity: ['.agents', 'skills'],
  'claude-code': ['.claude', 'skills'],
};
const COPY_ITEMS = ['SKILL.md', 'README.md', 'package.json', 'bin', 'src', 'schemas', 'config', 'configurator', 'references', 'examples', 'scripts'];

function parse(argv) {
  const o = { clients: Object.keys(CLIENTS), mode: 'copy', force: false, check: false, project: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') o.force = true;
    else if (a === '--check') o.check = true;
    else if (a === '--project') o.project = realpathSync(resolve(argv[++i]));
    else if (a === '--clients') o.clients = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--mode') o.mode = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.project) throw new Error('--project <dir> is required');
  for (const c of o.clients) if (!CLIENTS[c]) throw new Error(`unknown client ${c} (codex, claude-code, antigravity)`);
  if (!['symlink', 'copy'].includes(o.mode)) throw new Error('--mode must be symlink or copy');
  return o;
}

const sha = (buf) => `sha256:${createHash('sha256').update(buf).digest('hex')}`;
const skillPath = (project, client) => join(project, ...CLIENTS[client], NAME);
const exists = (p) => { try { lstatSync(p); return true; } catch { return false; } };

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text.replace(/\r\n/g, '\n'));
  if (!m) return null;
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-zA-Z_-]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^"|"$/g, '');
  }
  return out;
}

export function install({ project, clients, mode, force }) {
  const done = [];
  const shared = join(project, '.agents', 'skills', NAME);
  const needShared = clients.some((c) => c === 'codex' || c === 'antigravity' || c === 'claude-code');
  if (needShared) {
    if (exists(shared)) {
      const same = lstatSync(shared).isSymbolicLink() ? realpathSync(shared) === realpathSync(PKG) : false;
      if (!same && !force) {
        const sameSkill = existsSync(join(shared, 'SKILL.md')) && sha(readFileSync(join(shared, 'SKILL.md'))) === sha(readFileSync(join(PKG, 'SKILL.md')));
        if (!sameSkill) throw new Error(`${relative(project, shared)} exists with different content; pass --force to replace it`);
      }
      if (force) rmSync(shared, { recursive: true, force: true });
    }
    if (!exists(shared)) {
      mkdirSync(dirname(shared), { recursive: true });
      if (mode === 'symlink') symlinkSync(relative(dirname(shared), PKG), shared, process.platform === 'win32' ? 'junction' : 'dir');
      else for (const item of COPY_ITEMS) if (existsSync(join(PKG, item))) cpSync(join(PKG, item), join(shared, item), { recursive: true });
      done.push(`${relative(project, shared)} (${mode})`);
    }
  }
  if (clients.includes('claude-code')) {
    const link = skillPath(project, 'claude-code');
    const target = relative(dirname(link), shared);
    if (exists(link)) {
      const ok = lstatSync(link).isSymbolicLink() && readlinkSync(link) === target;
      if (!ok && !force) throw new Error(`${relative(project, link)} exists; pass --force to replace it`);
      if (!ok) rmSync(link, { recursive: true, force: true });
    }
    if (!exists(link)) {
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
      done.push(`${relative(project, link)} → ${target}`);
    }
  }
  return done;
}

export function check({ project, clients }) {
  const rows = [];
  for (const client of clients) {
    const dir = skillPath(project, client);
    const row = { client, location: relative(project, dir), ok: false };
    if (!existsSync(join(dir, 'SKILL.md'))) { row.problem = 'SKILL.md not found'; rows.push(row); continue; }
    const text = readFileSync(join(dir, 'SKILL.md'));
    const fm = frontmatter(text.toString('utf8'));
    if (!fm || fm.name !== NAME || !fm.description) { row.problem = 'frontmatter needs name = folder name and description'; rows.push(row); continue; }
    const r = spawnSync(process.execPath, [join(dir, 'bin', 'openspec-assess.mjs'), 'version', '--json'], { encoding: 'utf8' });
    if (r.status !== 0) { row.problem = `CLI failed: ${r.stderr.trim()}`; rows.push(row); continue; }
    const v = JSON.parse(r.stdout);
    Object.assign(row, { ok: true, skillDigest: sha(text), reportedSkillDigest: v.skillDigest, versionDigest: v.versionDigest, package: v.package });
    if (v.skillDigest !== row.skillDigest) { row.ok = false; row.problem = 'CLI reports a different SKILL.md'; }
    rows.push(row);
  }
  const digests = new Set(rows.filter((r) => r.ok).map((r) => `${r.skillDigest}|${r.versionDigest}`));
  return { rows, consistent: rows.every((r) => r.ok) && digests.size === 1 };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = parse(process.argv.slice(2));
    if (!o.check) {
      const done = install(o);
      process.stdout.write(done.length ? `Installed:\n  ${done.join('\n  ')}\n` : 'Already installed.\n');
    }
    const res = check(o);
    for (const r of res.rows) process.stdout.write(`${r.ok ? 'ok ' : 'ERR'} ${r.client.padEnd(12)} ${r.location}${r.ok ? `  package ${r.package}  SKILL.md ${r.skillDigest.slice(0, 19)}…  version ${r.versionDigest.slice(0, 19)}…` : `  ${r.problem}`}\n`);
    process.stdout.write(res.consistent ? 'All client locations resolve to the same SKILL.md and version identity.\n' : 'Client locations are NOT consistent.\n');
    process.exitCode = res.consistent ? 0 : 1;
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = 2;
  }
}
