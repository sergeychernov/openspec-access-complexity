// Shared test helpers and fixtures.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { clone } from '../src/core/canonical.mjs';

export const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
export const D = (c) => `sha256:${c.repeat(64)}`;

export function loadJson(rel) {
  return JSON.parse(readFileSync(join(PKG, rel), 'utf8'));
}

export function defaults() {
  return loadJson('config/defaults.json');
}

export function benchmarks() {
  return loadJson('config/benchmarks.json');
}

const known = (level, ev = ['tasks'], kind = 'declared') => ({ state: 'known', level, kind, rationale: `level ${level} per rubric`, evidence: ev });

// Large mechanical change: many files, no new behaviour, no contract crossing.
export function mechanicalProfile() {
  return {
    kind: 'openspec-assess.profile',
    schemaVersion: 1,
    change: { name: 'rename-logger' },
    stage: 'planning',
    scope: { mode: 'all-tasks' },
    evidence: [
      { id: 'proposal', kind: 'artifact', base: 'change', path: 'proposal.md', digest: D('a'), note: 'proposal' },
      { id: 'tasks', kind: 'artifact', base: 'change', path: 'tasks.md', digest: D('b'), note: 'tasks' },
      { id: 'task-1-1', kind: 'task', base: 'change', path: 'tasks.md', locator: '1.1', digest: D('b'), note: 'rename call sites' },
    ],
    quantities: {
      tasks: { state: 'known', kind: 'measured', min: 2, max: 2, rationale: 'counted in tasks.md', evidence: ['tasks'] },
      files: { state: 'known', kind: 'estimated', min: 60, max: 80, rationale: 'grep of call sites', evidence: ['task-1-1'] },
      diffLines: { state: 'known', kind: 'estimated', min: 300, max: 500, rationale: 'one line per call site', evidence: ['task-1-1'] },
      generatedFiles: { state: 'not-applicable', rationale: 'no generated code' },
    },
    factors: {
      domains: known(0),
      layers: known(1),
      architecture: known(0),
      logic: known(0),
      compatibility: known(0),
      testability: known(0),
      consequences: known(1),
      uncertainty: known(0),
    },
  };
}

// Small critical change: one authorization check.
export function criticalProfile() {
  const p = clone(mechanicalProfile());
  p.change.name = 'fix-authz-check';
  p.quantities.tasks = { state: 'known', kind: 'measured', min: 1, max: 1, rationale: 'one task', evidence: ['tasks'] };
  p.quantities.files = { state: 'known', kind: 'estimated', min: 1, max: 2, rationale: 'auth middleware + test', evidence: ['task-1-1'] };
  p.quantities.diffLines = { state: 'known', kind: 'estimated', min: 10, max: 40, rationale: 'one condition and tests', evidence: ['task-1-1'] };
  p.factors = {
    domains: known(1),
    layers: known(1),
    architecture: known(0),
    logic: known(1),
    compatibility: known(1),
    testability: known(2),
    consequences: known(4),
    uncertainty: known(1),
  };
  return p;
}
