// assessment/ layout inside the change root:
//   assessment/profile.json            working profile (editable)
//   assessment/latest.json             pointer to the latest completed run (+ history)
//   assessment/runs/<assessment-id>/   immutable snapshot: profile, config, benchmarks, manifest, report
// A run is built in a temporary sibling directory, verified, then renamed into runs/. Only after that
// is latest.json replaced atomically. A failed or interrupted run never becomes latest.
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { evaluate, referencedBenchmarks } from '../core/evaluate.mjs';
import { renderMarkdown } from '../core/render-md.mjs';
import { versionIdentity, compatibilityProblems } from '../core/version.mjs';
import { structuralErrors, profileErrors, assertValid } from '../core/validate.mjs';
import { KINDS, SCHEMA_VERSIONS } from '../core/schemas.mjs';
import { parseJsonStrict, canonicalStringify } from '../core/canonical.mjs';
import { ValidationError } from '../core/jsonschema.mjs';
import {
  AssessError, sha256, sha256Hex, canonicalDigest, canonicalBytes, assertContained, atomicWriteFile, sourceDigest, readJsonFile,
} from './fsio.mjs';
import { evidenceErrors, scopeDigest } from './evidence.mjs';

export const INPUT_FILES = ['profile.json', 'config.snapshot.json', 'benchmarks.snapshot.json'];
export const OUTPUT_FILES = ['report.json', 'report.md'];
export const RUN_FILES = [...INPUT_FILES, 'manifest.json', ...OUTPUT_FILES];

export const assessmentDir = (changeRoot) => join(changeRoot, 'assessment');
export const profilePath = (changeRoot) => join(assessmentDir(changeRoot), 'profile.json');
export const latestPath = (changeRoot) => join(assessmentDir(changeRoot), 'latest.json');
export const runsDir = (changeRoot) => join(assessmentDir(changeRoot), 'runs');

// assessment-id = SHA-256 of canonical {profile, effective config, benchmark snapshot, version identity, asOf}.
export function assessmentIdOf({ profile, config, benchmarks, version, asOf }) {
  return sha256Hex(canonicalStringify({ profile, config, benchmarks, version, asOf }));
}

export function renderRun({ profile, config, benchmarks, asOf }) {
  const report = evaluate({ profile, config, benchmarks, asOf });
  const snapshot = referencedBenchmarks(config, benchmarks);
  const version = versionIdentity();
  const assessmentId = assessmentIdOf({ profile, config, benchmarks: snapshot, version, asOf });
  const files = {
    'profile.json': canonicalBytes(profile),
    'config.snapshot.json': canonicalBytes(config),
    'benchmarks.snapshot.json': canonicalBytes(snapshot),
    'report.json': canonicalBytes(report),
    'report.md': `${renderMarkdown(report)}\n`,
  };
  return { report, snapshot, version, assessmentId, files };
}

export function planningArtifactDigests(changeRoot, relPaths) {
  const out = {};
  for (const rel of relPaths) out[rel] = sourceDigest(join(changeRoot, rel));
  return out;
}

function buildManifest({ assessmentId, profile, version, asOf, files, sources }) {
  const manifest = {
    kind: KINDS.manifest,
    schemaVersion: SCHEMA_VERSIONS.manifest,
    assessmentId,
    change: { name: profile.change.name },
    stage: profile.stage,
    ...(profile.previousAssessmentId ? { previousAssessmentId: profile.previousAssessmentId } : {}),
    version,
    versionDigest: canonicalDigest(version),
    asOf,
    inputs: Object.fromEntries(INPUT_FILES.map((f) => [f, sha256(files[f])])),
    outputs: Object.fromEntries(OUTPUT_FILES.map((f) => [f, sha256(files[f])])),
    sources,
  };
  assertValid('manifest', structuralErrors('manifest', manifest));
  return manifest;
}

