import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, readFileSync, writeFileSync, rmSync, symlinkSync, mkdirSync, readdirSync, renameSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveChange, AssessError, loadEffectiveConfig, createRun, planningArtifactPaths, verifyRun, replayRun, assessmentIdOf, sha256, canonicalBytes, canonicalDigest, readLatest, evidenceErrors, gitToplevel } from '../src/node/index.mjs';
import { versionIdentity } from '../src/core/index.mjs';
import {
  demoProject, cli, CHANGE, AS_OF, tmp, git, assessDemo, sandboxHome, treeDigest, readJson, writeJson, DEMO,
} from './project.mjs';

const profileFile = (p) => join(p.changeRoot, 'assessment', 'profile.json');
const latestFile = (p) => join(p.changeRoot, 'assessment', 'latest.json');

// ------------------------------------------------------------------ 2.1 evidence checks
test('2.1 validate-profile reports missing digests, then passes after pin-evidence', () => {
  const p = demoProject();
  const v = cli(p.dir, ['validate-profile', '--change', CHANGE, '--json']);
  assert.equal(v.code, 1);
  assert.ok(v.json.errors.some((e) => /requires a digest/.test(e.message)));
  assert.equal(cli(p.dir, ['pin-evidence', '--change', CHANGE]).code, 0);
  const ok = cli(p.dir, ['validate-profile', '--change', CHANGE, '--json']);
  assert.equal(ok.code, 0, ok.stdout);
  assert.equal(ok.json.valid, true);
});

test('2.1 missing evidence file, missing task locator and changed source are rejected with field paths', () => {
  const p = demoProject();
  cli(p.dir, ['pin-evidence', '--change', CHANGE]);
  const prof = readJson(profileFile(p));
  writeFileSync(join(p.dir, 'src', 'greet.mjs'), '// changed\n');
  prof.evidence.find((e) => e.id === 'task-1-2').locator = '9.9';
  writeJson(profileFile(p), prof);
  rmSync(join(p.dir, 'test', 'greet.test.mjs'));
  const v = cli(p.dir, ['validate-profile', '--change', CHANGE, '--json']);
  assert.equal(v.code, 1);
  const msgs = v.json.errors.map((e) => `${e.path} ${e.message}`).join('\n');
  assert.match(msgs, /\/evidence\/7\/digest src-greet: source changed since it was pinned/);
  assert.match(msgs, /task-1-2: task "9\.9" is not found in tasks\.md/);
  assert.match(msgs, /test-greet: file does not exist/);
});

test('2.1 a planned new file must not exist yet and is never pinned', () => {
  const p = demoProject();
  const pin = cli(p.dir, ['pin-evidence', '--change', CHANGE, '--json']);
  assert.ok(!pin.json.pinned.includes('docs-usage'));
  assert.equal(readJson(profileFile(p)).evidence.find((e) => e.id === 'docs-usage').digest, undefined);
  mkdirSync(join(p.dir, 'docs'));
  writeFileSync(join(p.dir, 'docs', 'usage.md'), '# Usage\n');
  const v = cli(p.dir, ['validate-profile', '--change', CHANGE, '--json']);
  assert.ok(v.json.errors.some((e) => /docs-usage: planned file already exists/.test(e.message)));
});

test('2.1 ticking tasks does not invalidate pinned tasks.md evidence; editing task text does', () => {
  const p = demoProject();
  cli(p.dir, ['pin-evidence', '--change', CHANGE]);
  const tasks = join(p.changeRoot, 'tasks.md');
  writeFileSync(tasks, readFileSync(tasks, 'utf8').replace('- [ ] 1.1', '- [x] 1.1'));
  assert.equal(cli(p.dir, ['validate-profile', '--change', CHANGE]).code, 0);
  writeFileSync(tasks, readFileSync(tasks, 'utf8').replace('Add the `shout` option', 'Add a `loud` option'));
  assert.equal(cli(p.dir, ['validate-profile', '--change', CHANGE]).code, 1);
});

