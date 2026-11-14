import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { install, check } from '../scripts/install-skill.mjs';
import { PKG } from './helpers.mjs';
import { tmp } from './project.mjs';

const skill = readFileSync(join(PKG, 'SKILL.md'), 'utf8');

test('8.1 SKILL.md frontmatter: name equals the folder, description says when to use it', () => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(skill);
  assert.ok(m, 'frontmatter starts on the first line');
  const fm = Object.fromEntries(m[1].split('\n').map((l) => /^([a-z-]+):\s*(.*)$/.exec(l)).filter(Boolean).map((x) => [x[1], x[2]]));
  assert.equal(fm.name, 'openspec-assess-change');
  assert.ok(fm.description.length > 80 && fm.description.length < 1024);
  assert.match(fm.description, /after propose/i);
  assert.match(fm.description, /before verify/i);
});

test('8.1 every relative link in SKILL.md and references resolves', () => {
  const docs = [join(PKG, 'SKILL.md'), join(PKG, 'README.md'), ...readdirSync(join(PKG, 'references')).map((n) => join(PKG, 'references', n))];
  for (const doc of docs) {
    const text = readFileSync(doc, 'utf8');
    for (const [, target] of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^https?:/.test(target)) continue;
      assert.ok(existsSync(join(dirname(doc), target)), `${doc}: ${target}`);
    }
  }
});

test('8.1 the skill never starts implementation, switches models or accepts the change', () => {
  assert.match(skill, /never switches models or starts apply\/verify/);
  assert.match(skill, /You never switch models, start apply\/verify, tick tasks or archive/);
  assert.doesNotMatch(skill, /\/model |--model |openspec archive|openspec-apply-change|- \[x\]/);
  assert.match(skill, /does not patch the generated OpenSpec skills/);
});

test('8.2 one package is discovered at the same version and digest in all three client locations', () => {
  const project = tmp('osa-proj-');
  const done = install({ project, clients: ['codex', 'claude-code', 'antigravity'], mode: 'symlink', force: false });
  assert.equal(done.length, 2);
  const res = check({ project, clients: ['codex', 'claude-code', 'antigravity'] });
  assert.equal(res.consistent, true, JSON.stringify(res.rows));
  assert.equal(new Set(res.rows.map((r) => r.skillDigest)).size, 1);
  assert.deepEqual(install({ project, clients: ['codex', 'claude-code', 'antigravity'], mode: 'symlink', force: false }), [], 'idempotent');
  const copy = tmp('osa-proj-');
  install({ project: copy, clients: ['codex', 'claude-code', 'antigravity'], mode: 'copy', force: false });
  const res2 = check({ project: copy, clients: ['codex', 'claude-code', 'antigravity'] });
  assert.equal(res2.consistent, true);
  assert.equal(res2.rows[0].versionDigest, res.rows[0].versionDigest);
});
