// Freshness: does the stored assessment still describe the current change? Compares the manifest with
// the current planning artifacts, evidence sources, selected scope, working profile, configuration and
// evaluator version. History is never modified; a stale result only says why a new run is needed.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { versionIdentity, compatibilityProblems } from '../core/version.mjs';
import { canonicalDigest, readJsonFile, AssessError } from './fsio.mjs';
import { inspectEvidence, scopeDigest } from './evidence.mjs';
import { verifyRun, readLatest, runsDir, profilePath, planningArtifactDigests } from './store.mjs';

export function checkFreshness({ resolved, ctx, configInfo, artifactPaths, runId = null }) {
  const { changeRoot } = resolved;
  const latest = readLatest(changeRoot);
  const id = runId || (latest && latest.assessmentId);
  if (!id) throw new AssessError('not-found', 'no completed assessment in this change; run assess first');
  const reasons = [];
  const add = (kind, message, extra = {}) => reasons.push({ kind, message, ...extra });

  let run;
  try {
    run = verifyRun(join(runsDir(changeRoot), id));
  } catch (e) {
    add('integrity', e.message);
    return { status: 'stale', assessmentId: id, stage: null, reasons, history: latest ? latest.history : [] };
  }
  const { manifest, profile } = run;

  for (const p of compatibilityProblems(manifest.version)) add('version', `evaluator identity changed: ${p}`);

  const nowArtifacts = planningArtifactDigests(changeRoot, artifactPaths);
  const before = manifest.sources.artifacts;
  for (const rel of Object.keys(before).sort()) {
    if (!(rel in nowArtifacts)) add('artifact', `${rel} was removed`, { path: rel });
    else if (nowArtifacts[rel] !== before[rel]) add('artifact', `${rel} changed since the assessment`, { path: rel });
  }
  for (const rel of Object.keys(nowArtifacts).sort()) if (!(rel in before)) add('artifact', `${rel} was added`, { path: rel });

  for (const e of profile.evidence) {
    const pinned = manifest.sources.evidence[e.id];
    const r = inspectEvidence(e, ctx);
    if (e.planned === true) {
      if (r.problems.length) add('evidence', `${e.id}: ${r.problems.join('; ')}`, { evidence: e.id });
      continue;
    }
    if (pinned === undefined) continue;
    if (r.digest === null) add('evidence', `${e.id}: ${r.problems.join('; ') || 'source is no longer available'}`, { evidence: e.id });
    else if (r.digest !== pinned) add(e.kind === 'diff' ? 'diff' : 'evidence', `${e.id}: ${e.kind === 'diff' ? 'the diff' : e.path} changed since the assessment`, { evidence: e.id });
  }

  if (scopeDigest(profile, changeRoot) !== manifest.sources.scope) add('scope', 'the selected task scope or its task text changed');

  const wp = profilePath(changeRoot);
  if (existsSync(wp)) {
    const working = readJsonFile(wp, 'assessment/profile.json');
    if (canonicalDigest(working) !== canonicalDigest(profile)) add('profile', 'assessment/profile.json differs from the assessed profile');
  } else add('profile', 'assessment/profile.json is missing');

  const c = manifest.sources.config;
  if (configInfo.digests.defaults !== c.defaults) add('config', 'shipped defaults changed (package update)');
  if (configInfo.digests.overrides !== c.overrides) add('config', c.overrides === null ? 'user overrides were added' : (configInfo.digests.overrides === null ? 'user overrides were removed or not passed' : 'user overrides changed'));
  if (configInfo.digests.effective !== c.effective) add('config', 'effective configuration differs from the snapshot');

  return {
    status: reasons.length ? 'stale' : 'fresh',
    assessmentId: id,
    stage: manifest.stage,
    reasons,
    history: latest ? latest.history : [],
    installed: versionIdentity().package,
  };
}