// ------------------------------------------------------------------ 2.3 verification profile
function verificationProfile(p, previousAssessmentId) {
  const base = git(p.dir, 'rev-parse', 'HEAD');
  writeFileSync(join(p.dir, 'src', 'greet.mjs'), readFileSync(join(p.dir, 'src', 'greet.mjs'), 'utf8').replace('export function greet(name) {\n  return `Hello, ${name}!`;', 'export function greet(name, { shout = false } = {}) {\n  const text = `Hello, ${name}!`;\n  return shout ? text.toUpperCase() : text;'));
  mkdirSync(join(p.dir, 'docs'));
  writeFileSync(join(p.dir, 'docs', 'usage.md'), '# Usage\n\n`greet(name, { shout: true })` returns the greeting in upper case.\n');
  const prof = readJson(profileFile(p));
  prof.stage = 'verification';
  prof.previousAssessmentId = previousAssessmentId;
  prof.evidence = prof.evidence.map((e) => {
    const { digest, ...rest } = e;
    if (e.id === 'docs-usage') return { id: 'docs-usage', kind: 'file', base: 'repo', path: 'docs/usage.md', note: 'created documentation' };
    return rest;
  });
  prof.evidence.push({ id: 'diff', kind: 'diff', revision: base, note: 'implementation diff against the planning commit' });
  prof.quantities.files = { state: 'known', kind: 'measured', min: 2, max: 2, rationale: 'git diff --numstat plus untracked files', evidence: ['diff'] };
  prof.quantities.diffLines = { state: 'known', kind: 'measured', min: 7, max: 7, rationale: 'git diff --numstat plus untracked line count', evidence: ['diff'] };
  writeJson(profileFile(p), prof);
  return prof;
}

test('2.3 verification profile binds the actual diff, references the planning run and keeps estimate vs measured', () => {
  const p = demoProject();
  const planning = assessDemo(p);
  verificationProfile(p, planning.assessmentId);
  const pin = cli(p.dir, ['pin-evidence', '--change', CHANGE, '--json']);
  assert.ok(pin.json.pinned.includes('diff'), pin.stdout);
  const ver = cli(p.dir, ['assess', '--change', CHANGE, '--as-of', AS_OF, '--json']);
  assert.equal(ver.code, 0, ver.stdout + ver.stderr);
  assert.notEqual(ver.json.assessmentId, planning.assessmentId);
  assert.equal(ver.json.report.change.previousAssessmentId, planning.assessmentId);
  assert.equal(ver.json.report.properties.quantities.files.kind, 'measured');
  const planRun = readJson(join(p.changeRoot, 'assessment', 'runs', planning.assessmentId, 'report.json'));
  assert.equal(planRun.properties.quantities.files.kind, 'estimated', 'the planning snapshot keeps its estimate');
  assert.deepEqual(readLatest(p.changeRoot).history.map((h) => h.stage), ['planning', 'verification']);
  // The diff evidence becomes stale once the implementation changes again.
  writeFileSync(join(p.dir, 'docs', 'usage.md'), '# Usage\n\nchanged\n');
  const f = cli(p.dir, ['check-freshness', '--change', CHANGE, '--json']);
  assert.equal(f.json.status, 'stale');
  assert.ok(f.json.reasons.some((r) => r.kind === 'diff'));
});

test('2.3 verification profile must link the diff and an existing previous run', () => {
  const p = demoProject();
  assessDemo(p);
  const prof = verificationProfile(p, 'f'.repeat(64));
  cli(p.dir, ['pin-evidence', '--change', CHANGE]);
  const a = cli(p.dir, ['assess', '--change', CHANGE, '--json']);
  assert.equal(a.code, 1);
  assert.ok(a.json.errors.some((e) => e.path === '/previousAssessmentId'));
  prof.evidence = prof.evidence.filter((e) => e.kind !== 'diff');
  prof.quantities.files = { state: 'unknown' };
  prof.quantities.diffLines = { state: 'unknown' };
  writeJson(profileFile(p), prof);
  const v = cli(p.dir, ['validate-profile', '--change', CHANGE, '--json']);
  assert.ok(v.json.errors.some((e) => /must link the actual diff/.test(e.message)));
});

