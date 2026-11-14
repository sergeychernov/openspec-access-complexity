import test from 'node:test';
import assert from 'node:assert/strict';
import { profileErrors } from '../src/core/index.mjs';
import { mechanicalProfile, criticalProfile, D } from './helpers.mjs';

const has = (errs, path, re) => errs.some((e) => e.path === path && (!re || re.test(e.message)));

test('known factor without rationale or evidence is rejected with the field path', () => {
  const p = mechanicalProfile();
  delete p.factors.logic.rationale;
  delete p.factors.logic.evidence;
  const errs = profileErrors(p);
  assert.ok(has(errs, '/factors/logic/rationale', /required/));
  assert.ok(has(errs, '/factors/logic/evidence', /required/));
});

test('references to unknown evidence are rejected', () => {
  const p = mechanicalProfile();
  p.factors.logic.evidence = ['nope'];
  assert.ok(has(profileErrors(p), '/factors/logic/evidence/0', /unknown evidence id "nope"/));
});

test('existing local evidence must carry a digest; planned files must not', () => {
  const p = mechanicalProfile();
  delete p.evidence[0].digest;
  assert.ok(has(profileErrors(p), '/evidence/0/digest', /requires a digest/));
  const q = mechanicalProfile();
  q.evidence.push({ id: 'new-file', kind: 'file', base: 'repo', path: 'src/new.mjs', planned: true, digest: D('c'), note: 'x' });
  assert.ok(has(profileErrors(q), '/evidence/3/digest', /planned/));
});

test('planned new file must follow from an existing task or requirement', () => {
  const p = mechanicalProfile();
  p.evidence.push({ id: 'new-file', kind: 'file', base: 'repo', path: 'src/new.mjs', planned: true, note: 'created by task 1.1' });
  assert.ok(has(profileErrors(p), '/evidence/3/derivedFrom', /must reference/));
  p.evidence[3].derivedFrom = ['task-1-1'];
  assert.deepEqual(profileErrors(p), []);
  p.factors.architecture = { state: 'known', level: 2, kind: 'measured', rationale: 'new module', evidence: ['new-file'] };
  assert.ok(has(profileErrors(p), '/factors/architecture/kind', /forecast, not measured/));
  p.factors.architecture.kind = 'estimated';
  assert.deepEqual(profileErrors(p), []);
});

test('measured quantities need measurement evidence and exact values', () => {
  const p = mechanicalProfile();
  p.quantities.files = { state: 'known', kind: 'measured', min: 5, max: 8, rationale: 'x', evidence: ['task-1-1'] };
  const errs = profileErrors(p);
  assert.ok(has(errs, '/quantities/files/max', /exact/));
  assert.ok(has(errs, '/quantities/files/evidence', /diff or check-result/));
});

test('estimated range of five to eight files is accepted as estimate', () => {
  const p = mechanicalProfile();
  p.quantities.files = { state: 'known', kind: 'estimated', min: 5, max: 8, rationale: 'design lists modules', evidence: ['task-1-1'] };
  assert.deepEqual(profileErrors(p), []);
});

test('verification profile links the actual diff and the previous assessment', () => {
  const p = criticalProfile();
  p.stage = 'verification';
  assert.ok(has(profileErrors(p), '/evidence', /actual diff/));
  p.evidence.push({ id: 'diff', kind: 'diff', revision: 'main', digest: D('d'), note: 'git diff main' });
  p.previousAssessmentId = 'e'.repeat(64);
  p.quantities.files = { state: 'known', kind: 'measured', min: 2, max: 2, rationale: 'git diff --stat', evidence: ['diff'] };
  assert.deepEqual(profileErrors(p), []);
  const planning = mechanicalProfile();
  planning.previousAssessmentId = 'e'.repeat(64);
  assert.ok(has(profileErrors(planning), '/previousAssessmentId'));
});

test('scope mode and task ids must agree', () => {
  const p = mechanicalProfile();
  p.scope = { mode: 'tasks' };
  assert.ok(has(profileErrors(p), '/scope/taskIds', /required/));
  p.scope = { mode: 'all-tasks', taskIds: ['1.1'] };
  assert.ok(has(profileErrors(p), '/scope/taskIds', /absent/));
});

test('paths escaping the root are rejected', () => {
  const p = mechanicalProfile();
  p.evidence[0].path = '../outside.md';
  assert.ok(has(profileErrors(p), '/evidence/0/path', /pattern/));
  p.evidence[0].path = '/etc/passwd';
  assert.ok(has(profileErrors(p), '/evidence/0/path', /pattern/));
});
