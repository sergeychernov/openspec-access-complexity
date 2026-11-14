// OpenSpec CLI integration: resolve the root, the change and its changeRoot without creating anything.
// The selected --store is passed to every call; nothing here runs `openspec init` or writes files.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { AssessError, toPosix } from './fsio.mjs';

export const OPENSPEC_BIN = process.env.OPENSPEC_BIN || 'openspec';

export function runOpenspec(args, { cwd = process.cwd(), store = null } = {}) {
  const full = store ? [...args, '--store', store] : args;
  const res = spawnSync(OPENSPEC_BIN, full, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (res.error) {
    throw new AssessError('openspec-missing', `cannot run "${OPENSPEC_BIN}" (${res.error.code || res.error.message}); install the OpenSpec CLI or set OPENSPEC_BIN`);
  }
  let json = null;
  try {
    json = JSON.parse(res.stdout);
  } catch {
    json = null;
  }
  return { status: res.status, json, stdout: res.stdout, stderr: res.stderr };
}

function firstStatusError(json) {
  const list = json && Array.isArray(json.status) ? json.status : [];
  return list.find((s) => s.severity === 'error') || null;
}

export function openspecVersion({ cwd } = {}) {
  const res = runOpenspec(['--version'], { cwd });
  return (res.stdout || '').trim() || null;
}

// Lists active changes. Throws "no-root" when there is no OpenSpec root (nothing is created).
export function listChanges({ cwd, store = null } = {}) {
  const res = runOpenspec(['list', '--json'], { cwd, store });
  if (!res.json) throw new AssessError('openspec', `openspec list failed: ${(res.stderr || res.stdout).trim()}`);
  if (res.json.root === null) {
    const e = firstStatusError(res.json);
    throw new AssessError('no-root', `${e ? e.message : 'No OpenSpec root found.'} Nothing was created; run "openspec init" yourself or pass --store <id>.`, { status: res.json.status || [] });
  }
  return { root: res.json.root, changes: res.json.changes || [] };
}

// Resolves a change to its changeRoot through `openspec status`. Without a name, a single active
// change is selected; several changes require an explicit choice.
export function resolveChange({ change = null, store = null, cwd = process.cwd() } = {}) {
  let name = change;
  if (!name) {
    const { changes } = listChanges({ cwd, store });
    if (changes.length === 0) throw new AssessError('no-change', 'No active OpenSpec change found; pass --change <name>.');
    if (changes.length > 1) {
      throw new AssessError('ambiguous-change', `Several active changes; choose one with --change: ${changes.map((c) => c.name).sort().join(', ')}`, { changes: changes.map((c) => c.name).sort() });
    }
    name = changes[0].name;
  }
  const res = runOpenspec(['status', '--change', name, '--json'], { cwd, store });
  const err = firstStatusError(res.json);
  if (!res.json || err || !res.json.changeRoot) {
    const message = err ? err.message : (res.stderr || res.stdout || 'unknown error').trim();
    if (/^(Declared in|Invalid store declaration in)/.test(message)) {
      throw new AssessError('store-unresolved', `${message}${err && err.fix ? ` Fix: ${err.fix}` : ''}`, { status: res.json && res.json.status });
    }
    if (res.json && res.json.root === null) {
      throw new AssessError('no-root', `${message} Nothing was created; run "openspec init" yourself or pass --store <id>.`);
    }
    throw new AssessError('change-not-found', `openspec status --change ${name}: ${message}`);
  }
  const s = res.json;
  if (!existsSync(s.changeRoot) || !statSync(s.changeRoot).isDirectory()) {
    throw new AssessError('change-not-found', `changeRoot ${s.changeRoot} reported by OpenSpec does not exist`);
  }
  const artifacts = {};
  for (const [id, a] of Object.entries(s.artifactPaths || {})) {
    artifacts[id] = (a.existingOutputPaths || [])
      .map((p) => toPosix(relative(s.changeRoot, p)))
      .filter((p) => !p.startsWith('assessment/') && !p.startsWith('..'))
      .sort();
  }
  return {
    name: s.changeName,
    store,
    schemaName: s.schemaName,
    changeRoot: s.changeRoot,
    root: s.root ? s.root.path : null,
    planningComplete: Boolean(s.isPlanningComplete),
    applyRequires: s.applyRequires || [],
    artifactStatus: Object.fromEntries((s.artifacts || []).map((a) => [a.id, a.status])),
    artifacts,
  };
}

// Planning readiness: every artifact required for apply is done and proposal/tasks exist.
// design (and other optional artifacts) may be absent when the workflow allows it.
export function readinessProblems(resolved) {
  const problems = [];
  for (const id of resolved.applyRequires) {
    if (resolved.artifactStatus[id] !== 'done') problems.push(`artifact "${id}" required for apply is ${resolved.artifactStatus[id] || 'missing'}`);
  }
  if (!resolved.artifacts.proposal || resolved.artifacts.proposal.length === 0) problems.push('proposal is missing');
  if (!resolved.artifacts.tasks || resolved.artifacts.tasks.length === 0) problems.push('tasks are missing');
  return problems;
}

export function planningArtifactPaths(resolved) {
  return [...new Set(Object.values(resolved.artifacts).flat())].sort();
}
