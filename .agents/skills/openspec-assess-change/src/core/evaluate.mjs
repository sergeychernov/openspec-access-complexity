// Pure evaluator entry point: validated profile + effective config + benchmark snapshot (+ explicit asOf)
// → report object. No clock, network, locale or filesystem access.
import {
  profileErrors, configErrors, benchmarksErrors, provenanceErrors, assertValid, estimateRecords,
} from './validate.mjs';
import { computeChange } from './change.mjs';
import { rankPhaseMode, RANKING_KEYS } from './ranking.mjs';
import { versionIdentity } from './version.mjs';
import { KINDS, SCHEMA_VERSIONS } from './schemas.mjs';
import { QUANTITY_IDS } from './factors.mjs';
import { canonicalize, compareCodeUnits } from './canonical.mjs';

const ASOF = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;

export const DISCLAIMERS = [
  'Suitability is a heuristic fit score (stored as 0–10000 bp, shown as 0–100), not a probability of success.',
  'Cost and load values are scenario forecasts (low/typical/high), not measurements.',
  'The report is input for a manual choice: it does not run apply or verify, switch models, mark tasks or accept the change.',
  'Determinism covers the calculation for these pinned inputs, not independent re-reading of the change by another agent.',
];

// Benchmark records referenced by the effective config — as sources of a number or as supporting
// evidence — plus the mappings for them.
export function referencedBenchmarks(config, benchmarks) {
  const ids = new Set();
  for (const [, rec] of estimateRecords(config)) {
    for (const s of rec.sources || []) ids.add(s);
    for (const s of rec.support || []) ids.add(s);
  }
  const records = benchmarks.records.filter((r) => ids.has(r.id)).sort((a, b) => compareCodeUnits(a.id, b.id));
  const keys = new Set(records.map((r) => `${r.benchmark.name}\u0000${r.benchmark.version}\u0000${r.metric}`));
  const mappings = benchmarks.mappings
    .filter((m) => keys.has(`${m.benchmark.name}\u0000${m.benchmark.version}\u0000${m.metric}`))
    .sort((a, b) => compareCodeUnits(a.id, b.id));
  return {
    kind: KINDS.benchmarks,
    schemaVersion: SCHEMA_VERSIONS.benchmarks,
    snapshotDate: benchmarks.snapshotDate,
    ...(benchmarks.note ? { note: benchmarks.note } : {}),
    records,
    mappings,
  };
}

export function validateInputs({ profile, config, benchmarks, asOf }) {
  assertValid('profile', profileErrors(profile));
  assertValid('config', configErrors(config));
  assertValid('benchmarks', benchmarksErrors(benchmarks));
  assertValid('config provenance', provenanceErrors(config, benchmarks));
  if (asOf !== null && (typeof asOf !== 'string' || !ASOF.test(asOf))) {
    assertValid('asOf', [{ path: '/asOf', message: 'must be null or a UTC timestamp YYYY-MM-DDTHH:MM:SSZ' }]);
  }
}

export function evaluate({ profile, config, benchmarks, asOf = null }) {
  validateInputs({ profile, config, benchmarks, asOf });
  const change = computeChange(profile, config.complexityRules);
  const pricingById = new Map(config.pricing.map((p) => [p.id, p]));
  const poolById = new Map(config.quotaPools.map((p) => [p.id, p]));
  const rankings = {};
  const trace = {};
  for (const key of RANKING_KEYS) {
    const [phase, mode] = key.split('/');
    const { ranking, trace: t } = rankPhaseMode({ change, config, phase, mode, asOf, pricingById, poolById });
    rankings[key] = ranking;
    trace[key] = t;
  }
  const bench = referencedBenchmarks(config, benchmarks);
  const missingData = {
    unknownFactors: change.unknownFactors,
    unknownQuantities: QUANTITY_IDS.filter((q) => profile.quantities[q].state === 'unknown'),
    notApplicableFactors: change.notApplicableFactors,
    unknownShareBp: change.unknownShareBp,
    unknownPolicy: `unknown factor levels use bounds 0..4 for indices and level ${config.complexityRules.unknownRankingLevel} for ranking relevance; they are never treated as 0`,
  };
  const report = {
    kind: KINDS.report,
    schemaVersion: SCHEMA_VERSIONS.report,
    version: versionIdentity(),
    change: {
      name: profile.change.name,
      stage: profile.stage,
      ...(profile.previousAssessmentId ? { previousAssessmentId: profile.previousAssessmentId } : {}),
      scope: profile.scope,
    },
    asOf,
    disclaimers: DISCLAIMERS,
    properties: change,
    missingData,
    rankings,
    benchmarks: bench.records.map((r) => ({
      id: r.id,
      benchmark: `${r.benchmark.name} ${r.benchmark.version}`,
      model: `${r.model.harness}/${r.model.modelId}@${r.model.effort}`,
      metric: r.metric,
      url: r.source.url,
      publisher: r.source.publisher,
      sourceKind: r.source.kind,
    })),
    trace,
  };
  return canonicalize(report);
}