// ------------------------------------------------------------------ 6.1 resolution
test('6.1 no OpenSpec root: clear error and no openspec directory is created', () => {
  const dir = tmp();
  const r = cli(dir, ['assess', '--json']);
  assert.equal(r.code, 3);
  assert.equal(r.json.error, 'no-root');
  assert.deepEqual(readdirSync(dir), []);
});

test('6.1 several active changes require a choice; nothing is written', () => {
  const p = demoProject();
  const other = join(p.dir, 'openspec', 'changes', 'second-change');
  mkdirSync(other);
  writeFileSync(join(other, 'proposal.md'), '# Proposal\n\n## Why\n\nx\n');
  const before = treeDigest(p.dir);
  const r = cli(p.dir, ['assess', '--json']);
  assert.equal(r.code, 3);
  assert.equal(r.json.error, 'ambiguous-change');
  assert.deepEqual(r.json.details.changes, ['add-shout-flag', 'second-change']);
  assert.throws(() => resolveChange({ cwd: p.dir }), (e) => e instanceof AssessError && e.code === 'ambiguous-change');
  assert.deepEqual(treeDigest(p.dir), before);
});

test('6.1 external store: results are written in the store changeRoot, not in the current repository', () => {
  const env = sandboxHome();
  const store = demoProject();
  const r = spawnSync(process.env.OPENSPEC_BIN || 'openspec', ['store', 'register', store.dir, '--id', 'demo-store', '--yes', '--json'], { encoding: 'utf8', env: { ...process.env, ...env }, shell: process.platform === 'win32' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const work = tmp();
  git(work, 'init', '-q');
  const pin = cli(work, ['pin-evidence', '--change', CHANGE, '--store', 'demo-store', '--repo-root', store.dir], env);
  assert.equal(pin.code, 0, pin.stdout + pin.stderr);
  const a = cli(work, ['assess', '--change', CHANGE, '--store', 'demo-store', '--repo-root', store.dir, '--as-of', AS_OF, '--json'], env);
  assert.equal(a.code, 0, a.stdout + a.stderr);
  assert.ok(existsSync(join(store.changeRoot, 'assessment', 'runs', a.json.assessmentId, 'manifest.json')));
  assert.deepEqual(readdirSync(work).filter((n) => n !== '.git'), [], 'no competing openspec/ or assessment/ in the working repo');
});

test('6.1 planning readiness: missing tasks blocks assess before anything is written', () => {
  const p = demoProject();
  rmSync(join(p.changeRoot, 'tasks.md'));
  const r = cli(p.dir, ['assess', '--change', CHANGE, '--json']);
  assert.equal(r.code, 3);
  assert.equal(r.json.error, 'not-ready');
  assert.ok(!existsSync(join(p.changeRoot, 'assessment', 'runs')));
});

// ------------------------------------------------------------------ 6.2 layout
test('6.2 profile and all results live inside the change, as Git-friendly text without machine paths', () => {
  const p = demoProject();
  const a = assessDemo(p);
  const run = join(p.changeRoot, 'assessment', 'runs', a.assessmentId);
  assert.deepEqual(readdirSync(run).sort(), ['benchmarks.snapshot.json', 'config.snapshot.json', 'manifest.json', 'profile.json', 'report.json', 'report.md']);
  for (const f of [...readdirSync(run).map((n) => join(run, n)), profileFile(p), latestFile(p)]) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!text.includes(p.dir), `${f} must not contain the absolute machine path`);
    assert.ok(!text.includes('\r'), 'LF line endings');
    assert.ok(text.endsWith('\n'), 'trailing newline');
  }
  const m = readJson(join(run, 'manifest.json'));
  assert.deepEqual(Object.keys(m.sources.artifacts).sort(), ['design.md', 'proposal.md', 'specs/greeting/spec.md', 'tasks.md']);
  assert.equal(m.inputs['profile.json'], sha256(readFileSync(join(run, 'profile.json'))));
  git(p.dir, 'add', '-A');
  assert.match(git(p.dir, 'status', '--porcelain'), /openspec\/changes\/add-shout-flag\/assessment\/runs\//);
});

// ------------------------------------------------------------------ 6.3 completion and atomic latest
test('6.3 same inputs reuse the verified run; history is not duplicated', () => {
  const p = demoProject();
  const a = assessDemo(p);
  const before = treeDigest(join(p.changeRoot, 'assessment'));
  const b = cli(p.dir, ['assess', '--change', CHANGE, '--as-of', AS_OF, '--json']);
  assert.equal(b.json.assessmentId, a.assessmentId);
  assert.equal(b.json.reused, true);
  assert.deepEqual(treeDigest(join(p.changeRoot, 'assessment')), before);
});

test('6.3 changed inputs create a new run and keep the previous one', () => {
  const p = demoProject();
  const a = assessDemo(p);
  const b = cli(p.dir, ['assess', '--change', CHANGE, '--as-of', '2026-11-15T12:00:00Z', '--json']);
  assert.notEqual(b.json.assessmentId, a.assessmentId);
  assert.ok(existsSync(join(p.changeRoot, 'assessment', 'runs', a.assessmentId, 'report.json')));
  assert.equal(readLatest(p.changeRoot).history.length, 2);
});

test('6.3 assessment symlinked outside the change is rejected before any write', () => {
  const p = demoProject();
  cli(p.dir, ['pin-evidence', '--change', CHANGE]);
  const outside = tmp('osa-outside-');
  renameSync(join(p.changeRoot, 'assessment'), join(outside, 'assessment'));
  symlinkSync(join(outside, 'assessment'), join(p.changeRoot, 'assessment'), process.platform === 'win32' ? 'junction' : 'dir');
  const before = treeDigest(outside);
  const r = cli(p.dir, ['assess', '--change', CHANGE, '--json']);
  assert.equal(r.code, 1);
  assert.equal(r.json.error, 'containment');
  assert.deepEqual(treeDigest(outside), before);
});

test('6.3 latest.json symlinked outside the change is rejected', () => {
  const p = demoProject();
  assessDemo(p);
  const outside = tmp('osa-outside-');
  writeFileSync(join(outside, 'victim.json'), '{}\n');
  rmSync(latestFile(p));
  symlinkSync(join(outside, 'victim.json'), latestFile(p));
  const r = cli(p.dir, ['assess', '--change', CHANGE, '--as-of', '2026-11-16T00:00:00Z', '--json']);
  assert.equal(r.json.error, 'containment');
  assert.equal(readFileSync(join(outside, 'victim.json'), 'utf8'), '{}\n');
});

function inProcess(p, fault, asOf) {
  const resolved = resolveChange({ change: CHANGE, cwd: p.dir });
  const ctx = { changeRoot: resolved.changeRoot, repoRoot: gitToplevel(resolved.changeRoot) };
  const configInfo = loadEffectiveConfig({ overridesPath: join(resolved.changeRoot, 'assessment', 'overrides.json') });
  return createRun({ resolved, ctx, profile: readJson(profileFile(p)), configInfo, asOf, artifactPaths: planningArtifactPaths(resolved), fault });
}

test('6.3 interrupted write never becomes latest; the previous run stays readable', () => {
  const p = demoProject();
  const a = assessDemo(p);
  const latestBefore = readFileSync(latestFile(p), 'utf8');
  assert.throws(() => inProcess(p, 'after-temp', '2026-12-01T00:00:00Z'), /injected fault/);
  assert.equal(readFileSync(latestFile(p), 'utf8'), latestBefore);
  assert.deepEqual(readdirSync(join(p.changeRoot, 'assessment', 'runs')), [a.assessmentId], 'unfinished run is not published in runs/');
  assert.ok(readdirSync(join(p.changeRoot, 'assessment')).some((n) => n.startsWith('.tmp-')), 'leftover temp dir is allowed but isolated');
  assert.throws(() => inProcess(p, 'before-latest', '2026-12-02T00:00:00Z'), /injected fault/);
  assert.equal(readFileSync(latestFile(p), 'utf8'), latestBefore);
  assert.equal(replayRun(join(p.changeRoot, 'assessment', 'runs', a.assessmentId)).reproduced, true);
  assert.equal(cli(p.dir, ['check-freshness', '--change', CHANGE]).code, 0, 'latest still points at the previous complete run');
});

test('6.3 invalid inputs leave latest untouched', () => {
  const p = demoProject();
  assessDemo(p);
  const latestBefore = readFileSync(latestFile(p), 'utf8');
  const prof = readJson(profileFile(p));
  prof.factors.logic.level = 7;
  writeJson(profileFile(p), prof);
  const r = cli(p.dir, ['assess', '--change', CHANGE, '--json']);
  assert.equal(r.code, 1);
  assert.equal(readFileSync(latestFile(p), 'utf8'), latestBefore);
});

// ------------------------------------------------------------------ 6.4 freshness
test('6.4 freshness: design change and config change are stale with explicit reasons; history is kept', () => {
  const p = demoProject();
  const a = assessDemo(p);
  assert.equal(cli(p.dir, ['check-freshness', '--change', CHANGE]).code, 0);
  const designText = readFileSync(join(p.changeRoot, 'design.md'), 'utf8');
  writeFileSync(join(p.changeRoot, 'design.md'), `${designText}\n- Also add a CLI flag.\n`);
  const s = cli(p.dir, ['check-freshness', '--change', CHANGE, '--json']);
  assert.equal(s.code, 1);
  assert.ok(s.json.reasons.some((r) => r.kind === 'artifact' && r.path === 'design.md'));
  assert.ok(s.json.reasons.some((r) => r.kind === 'evidence' && r.evidence === 'design'));
  writeFileSync(join(p.changeRoot, 'design.md'), designText);
  assert.equal(cli(p.dir, ['check-freshness', '--change', CHANGE]).code, 0, 'restoring the design makes it fresh again');
  const ovPath = join(p.changeRoot, 'assessment', 'overrides.json');
  const ov = readJson(ovPath);
  ov.set.selection = { api: { timePenalty: { graceMinutes: 30, intervalMinutes: 30, rateBp: 1000 } } };
  writeJson(ovPath, ov);
  const c = cli(p.dir, ['check-freshness', '--change', CHANGE, '--json']);
  assert.deepEqual(c.json.reasons.map((r) => r.kind), ['config', 'config']);
  assert.ok(existsSync(join(p.changeRoot, 'assessment', 'runs', a.assessmentId)));
  const scopeProf = readJson(profileFile(p));
  scopeProf.scope = { mode: 'tasks', taskIds: ['1.1'] };
  writeJson(profileFile(p), scopeProf);
  const sc = cli(p.dir, ['check-freshness', '--change', CHANGE, '--json']);
  assert.ok(sc.json.reasons.some((r) => r.kind === 'profile'));
});

// ------------------------------------------------------------------ 6.5 replay
test('6.5 replay works after the repository changed and does not write anything', () => {
  const p = demoProject();
  const a = assessDemo(p);
  writeFileSync(join(p.dir, 'src', 'greet.mjs'), '// rewritten\n');
  writeFileSync(join(p.changeRoot, 'proposal.md'), '# Proposal\n\nrewritten\n');
  const before = treeDigest(join(p.changeRoot, 'assessment'));
  const r = cli(p.dir, ['replay', join(p.changeRoot, 'assessment'), '--json']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.json.reproduced, true);
  assert.equal(r.json.assessmentId, a.assessmentId);
  assert.match(r.json.note, /does not re-check historical evidence/);
  assert.deepEqual(treeDigest(join(p.changeRoot, 'assessment')), before);
});

test('6.5 corrupted manifest or tampered report is an integrity error, not a recomputation', () => {
  const p = demoProject();
  const a = assessDemo(p);
  const run = join(p.changeRoot, 'assessment', 'runs', a.assessmentId);
  const report = join(run, 'report.md');
  writeFileSync(report, readFileSync(report, 'utf8').replace('Assessment:', 'Assessment (edited):'));
  let r = cli(p.dir, ['replay', run, '--json']);
  assert.equal(r.code, 1);
  assert.equal(r.json.error, 'integrity');
  writeFileSync(report, readFileSync(report, 'utf8').replace('Assessment (edited):', 'Assessment:'));
  assert.equal(cli(p.dir, ['replay', run]).code, 0, 'restored bytes verify again');
  writeFileSync(join(run, 'manifest.json'), '{"kind": "openspec-assess.manifest", "schemaVersion": 1');
  r = cli(p.dir, ['replay', run, '--json']);
  assert.equal(r.code, 1);
  assert.equal(r.json.error, 'integrity');
  assert.match(r.json.message, /not valid JSON/);
});

test('6.5 incompatible evaluator version reports the required release and leaves the snapshot untouched', () => {
  const p = demoProject();
  const a = assessDemo(p);
  const src = join(p.changeRoot, 'assessment', 'runs', a.assessmentId);
  const { manifest, profile, config, benchmarks } = verifyRun(src);
  const version = { ...versionIdentity(), package: '9.0.0', evaluator: versionIdentity().evaluator + 1 };
  const id = assessmentIdOf({ profile, config, benchmarks, version, asOf: manifest.asOf });
  const dir = join(p.changeRoot, 'assessment', 'runs', id);
  mkdirSync(dir);
  for (const f of ['profile.json', 'config.snapshot.json', 'benchmarks.snapshot.json', 'report.json', 'report.md']) writeFileSync(join(dir, f), readFileSync(join(src, f)));
  writeFileSync(join(dir, 'manifest.json'), canonicalBytes({ ...manifest, assessmentId: id, version, versionDigest: canonicalDigest(version) }));
  const before = treeDigest(dir);
  const r = cli(p.dir, ['replay', dir, '--json']);
  assert.equal(r.code, 4);
  assert.equal(r.json.error, 'incompatible');
  assert.match(r.json.message, /Install openspec-assess-change 9\.0\.0/);
  assert.deepEqual(treeDigest(dir), before);
});

test('evidence checks never accept paths that escape the repository via symlinks', () => {
  const p = demoProject();
  const outside = tmp('osa-outside-');
  writeFileSync(join(outside, 'secret.txt'), 'x\n');
  symlinkSync(join(outside, 'secret.txt'), join(p.dir, 'src', 'link.txt'));
  const prof = readJson(profileFile(p));
  prof.evidence.push({ id: 'escape', kind: 'file', base: 'repo', path: 'src/link.txt', note: 'symlink' });
  const { errors } = evidenceErrors(prof, { changeRoot: p.changeRoot, repoRoot: p.dir });
  assert.ok(errors.some((e) => /escape: resolves outside the repo root/.test(e.message)));
  assert.ok(DEMO);
});

test('3.5 a later model version update does not touch earlier snapshots; the new run carries inherited evidence', () => {
  const p = demoProject();
  const a = assessDemo(p);
  const oldRun = join(p.changeRoot, 'assessment', 'runs', a.assessmentId);
  const before = treeDigest(oldRun);
  const ovPath = join(p.changeRoot, 'assessment', 'overrides.json');
  const ov = readJson(ovPath);
  Object.assign(ov.set.models.find((m) => m.id === 'claude-code.opus'), { modelId: 'claude-opus-5-6', displayName: 'Claude Opus 5.6' });
  writeJson(ovPath, ov);
  const f = cli(p.dir, ['check-freshness', '--change', CHANGE, '--json']);
  assert.equal(f.json.status, 'stale');
  const b = cli(p.dir, ['assess', '--change', CHANGE, '--as-of', AS_OF, '--json']);
  assert.equal(b.code, 0, b.stdout + b.stderr);
  assert.notEqual(b.json.assessmentId, a.assessmentId);
  const opus = b.json.report.rankings['apply/api'].candidates.find((c) => c.candidateId === 'claude-code/claude-opus-5-6');
  assert.equal(opus.identityStatus, 'unconfirmed');
  assert.ok(opus.suitability.contributions.every((k) => k.coefficientStatus === 'heuristic' && k.inheritedFrom && k.inheritedFrom.modelId === 'claude-opus-5-5'), 'carried heuristics stay heuristic with their original identity');
  assert.deepEqual(treeDigest(oldRun), before, 'earlier snapshot is byte-identical');
  const r = cli(p.dir, ['replay', join(p.changeRoot, 'assessment'), '--run', a.assessmentId, '--json']);
  assert.equal(r.json.reproduced, true, 'replay uses the old snapshot, not the new config');
});
