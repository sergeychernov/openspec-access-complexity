// Integration with the real, pinned OpenSpec CLI: archive moves the whole assessment with the change,
// digests survive, and replay works from the archive. Offline; needs Git and the OpenSpec CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runExample, compareGolden } from '../../examples/run-example.mjs';
import {
  demoProject, cli, CHANGE, AS_OF, assessDemo, git, treeDigest, readJson, writeJson,
} from '../project.mjs';
import { PKG } from '../helpers.mjs';

const OPENSPEC = process.env.OPENSPEC_BIN || 'openspec';
const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));

test('the installed OpenSpec CLI is the pinned, tested version', () => {
  const r = spawnSync(OPENSPEC, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
  assert.equal(r.status, 0, 'OpenSpec CLI must be installed for the integration suite (it is not skipped)');
  assert.equal(r.stdout.trim(), pkg.openspecAssess.openspecCli.tested);
});

test('public example reproduces the golden result through archive and replay', () => {
  const result = runExample();
  assert.deepEqual(compareGolden(result.files), []);
});

test('archive keeps profile.json, planning and verification runs, digests and replay', () => {
  const p = demoProject();
  const planning = assessDemo(p);
  const base = git(p.dir, 'rev-parse', 'HEAD');
  writeFileSync(join(p.dir, 'src', 'greet.mjs'), readFileSync(join(p.dir, 'src', 'greet.mjs'), 'utf8').replace('return `Hello, ${name}!`;', 'const t = `Hello, ${name}!`;\n  return shout ? t.toUpperCase() : t;').replace('greet(name)', 'greet(name, { shout = false } = {})'));
  const prof = readJson(join(p.changeRoot, 'assessment', 'profile.json'));
  prof.stage = 'verification';
  prof.previousAssessmentId = planning.assessmentId;
  prof.evidence = prof.evidence.filter((e) => e.id !== 'docs-usage' && e.id !== 'src-greet').map(({ digest, ...e }) => e);
  prof.evidence.push({ id: 'diff', kind: 'diff', revision: base, note: 'implementation diff' });
  prof.quantities.files = { state: 'known', kind: 'measured', min: 1, max: 1, rationale: 'git diff --numstat', evidence: ['diff'] };
  prof.factors.logic.evidence = ['design'];
  writeJson(join(p.changeRoot, 'assessment', 'profile.json'), prof);
  const ver = assessDemo(p);
  const before = treeDigest(join(p.changeRoot, 'assessment'));
  const tasks = join(p.changeRoot, 'tasks.md');
  writeFileSync(tasks, readFileSync(tasks, 'utf8').replace(/- \[ \]/g, '- [x]'));
  const r = spawnSync(OPENSPEC, ['archive', CHANGE, '--yes', '--json'], { cwd: p.dir, encoding: 'utf8', shell: process.platform === 'win32' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const archiveRoot = JSON.parse(r.stdout).archive.path;
  assert.ok(!existsSync(p.changeRoot), 'the active change moved');
  const after = treeDigest(join(archiveRoot, 'assessment'));
  assert.deepEqual(after, before, 'every assessment file is carried with identical bytes');
  assert.deepEqual(readdirSync(join(archiveRoot, 'assessment', 'runs')).sort(), [planning.assessmentId, ver.assessmentId].sort());
  for (const id of [planning.assessmentId, ver.assessmentId]) {
    const rr = cli(p.dir, ['replay', join(archiveRoot, 'assessment'), '--run', id, '--json']);
    assert.equal(rr.code, 0, rr.stdout + rr.stderr);
    assert.equal(rr.json.reproduced, true);
  }
  assert.deepEqual(treeDigest(join(archiveRoot, 'assessment')), before, 'replay does not modify the archive');
  assert.ok(AS_OF);
});
