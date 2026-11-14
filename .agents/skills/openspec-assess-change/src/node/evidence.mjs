// Filesystem/Git checks for profile evidence: existence, containment, digests, task and requirement
// locators, planned files and the actual diff. These checks prove that references resolve and are
// pinned; they do not prove that the agent's judgement is semantically correct.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { sourceDigest, sha256, canonicalDigest, isInside, realpathLoose, toPosix, AssessError, sha256Hex } from './fsio.mjs';
import { clone } from '../core/canonical.mjs';

function git(repoRoot, args) {
  const res = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
  if (res.error) throw new AssessError('git', `git is not available (${res.error.code})`);
  if (res.status !== 0) throw new AssessError('git', `git ${args.join(' ')} failed: ${res.stderr.toString('utf8').trim()}`);
  return res.stdout;
}

export function gitToplevel(dir) {
  const res = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return res.status === 0 ? res.stdout.trim() : null;
}

// Digest of the working tree against <revision>: tracked changes (git diff --binary) plus untracked,
// non-ignored files. The change's own assessment/ directory is excluded so that writing a result
// never makes the diff evidence stale.
export function diffDigest(repoRoot, revision, { excludeDirs = [] } = {}) {
  const excludes = excludeDirs.map((d) => `:(exclude)${d}`);
  const diff = git(repoRoot, ['diff', '--binary', '--no-color', '--no-ext-diff', revision, '--', '.', ...excludes]);
  const untrackedRaw = git(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z', '--', '.', ...excludes]).toString('utf8');
  const untracked = untrackedRaw.split('\0').filter(Boolean).sort()
    .map((p) => ({ path: p, digest: sha256(readFileSync(join(repoRoot, p))) }));
  const numstat = git(repoRoot, ['diff', '--numstat', revision, '--', '.', ...excludes]).toString('utf8').trim();
  let files = 0;
  let lines = 0;
  for (const row of numstat ? numstat.split('\n') : []) {
    const [a, d] = row.split('\t');
    files += 1;
    if (a !== '-') lines += Number(a) + Number(d);
  }
  for (const u of untracked) {
    files += 1;
    const text = readFileSync(join(repoRoot, u.path));
    if (!text.includes(0)) lines += text.toString('utf8').split('\n').length;
  }
  return {
    digest: canonicalDigest({ diff: sha256Hex(diff), untracked }),
    stats: { files, lines, untrackedFiles: untracked.length },
  };
}

export function assessmentExcludes(ctx) {
  if (!ctx.repoRoot) return [];
  const rel = toPosix(relative(realpathSync(ctx.repoRoot), realpathLoose(join(ctx.changeRoot, 'assessment'))));
  return rel.startsWith('..') ? [] : [rel];
}

function baseDir(e, ctx) {
  return e.base === 'change' ? ctx.changeRoot : ctx.repoRoot;
}

function locate(e, ctx) {
  const root = baseDir(e, ctx);
  if (!root) return { error: `base "${e.base}" is not available (no repository root)` };
  const abs = join(root, e.path);
  const real = realpathLoose(abs);
  if (!isInside(realpathSync(root), real)) return { error: `resolves outside the ${e.base} root` };
  return { abs };
}

const TASK_LINE = (id) => new RegExp(`^\\s*[-*]\\s+\\[[ xX]\\]\\s+${id.replace(/\./g, '\\.')}(\\s|$)`, 'm');
const REQ_LINE = (name) => new RegExp(`^#{3,4}\\s+Requirement:\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');

// Returns the current digest for one evidence entry (null when not applicable) and problems.
export function inspectEvidence(e, ctx) {
  const problems = [];
  if (e.kind === 'diff') {
    if (!ctx.repoRoot) return { digest: null, problems: ['diff evidence needs a Git repository root'] };
    try {
      const d = diffDigest(ctx.repoRoot, e.revision, { excludeDirs: assessmentExcludes(ctx) });
      return { digest: d.digest, stats: d.stats, problems };
    } catch (err) {
      return { digest: null, problems: [err.message] };
    }
  }
  if (e.path === undefined) return { digest: null, problems };
  const loc = locate(e, ctx);
  if (loc.error) return { digest: null, problems: [loc.error] };
  const exists = existsSync(loc.abs) && statSync(loc.abs).isFile();
  if (e.planned === true) {
    if (exists) problems.push('planned file already exists; record it as existing evidence (pin-evidence) or keep it planned in a new profile');
    return { digest: null, problems };
  }
  if (!exists) return { digest: null, problems: ['file does not exist'] };
  const digest = sourceDigest(loc.abs);
  if (e.locator !== undefined && (e.kind === 'task' || e.kind === 'requirement')) {
    const text = readFileSync(loc.abs, 'utf8');
    const re = e.kind === 'task' ? TASK_LINE(e.locator) : REQ_LINE(e.locator);
    if (!re.test(text)) problems.push(`${e.kind} "${e.locator}" is not found in ${e.path}`);
  }
  return { digest, problems };
}

// Local checks of all evidence; returns errors with JSON-pointer paths and current digests.
export function evidenceErrors(profile, ctx) {
  const errors = [];
  const current = {};
  profile.evidence.forEach((e, i) => {
    const r = inspectEvidence(e, ctx);
    for (const p of r.problems) errors.push({ path: `/evidence/${i}`, message: `${e.id}: ${p}` });
    if (r.digest !== null) {
      current[e.id] = r.digest;
      if (e.digest !== undefined && e.digest !== r.digest) {
        errors.push({ path: `/evidence/${i}/digest`, message: `${e.id}: source changed since it was pinned (pinned ${e.digest}, now ${r.digest}); re-read it and re-pin` });
      }
    }
  });
  if (profile.scope.mode === 'tasks') {
    const tasksPath = join(ctx.changeRoot, 'tasks.md');
    const text = existsSync(tasksPath) ? readFileSync(tasksPath, 'utf8') : '';
    profile.scope.taskIds.forEach((id, j) => {
      if (!TASK_LINE(id).test(text)) errors.push({ path: `/scope/taskIds/${j}`, message: `task ${id} is not found in tasks.md` });
    });
  }
  return { errors, current };
}

// Fills missing digests from the current sources (never overwrites a different pinned digest).
export function pinEvidence(profile, ctx) {
  const out = clone(profile);
  const changed = [];
  const problems = [];
  out.evidence.forEach((e, i) => {
    if (e.planned === true) return;
    if (e.path === undefined && e.kind !== 'diff') return;
    const r = inspectEvidence(e, ctx);
    if (r.problems.length) { problems.push(...r.problems.map((p) => ({ path: `/evidence/${i}`, message: `${e.id}: ${p}` }))); return; }
    if (r.digest === null) return;
    if (e.digest === undefined) { e.digest = r.digest; changed.push(e.id); } else if (e.digest !== r.digest) {
      problems.push({ path: `/evidence/${i}/digest`, message: `${e.id}: pinned digest differs from the current source; review the evidence and remove the old digest to re-pin` });
    }
  });
  return { profile: out, pinned: changed, problems };
}

// Scope digest: selected task IDs with their normalised task text.
export function scopeDigest(profile, changeRoot) {
  const tasksPath = join(changeRoot, 'tasks.md');
  const text = existsSync(tasksPath) ? readFileSync(tasksPath, 'utf8').replace(/\r\n/g, '\n') : '';
  const tasks = [];
  for (const line of text.split('\n')) {
    const m = /^\s*[-*]\s+\[[ xX]\]\s+([0-9]+(?:\.[0-9]+)*)\s+(.*)$/.exec(line);
    if (m && (profile.scope.mode === 'all-tasks' || profile.scope.taskIds.includes(m[1]))) tasks.push({ id: m[1], text: m[2].trim() });
  }
  return canonicalDigest({ scope: profile.scope, tasks });
}