// Reads a run directory and checks manifest schema, every digest and the content address.
// Returns the parsed inputs; throws AssessError('integrity') on any mismatch.
export function verifyRun(runDir) {
  const problems = [];
  const bytes = {};
  for (const f of RUN_FILES) {
    const p = join(runDir, f);
    if (!existsSync(p)) problems.push(`${f} is missing`);
    else bytes[f] = readFileSync(p);
  }
  if (problems.length) throw new AssessError('integrity', `run ${basename(runDir)} is incomplete: ${problems.join('; ')}`);
  let manifest;
  try {
    manifest = parseJsonStrict(bytes['manifest.json'].toString('utf8'), 'manifest.json');
  } catch (e) {
    throw new AssessError('integrity', `manifest.json is not valid JSON: ${e.message}`);
  }
  const mErrors = structuralErrors('manifest', manifest);
  if (mErrors.length) {
    const versionMsg = mErrors.find((e) => e.path === '/schemaVersion');
    throw new AssessError(versionMsg ? 'incompatible' : 'integrity', `manifest.json: ${mErrors.map((e) => `${e.path} ${e.message}`).join('; ')}`);
  }
  for (const [f, d] of Object.entries({ ...manifest.inputs, ...manifest.outputs })) {
    if (sha256(bytes[f]) !== d) problems.push(`${f} digest mismatch (manifest ${d}, file ${sha256(bytes[f])})`);
  }
  if (canonicalDigest(manifest.version) !== manifest.versionDigest) problems.push('versionDigest does not match version');
  if (basename(runDir) !== manifest.assessmentId && !basename(runDir).startsWith('.tmp-')) {
    problems.push(`directory name ${basename(runDir)} differs from assessmentId ${manifest.assessmentId}`);
  }
  if (problems.length) throw new AssessError('integrity', `run ${manifest.assessmentId}: ${problems.join('; ')}`);
  const parse = (f) => parseJsonStrict(bytes[f].toString('utf8'), f);
  const profile = parse('profile.json');
  const config = parse('config.snapshot.json');
  const benchmarks = parse('benchmarks.snapshot.json');
  const id = assessmentIdOf({ profile, config, benchmarks, version: manifest.version, asOf: manifest.asOf });
  if (id !== manifest.assessmentId) throw new AssessError('integrity', `content address ${id} does not match assessmentId ${manifest.assessmentId}`);
  return { manifest, profile, config, benchmarks, bytes };
}

export function readLatest(changeRoot) {
  const p = latestPath(changeRoot);
  if (!existsSync(p)) return null;
  const latest = readJsonFile(p, 'assessment/latest.json');
  assertValid('assessment/latest.json', structuralErrors('latest', latest));
  return latest;
}

function guardPaths(changeRoot) {
  for (const p of [assessmentDir(changeRoot), runsDir(changeRoot), latestPath(changeRoot), profilePath(changeRoot)]) {
    assertContained(changeRoot, p, p.slice(changeRoot.length + 1) || p);
  }
}

// Saves the working profile (validated structurally) inside the change.
export function writeWorkingProfile(changeRoot, profile) {
  guardPaths(changeRoot);
  assertValid('profile', profileErrors(profile));
  mkdirSync(assessmentDir(changeRoot), { recursive: true });
  atomicWriteFile(profilePath(changeRoot), canonicalBytes(profile));
}

