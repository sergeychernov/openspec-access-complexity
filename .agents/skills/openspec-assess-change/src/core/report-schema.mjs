// Report contract v3 (strict: unknown fields are rejected). v2: exact per-effort records in
// contributions and resource records with units; no effort delta. v3: explicit selection policy and the
// exact adjusted cost S of minimum-resource-with-time-penalty.
import { FACTOR_IDS, QUANTITY_IDS, STAGES } from './factors.mjs';

const S = { type: 'string' };
const NE = { type: 'string', minLength: 1 };
const INT = { type: 'integer' };
const NINT = { anyOf: [{ type: 'integer' }, { type: 'null' }] };
const NSTR = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const BOOL = { type: 'boolean' };
const STRS = { type: 'array', items: S };
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const map = (keys, value) => ({ type: 'object', propertyNames: { enum: keys }, additionalProperties: value, required: keys });
const RANKS = ['apply/api', 'verify/api', 'apply/subscription', 'verify/subscription'];
const GROUPS = ['eligible', 'provisional', 'below-threshold'];
const COEF_STATUS = ['measured', 'proxy', 'heuristic', 'unknown', 'user-override'];

const FRACTION = obj({ numerator: { type: 'string', pattern: '^-?[0-9]+$' }, denominator: { type: 'string', pattern: '^[1-9][0-9]*$' } });
const adjusted = { anyOf: [{ type: 'null' }, obj({
  policy: { const: 'minimum-resource-with-time-penalty' },
  costUnit: { enum: ['micros', 'load-units'] },
  cost: NINT,
  typicalMinutes: NINT,
  graceMinutes: INT,
  intervalMinutes: INT,
  rateBp: INT,
  overMinutes: NINT,
  multiplier: { anyOf: [{ type: 'null' }, FRACTION] },
  value: { anyOf: [{ type: 'null' }, FRACTION] },
  complete: BOOL,
  missing: STRS,
})] };
const recordView = obj({ value: NINT, unit: NE, status: { enum: COEF_STATUS }, basis: NE });

const usage = obj({
  uncachedInputTokens: INT, cacheReadTokens: INT, cacheWriteTokens: INT, outputTokens: INT, reasoningTokens: INT, peakContextTokens: INT,
  toolCalls: { type: 'object', additionalProperties: INT },
});

const scenario = { anyOf: [{ type: 'null' }, obj({
  category: NE,
  usage,
  longContext: BOOL,
  lines: { type: 'array', items: obj({ category: NE, tokens: INT, calls: INT, billedAs: { enum: ['output', 'reasoning'] }, micros: NINT }, ['category', 'micros']) },
  missing: STRS,
  totalMicros: NINT,
})] };

const apiResource = obj({
  kind: { const: 'scenario-forecast' },
  currency: NE,
  pricingId: NSTR,
  pricingStatus: { enum: ['confirmed', 'example', 'unknown'] },
  usageRecord: recordView,
  lowMicros: NINT,
  typicalMicros: NINT,
  highMicros: NINT,
  status: { enum: ['known', 'unknown'] },
  notes: STRS,
  scenarios: obj({ low: scenario, typical: scenario, high: scenario }),
});

const subResource = obj({
  kind: { const: 'relative-load-forecast' },
  poolId: NSTR,
  loadRecord: recordView,
  lowLoad: NINT,
  typicalLoad: NINT,
  highLoad: NINT,
  status: { enum: ['known', 'unknown'] },
  pool: obj({ status: { enum: ['no-pool', 'unknown', 'expired', 'fresh'] }, reason: NE }),
  capacity: obj({
    status: { enum: ['unknown', 'fits', 'at-risk', 'insufficient'] },
    reason: NE,
    remaining: INT, unit: NE, needLow: INT, needTypical: INT, needHigh: INT,
  }, ['status', 'reason']),
  notes: STRS,
});

const time = obj({ status: { enum: ['known', 'unknown'] }, timeRecord: recordView, lowMinutes: NINT, typicalMinutes: NINT, highMinutes: NINT });

const critical = obj({
  factor: { enum: FACTOR_IDS }, levelUpper: INT, whenLevelAtLeast: INT, minCoefficientBp: INT, coefficientBp: NINT,
  status: { enum: ['pass', 'fail', 'unknown'] },
});

const contribution = obj({
  factor: { enum: FACTOR_IDS },
  level: INT,
  levelState: { enum: ['known', 'unknown'] },
  weight: INT,
  relevance: INT,
  record: obj({ phase: { enum: ['apply', 'verify'] }, effort: NE, factor: { enum: FACTOR_IDS } }),
  coefficientBp: NINT,
  coefficientStatus: { enum: COEF_STATUS },
  basis: NE,
  sources: STRS,
  support: STRS,
  inheritedFrom: { anyOf: [{ type: 'null' }, obj({ modelId: NE, harness: NE, status: { enum: COEF_STATUS } })] },
  origin: { anyOf: [{ type: 'null' }, obj({ value: NINT, status: { enum: COEF_STATUS }, basis: NE, sources: STRS })] },
  migrated: { anyOf: [{ type: 'null' }, { enum: ['byEffort', 'base+delta', 'resource'] }] },
  contributionBp: NINT,
});

