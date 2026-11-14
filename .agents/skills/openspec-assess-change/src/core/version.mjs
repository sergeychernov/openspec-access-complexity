// Version identity: every component whose semantics can change the result.
// Bump the relevant integer whenever behaviour of that component changes; the identity digest
// then changes and replay of older snapshots reports the incompatibility instead of recomputing.
import { SCHEMA_VERSIONS } from './schemas.mjs';

export const PACKAGE_VERSION = '0.3.0';
// 2: exact per-effort quality and resource records (config schema 2), no base + effortDelta.
// 3: explicit selection policy; minimum-resource-with-time-penalty (exact S) or legacy weighted-utility.
export const EVALUATOR_VERSION = 3;
// 2: 0–100 scale and provenance letters. 3: policy section, original forecasts vs adjusted cost S.
export const RENDERER_VERSION = 3;
export const NORMALIZATION_VERSION = 1;

export function versionIdentity() {
  return {
    package: PACKAGE_VERSION,
    evaluator: EVALUATOR_VERSION,
    renderer: RENDERER_VERSION,
    normalization: NORMALIZATION_VERSION,
    schemas: {
      profile: SCHEMA_VERSIONS.profile,
      config: SCHEMA_VERSIONS.config,
      benchmarks: SCHEMA_VERSIONS.benchmarks,
      manifest: SCHEMA_VERSIONS.manifest,
      report: SCHEMA_VERSIONS.report,
    },
  };
}

// Compatibility rule for replay: evaluator, renderer, normalization and all schema versions must match.
export function compatibilityProblems(stored) {
  const current = versionIdentity();
  const problems = [];
  for (const key of ['evaluator', 'renderer', 'normalization']) {
    if (stored[key] !== current[key]) problems.push(`${key} ${stored[key]} (installed ${current[key]})`);
  }
  for (const key of Object.keys(current.schemas)) {
    if (!stored.schemas || stored.schemas[key] !== current.schemas[key]) {
      problems.push(`schema ${key} ${stored.schemas ? stored.schemas[key] : '?'} (installed ${current.schemas[key]})`);
    }
  }
  return problems;
}