// Full assess: validate → evaluate → snapshot → verify → publish run → switch latest.
// `fault` is a test hook: 'after-temp' | 'before-latest'.
export function createRun({
  resolved, ctx, profile, configInfo, asOf = null, artifactPaths, fault = null,
}) {
  const { changeRoot } = resolved;
  guardPaths(changeRoot);
  assertValid('profile', profileErrors(profile));
  if (profile.change.name !== resolved.name) {
    throw new ValidationError('profile', [{ path: '/change/name', message: `profile is for "${profile.change.name}", but the resolved change is "${resolved.name}"` }]);
  }
  const ev = evidenceErrors(profile, ctx);
  if (ev.errors.length) throw new ValidationError('profile evidence', ev.errors);
  if (profile.previousAssessmentId && !existsSync(join(runsDir(changeRoot), profile.previousAssessmentId, 'manifest.json'))) {
    throw new ValidationError('profile', [{ path: '/previousAssessmentId', message: `run ${profile.previousAssessmentId} does not exist in assessment/runs` }]);
  }

  const rendered = renderRun({ profile, config: configInfo.effective, benchmarks: configInfo.benchmarks, asOf });
  const { assessmentId, files, version } = rendered;
  const sources = {
    artifacts: planningArtifactDigests(changeRoot, artifactPaths),
    evidence: Object.fromEntries(Object.keys(ev.current).sort().map((k) => [k, ev.current[k]])),
    scope: scopeDigest(profile, changeRoot),
    config: configInfo.digests,
  };
  const manifest = buildManifest({ assessmentId, profile, version, asOf, files, sources });

  const runs = runsDir(changeRoot);
  const final = join(runs, assessmentId);
  mkdirSync(runs, { recursive: true });
  let reused = false;
  if (existsSync(final)) {
    // Same content address: the existing snapshot must verify; it is reused, never rewritten.
    const existing = verifyRun(final);
    for (const f of OUTPUT_FILES) {
      if (!existing.bytes[f].equals(Buffer.from(files[f]))) throw new AssessError('integrity', `existing run ${assessmentId} has different ${f}`);
    }
    reused = true;
  } else {
    const tmp = join(assessmentDir(changeRoot), `.tmp-${assessmentId.slice(0, 12)}-${process.pid}-${randomBytes(3).toString('hex')}`);
    assertContained(changeRoot, tmp);
    mkdirSync(tmp);
    try {
      for (const f of [...INPUT_FILES, ...OUTPUT_FILES]) writeFileSync(join(tmp, f), files[f]);
      writeFileSync(join(tmp, 'manifest.json'), canonicalBytes(manifest));
      if (fault === 'after-temp') throw new AssessError('fault', 'injected fault after temporary run was written');
      verifyRun(tmp);
      renameSync(tmp, final);
    } catch (e) {
      if (fault !== 'after-temp') rmSync(tmp, { recursive: true, force: true });
      throw e;
    }
  }
  if (fault === 'before-latest') throw new AssessError('fault', 'injected fault before latest.json update');

  const prev = readLatest(changeRoot);
  const history = prev ? [...prev.history] : [];
  if (!prev || prev.assessmentId !== assessmentId) history.push({ assessmentId, stage: profile.stage });
  const latest = {
    kind: KINDS.latest,
    schemaVersion: SCHEMA_VERSIONS.latest,
    assessmentId,
    stage: profile.stage,
    manifestDigest: sha256(readFileSync(join(final, 'manifest.json'))),
    history,
  };
  assertValid('latest', structuralErrors('latest', latest));
  atomicWriteFile(latestPath(changeRoot), canonicalBytes(latest));
  return { assessmentId, reused, runDir: final, report: rendered.report, manifest, latest };
}

// Locates a run directory from a run dir, an assessment dir or a change root (uses latest.json).
export function locateRun(path, { runId = null } = {}) {
  if (existsSync(join(path, 'manifest.json'))) return path;
  const candidates = [path, join(path, 'assessment')];
  for (const a of candidates) {
    if (!existsSync(join(a, 'runs'))) continue;
    if (runId) {
      const d = join(a, 'runs', runId);
      if (!existsSync(d)) throw new AssessError('not-found', `run ${runId} not found in ${a}/runs`);
      return d;
    }
    const lp = join(a, 'latest.json');
    if (!existsSync(lp)) throw new AssessError('not-found', `${a} has no latest.json; pass --run <assessment-id>`);
    const latest = readJsonFile(lp, 'latest.json');
    assertValid('latest.json', structuralErrors('latest', latest));
    return join(a, 'runs', latest.assessmentId);
  }
  throw new AssessError('not-found', `no assessment run found at ${path}`);
}

export function listRuns(assessmentRoot) {
  const d = join(assessmentRoot, 'runs');
  return existsSync(d) ? readdirSync(d).filter((n) => /^[0-9a-f]{64}$/.test(n)).sort() : [];
}

// Read-only replay from the stored snapshot. Never writes, never reads the working tree or defaults.
export function replayRun(runDir) {
  const { manifest, profile, config, benchmarks, bytes } = verifyRun(runDir);
  const problems = compatibilityProblems(manifest.version);
  if (problems.length) {
    throw new AssessError('incompatible', `snapshot ${manifest.assessmentId} was produced by package ${manifest.version.package} (${problems.join(', ')}). Install openspec-assess-change ${manifest.version.package} to replay it; recomputing with this evaluator would not be the historical result.`, { required: manifest.version });
  }
  const rendered = renderRun({ profile, config, benchmarks: { ...benchmarks }, asOf: manifest.asOf });
  const mismatches = OUTPUT_FILES.filter((f) => !bytes[f].equals(Buffer.from(rendered.files[f])));
  if (rendered.assessmentId !== manifest.assessmentId) mismatches.push('assessmentId');
  return {
    assessmentId: manifest.assessmentId,
    stage: manifest.stage,
    change: manifest.change.name,
    reproduced: mismatches.length === 0,
    mismatches,
    report: rendered.report,
    note: 'Replay recomputes the stored snapshot. It does not re-check historical evidence against the current files; use check-freshness for that.',
  };
}