const candidate = obj({
  rank: { type: 'integer', minimum: 1 },
  candidateId: NE,
  catalogId: NE,
  displayName: NE,
  family: NE,
  modelId: NE,
  harness: NE,
  clientModelId: NSTR,
  identityStatus: { enum: ['confirmed', 'unconfirmed'] },
  group: { enum: GROUPS },
  recommendedEffort: NE,
  suitability: obj({ valueBp: NINT, complete: BOOL, coverageBp: INT, kind: { const: 'heuristic-fit-score' }, contributions: { type: 'array', items: contribution } }),
  critical: { type: 'array', items: critical },
  resource: { anyOf: [apiResource, subResource] },
  time,
  utilityBp: NINT,
  adjusted,
  economicComplete: BOOL,
  missingEconomic: STRS,
  reasons: STRS,
  otherEfforts: { type: 'array', items: obj({ effort: NE, group: { enum: [...GROUPS, 'excluded'] }, suitabilityBp: NINT, utilityBp: NINT, adjustedValue: { anyOf: [{ type: 'null' }, FRACTION] }, resourceHigh: NINT, reasons: STRS }) },
});

const ranking = obj({
  phase: { enum: ['apply', 'verify'] },
  mode: { enum: ['api', 'subscription'] },
  qualityFloorBp: INT,
  demandBp: INT,
  relevance: { type: 'array', items: obj({ factor: { enum: FACTOR_IDS }, weight: INT, level: INT, levelState: { enum: ['known', 'unknown'] }, relevance: INT }) },
  policy: obj({
    id: { enum: ['minimum-resource-with-time-penalty', 'weighted-utility'] },
    version: INT,
    timePenalty: { anyOf: [{ type: 'null' }, obj({ graceMinutes: INT, intervalMinutes: INT, rateBp: INT })] },
  }),
  selectionWeights: { anyOf: [{ type: 'null' }, obj({ quality: INT, economy: INT, time: INT })] },
  status: { enum: ['ok', 'economics-undefined', 'provisional-only', 'no-suitable', 'undefined'] },
  message: NE,
  recommended: { anyOf: [{ type: 'null' }, obj({ candidateId: NE, effort: NE })] },
  candidates: { type: 'array', items: candidate },
  excluded: { type: 'array', items: obj({ candidateId: NE, catalogId: NE, displayName: NE, reasons: STRS }) },
  pools: { type: 'array', items: obj({ poolId: NE, label: NE, harness: NE, candidates: STRS, shared: BOOL, status: NE, reason: NE, note: NE }) },
});

const traceEntry = obj({
  candidateId: NE,
  effort: NSTR,
  group: { enum: [...GROUPS, 'excluded'] },
  suitabilityBp: NINT,
  coverageBp: INT,
  coefficients: { type: 'object', propertyNames: { enum: FACTOR_IDS }, additionalProperties: NINT },
  qualityFloorBp: INT,
  critical: { type: 'array', items: critical },
  resourceHigh: NINT,
  timeTypicalMinutes: NINT,
  timeHighMinutes: NINT,
  utilityBp: NINT,
  adjusted,
  economicComplete: BOOL,
  missingEconomic: STRS,
  reasons: STRS,
}, ['candidateId', 'effort', 'group', 'reasons']);

const level = { anyOf: [{ type: 'integer', minimum: 0, maximum: 4 }, { type: 'null' }] };
const factorOut = obj({
  state: { enum: ['known', 'unknown', 'not-applicable'] },
  kind: { anyOf: [{ enum: ['measured', 'declared', 'estimated'] }, { type: 'null' }] },
  lower: level,
  upper: level,
  rankingLevel: level,
  derivedFrom: { type: 'array', items: obj({ quantity: NE, state: { enum: ['known', 'unknown'] }, kind: NE, min: INT, max: INT, lowerLevel: INT, upperLevel: INT }, ['quantity', 'state', 'lowerLevel', 'upperLevel']) },
}, ['state', 'kind', 'lower', 'upper', 'rankingLevel']);

const index = { anyOf: [{ type: 'null' }, obj({ lower: INT, ranking: INT, upper: INT, factors: STRS })] };

export const reportSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://openspec-assess.local/schemas/report-3.schema.json',
  title: 'Assessment report v3',
  ...obj({
    kind: { const: 'openspec-assess.report' },
    schemaVersion: { const: 3 },
    version: obj({
      package: NE, evaluator: INT, renderer: INT, normalization: INT,
      schemas: obj({ profile: INT, config: INT, benchmarks: INT, manifest: INT, report: INT }),
    }),
    change: obj({
      name: NE,
      stage: { enum: STAGES },
      previousAssessmentId: NE,
      scope: obj({ mode: { enum: ['all-tasks', 'tasks'] }, taskIds: STRS, note: NE }, ['mode']),
    }, ['name', 'stage', 'scope']),
    asOf: NSTR,
    disclaimers: STRS,
    properties: obj({
      stage: { enum: STAGES },
      factors: map(FACTOR_IDS, factorOut),
      indices: map(['volume', 'complexity', 'risk', 'uncertainty'], index),
      unknownFactors: STRS,
      notApplicableFactors: STRS,
      unknownShareBp: INT,
      quantities: map(QUANTITY_IDS, obj({ state: { enum: ['known', 'unknown', 'not-applicable'] }, kind: NE, min: INT, max: INT }, ['state'])),
      workload: obj({ low: NE, typical: NE, high: NE }),
      demandBp: INT,
    }),
    missingData: obj({ unknownFactors: STRS, unknownQuantities: STRS, notApplicableFactors: STRS, unknownShareBp: INT, unknownPolicy: NE }),
    rankings: map(RANKS, ranking),
    benchmarks: { type: 'array', items: obj({ id: NE, benchmark: NE, model: NE, metric: NE, url: NE, publisher: NE, sourceKind: NE }) },
    trace: map(RANKS, { type: 'array', items: traceEntry }),
  }),
};
