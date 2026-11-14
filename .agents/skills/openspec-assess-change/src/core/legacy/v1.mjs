// Legacy v1 contract (package 0.1.0): config/overrides schemaVersion 1 with base + effortDelta and
// optional byEffort. Kept unchanged so that `migrate-config` can rebuild an old effective config by the
// old rules before materialising explicit per-effort records. Not used by the current evaluator.
import { FACTOR_IDS } from '../factors.mjs';
import { validateSchema, ValidationError } from '../jsonschema.mjs';
import { clone } from '../canonical.mjs';

const KINDS = { config: 'openspec-assess.config', overrides: 'openspec-assess.overrides' };
function header(kind, version) {
  return { kind: { const: KINDS[kind] }, schemaVersion: { const: version } };
}
const ID = '^[a-z0-9][a-z0-9._-]*$';
const TASK_ID = '^[0-9]+(\\.[0-9]+)*$';
const SHA256 = '^sha256:[0-9a-f]{64}$';
const HEX64 = '^[0-9a-f]{64}$';
const REL_PATH = '^(?!/)(?![A-Za-z]:)(?!.*(^|/)\\.\\.(/|$))[^\\\\\\u0000]+$';
const DATE = '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
const DATETIME = '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$';
const NON_EMPTY = { type: 'string', minLength: 1 };
const BP = { type: 'integer', minimum: 0, maximum: 10000 };
const NONNEG = { type: 'integer', minimum: 0 };
const LEVEL = { type: 'integer', minimum: 0, maximum: 4 };

function _unusedHeader(kind, version) {
  return {
    kind: { const: KINDS[kind] },
    schemaVersion: { const: version },
  };
}

function strictObject(properties, required = Object.keys(properties)) {
  return { type: 'object', properties, required, additionalProperties: false };
}

function factorMap(valueSchema, factors = FACTOR_IDS) {
  return {
    type: 'object',
    propertyNames: { enum: factors },
    additionalProperties: valueSchema,
  };
}


const coefficient = {
  type: 'object',
  additionalProperties: false,
  required: ['value', 'status', 'basis'],
  properties: {
    value: { anyOf: [BP, { type: 'null' }] },
    status: { enum: ['measured', 'proxy', 'heuristic', 'unknown', 'user-override'] },
    basis: NON_EMPTY,
    sources: { type: 'array', items: { type: 'string', pattern: ID }, uniqueItems: true },
    inheritedFrom: strictObject({
      modelId: NON_EMPTY,
      harness: { type: 'string', pattern: ID },
      status: { enum: ['measured', 'proxy', 'heuristic', 'unknown', 'user-override'] },
    }),
  },
};

const effortDelta = strictObject({
  deltaBp: { type: 'integer', minimum: -10000, maximum: 10000 },
  status: { enum: ['measured', 'proxy', 'heuristic', 'user-override'] },
  basis: NON_EMPTY,
}, ['deltaBp', 'status', 'basis']);

const phaseCoefficients = strictObject({
  base: { ...factorMap({ $ref: '#/$defs/coefficient' }), required: FACTOR_IDS },
  effortDelta: { type: 'object', propertyNames: { pattern: ID }, additionalProperties: { $ref: '#/$defs/effortDelta' } },
  byEffort: {
    type: 'object',
    propertyNames: { pattern: ID },
    additionalProperties: factorMap({ $ref: '#/$defs/coefficient' }),
  },
}, ['base']);

const perPhaseEffortInt = strictObject({
  apply: { type: 'object', propertyNames: { pattern: ID }, additionalProperties: { anyOf: [{ type: 'integer', minimum: 0, maximum: 1000000 }, { type: 'null' }] } },
  verify: { type: 'object', propertyNames: { pattern: ID }, additionalProperties: { anyOf: [{ type: 'integer', minimum: 0, maximum: 1000000 }, { type: 'null' }] } },
});

const usage = strictObject({
  uncachedInputTokens: NONNEG,
  cacheReadTokens: NONNEG,
  cacheWriteTokens: NONNEG,
  outputTokens: NONNEG,
  reasoningTokens: NONNEG,
  peakContextTokens: NONNEG,
  toolCalls: { type: 'object', propertyNames: { pattern: ID }, additionalProperties: NONNEG },
}, ['uncachedInputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens', 'reasoningTokens', 'peakContextTokens']);

const range3 = (item) => strictObject({ low: item, typical: item, high: item });

const rates = strictObject({
  uncachedInput: { anyOf: [NONNEG, { type: 'null' }] },
  cacheRead: { anyOf: [NONNEG, { type: 'null' }] },
  cacheWrite: { anyOf: [NONNEG, { type: 'null' }] },
  output: { anyOf: [NONNEG, { type: 'null' }] },
  reasoning: { anyOf: [NONNEG, { type: 'null' }] },
});

const categoryMap = (item) => ({ type: 'object', propertyNames: { pattern: ID }, additionalProperties: item, minProperties: 1 });

export const configSchemaV1 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://openspec-assess.local/schemas/legacy/config-1.schema.json',
  title: 'Effective assessment configuration v1',
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'schemaVersion', 'catalog', 'complexityRules', 'phases', 'workloads', 'harnesses', 'models', 'pricing', 'quotaPools', 'constraints', 'selection'],
  properties: {
    ...header('config', 1),
    provenance: strictObject({
      defaults: NON_EMPTY,
      overridePaths: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    }, ['defaults', 'overridePaths']),
    catalog: strictObject({
      verifiedAt: { type: 'string', pattern: DATE },
      note: NON_EMPTY,
      sources: { type: 'array', items: strictObject({ id: { type: 'string', pattern: ID }, url: NON_EMPTY, title: NON_EMPTY }) },
    }),
    complexityRules: strictObject({
      volumeThresholds: strictObject({
        tasks: { type: 'array', items: NONNEG, minItems: 4, maxItems: 4 },
        files: { type: 'array', items: NONNEG, minItems: 4, maxItems: 4 },
        diffLines: { type: 'array', items: NONNEG, minItems: 4, maxItems: 4 },
      }),
      groups: strictObject({
        volume: factorMap(NONNEG),
        complexity: factorMap(NONNEG),
        risk: factorMap(NONNEG),
        uncertainty: factorMap(NONNEG),
      }),
      unknownRankingLevel: LEVEL,
      workloadCategories: {
        type: 'array',
        minItems: 1,
        items: strictObject({ id: { type: 'string', pattern: ID }, upToBp: BP }),
      },
      basis: NON_EMPTY,
    }),
    phases: strictObject({
      apply: { $ref: '#/$defs/phase' },
      verify: { $ref: '#/$defs/phase' },
    }),
    workloads: strictObject({
      basis: NON_EMPTY,
      api: strictObject({ apply: categoryMap(range3({ $ref: '#/$defs/usage' })), verify: categoryMap(range3({ $ref: '#/$defs/usage' })) }),
      subscription: strictObject({ apply: categoryMap(range3(NONNEG)), verify: categoryMap(range3(NONNEG)) }),
      timeMinutes: strictObject({ apply: categoryMap(range3(NONNEG)), verify: categoryMap(range3(NONNEG)) }),
    }),
    harnesses: {
      type: 'array',
      minItems: 1,
      items: strictObject({ id: { type: 'string', pattern: ID }, name: NON_EMPTY, docs: NON_EMPTY }, ['id', 'name']),
    },
    models: { type: 'array', items: { $ref: '#/$defs/model' } },
    pricing: { type: 'array', items: { $ref: '#/$defs/pricing' } },
    quotaPools: { type: 'array', items: { $ref: '#/$defs/quotaPool' } },
    constraints: strictObject({
      minContextTokens: { anyOf: [NONNEG, { type: 'null' }] },
      requiredCapabilities: { type: 'array', items: { type: 'string', pattern: ID }, uniqueItems: true },
      api: strictObject({ maxCostMicros: { anyOf: [NONNEG, { type: 'null' }] } }),
    }),
    selection: strictObject({
      api: strictObject({
        currency: { type: 'string', pattern: '^[A-Z]{3}$' },
        weights: { $ref: '#/$defs/selectionWeights' },
        anchors: strictObject({ costMicros: { type: 'integer', minimum: 1 }, timeMinutes: { type: 'integer', minimum: 1 } }),
      }),
      subscription: strictObject({
        weights: { $ref: '#/$defs/selectionWeights' },
        anchors: strictObject({ load: { type: 'integer', minimum: 1 }, timeMinutes: { type: 'integer', minimum: 1 } }),
      }),
      basis: NON_EMPTY,
    }),
  },
  $defs: {
    coefficient,
    effortDelta,
    usage,
    phase: strictObject({
      relevanceWeights: { ...factorMap(NONNEG), required: FACTOR_IDS },
      qualityFloors: {
        type: 'array',
        minItems: 1,
        items: strictObject({ fromDemandBp: BP, floorBp: BP }),
      },
      criticalFactors: {
        type: 'array',
        items: strictObject({ factor: { enum: FACTOR_IDS }, whenLevelAtLeast: LEVEL, minCoefficientBp: BP }),
      },
      basis: NON_EMPTY,
    }),
    selectionWeights: strictObject({ quality: NONNEG, economy: NONNEG, time: NONNEG }),
    model: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'family', 'displayName', 'modelId', 'harness', 'clientModelId', 'enabled', 'availability', 'supportedEfforts', 'contextWindowTokens', 'capabilities', 'identity', 'coefficients', 'api', 'subscription', 'time'],
      properties: {
        id: { type: 'string', pattern: ID },
        family: NON_EMPTY,
        displayName: NON_EMPTY,
        modelId: NON_EMPTY,
        harness: { type: 'string', pattern: ID },
        clientModelId: { anyOf: [NON_EMPTY, { type: 'null' }] },
        enabled: { type: 'boolean' },
        availability: { enum: ['available', 'unavailable', 'unknown'] },
        supportedEfforts: { type: 'array', items: { type: 'string', pattern: ID }, minItems: 1, uniqueItems: true },
        efforts: { type: 'array', items: { type: 'string', pattern: ID }, minItems: 1, uniqueItems: true },
        contextWindowTokens: { anyOf: [NONNEG, { type: 'null' }] },
        capabilities: { anyOf: [{ type: 'array', items: { type: 'string', pattern: ID }, uniqueItems: true }, { type: 'null' }] },
        identity: strictObject({
          status: { enum: ['confirmed', 'unconfirmed'] },
          checkedAt: { type: 'string', pattern: DATE },
          sources: { type: 'array', items: { type: 'string', pattern: ID }, uniqueItems: true },
          note: NON_EMPTY,
        }, ['status', 'checkedAt', 'sources']),
        coefficients: strictObject({ apply: phaseCoefficients, verify: phaseCoefficients }),
        api: strictObject({ pricingId: { anyOf: [{ type: 'string', pattern: ID }, { type: 'null' }] }, usageMultiplierBp: perPhaseEffortInt, basis: NON_EMPTY }, ['pricingId', 'usageMultiplierBp']),
        subscription: strictObject({ poolId: { anyOf: [{ type: 'string', pattern: ID }, { type: 'null' }] }, loadMultiplierBp: perPhaseEffortInt, basis: NON_EMPTY }, ['poolId', 'loadMultiplierBp']),
        time: strictObject({ multiplierBp: perPhaseEffortInt, basis: NON_EMPTY }, ['multiplierBp']),
      },
    },
    pricing: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'status', 'currency', 'tier', 'rates', 'reasoningBilling', 'longContext', 'toolCharges'],
      properties: {
        id: { type: 'string', pattern: ID },
        status: { enum: ['confirmed', 'example', 'unknown'] },
        currency: { type: 'string', pattern: '^[A-Z]{3}$' },
        tier: NON_EMPTY,
        source: strictObject({ url: NON_EMPTY, checkedAt: { type: 'string', pattern: DATE } }),
        rates,
        reasoningBilling: { enum: ['as-output', 'separate'] },
        longContext: { anyOf: [{ type: 'null' }, strictObject({ thresholdTokens: { type: 'integer', minimum: 1 }, rates })] },
        toolCharges: { type: 'object', propertyNames: { pattern: ID }, additionalProperties: { anyOf: [NONNEG, { type: 'null' }] } },
        note: NON_EMPTY,
      },
    },
    quotaPool: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'harness', 'label', 'observation', 'conversion'],
      properties: {
        id: { type: 'string', pattern: ID },
        harness: { type: 'string', pattern: ID },
        label: NON_EMPTY,
        observation: {
          anyOf: [{ type: 'null' }, strictObject({
            observedAt: { type: 'string', pattern: DATETIME },
            maxAgeHours: { type: 'integer', minimum: 1 },
            remaining: NONNEG,
            unit: NON_EMPTY,
            resetAt: { anyOf: [{ type: 'string', pattern: DATETIME }, { type: 'null' }] },
            source: NON_EMPTY,
          })],
        },
        conversion: {
          anyOf: [{ type: 'null' }, strictObject({
            quotaUnitsPer1000Load: { type: 'integer', minimum: 1 },
            unit: NON_EMPTY,
            source: NON_EMPTY,
          })],
        },
        note: NON_EMPTY,
      },
    },
  },
};

// ---------------------------------------------------------------- overrides
export const overridesSchemaV1 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://openspec-assess.local/schemas/legacy/overrides-1.schema.json',
  title: 'User overrides v1 (partial config merged onto defaults by stable IDs)',
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'schemaVersion', 'set'],
  properties: {
    ...header('overrides', 1),
    note: NON_EMPTY,
    set: { type: 'object' },
  },
};


function versionGateV1(doc, type) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return [{ path: '/', message: `${type} must be a JSON object` }];
  if (doc.kind !== KINDS[type]) return [{ path: '/kind', message: `expected "${KINDS[type]}", got ${JSON.stringify(doc.kind)}` }];
  if (doc.schemaVersion !== 1) return [{ path: '/schemaVersion', message: `legacy migration reads ${type} schemaVersion 1, got ${JSON.stringify(doc.schemaVersion)}` }];
  return null;
}

export function structuralErrorsV1(type, doc) {
  const gate = versionGateV1(doc, type);
  if (gate) return gate;
  return validateSchema(type === 'config' ? configSchemaV1 : overridesSchemaV1, doc);
}

function assertValid(label, errors) {
  if (errors.length) throw new ValidationError(label, errors);
}

// ------------------------------------------------------------------ config
export function configErrorsV1(config) {
  const errors = structuralErrorsV1('config', config);
  if (errors.length) return errors;
  const err = (path, message) => errors.push({ path, message });

  const uniq = (list, path, keyFn = (x) => x.id) => {
    const seen = new Map();
    list.forEach((x, i) => {
      const k = keyFn(x);
      if (seen.has(k)) err(`${path}/${i}/id`, `duplicate id "${k}" (also at ${path}/${seen.get(k)})`);
      seen.set(k, i);
    });
    return seen;
  };
  const harnesses = uniq(config.harnesses, '/harnesses');
  const pricing = uniq(config.pricing, '/pricing');
  const pools = uniq(config.quotaPools, '/quotaPools');
  uniq(config.models, '/models');
  const cands = new Map();
  config.models.forEach((m, i) => {
    const key = `${m.harness}/${m.modelId}`;
    if (cands.has(key)) err(`/models/${i}/modelId`, `candidate ${key} is defined twice (also /models/${cands.get(key)})`);
    cands.set(key, i);
  });

  const rules = config.complexityRules;
  for (const [q, t] of Object.entries(rules.volumeThresholds)) {
    for (let i = 1; i < t.length; i++) if (t[i] <= t[i - 1]) err(`/complexityRules/volumeThresholds/${q}/${i}`, 'thresholds must be strictly ascending');
  }
  const cats = rules.workloadCategories.map((c) => c.id);
  uniq(rules.workloadCategories, '/complexityRules/workloadCategories');
  rules.workloadCategories.forEach((c, i) => {
    if (i > 0 && c.upToBp <= rules.workloadCategories[i - 1].upToBp) err(`/complexityRules/workloadCategories/${i}/upToBp`, 'must be strictly ascending');
  });
  const last = rules.workloadCategories[rules.workloadCategories.length - 1];
  if (last && last.upToBp !== 10000) err(`/complexityRules/workloadCategories/${rules.workloadCategories.length - 1}/upToBp`, 'last category must cover 10000');
  for (const mode of ['api', 'subscription', 'timeMinutes']) {
    for (const phase of ['apply', 'verify']) {
      const map = config.workloads[mode][phase];
      for (const c of cats) if (!(c in map)) err(`/workloads/${mode}/${phase}/${c}`, 'is required for every workload category');
      for (const c of Object.keys(map)) if (!cats.includes(c)) err(`/workloads/${mode}/${phase}/${c}`, `unknown workload category "${c}"`);
      for (const c of cats) {
        const r = map[c];
        if (!r) continue;
        const val = (x) => (typeof x === 'number' ? x : Object.entries(x).filter(([k]) => k !== 'toolCalls' && k !== 'peakContextTokens').reduce((s, [, v]) => s + v, 0));
        if (val(r.low) > val(r.typical) || val(r.typical) > val(r.high)) err(`/workloads/${mode}/${phase}/${c}`, 'scenarios must satisfy low <= typical <= high');
      }
    }
  }

  for (const phase of ['apply', 'verify']) {
    const floors = config.phases[phase].qualityFloors;
    if (floors[0].fromDemandBp !== 0) err(`/phases/${phase}/qualityFloors/0/fromDemandBp`, 'first floor must start at 0');
    for (let i = 1; i < floors.length; i++) if (floors[i].fromDemandBp <= floors[i - 1].fromDemandBp) err(`/phases/${phase}/qualityFloors/${i}/fromDemandBp`, 'must be strictly ascending');
  }

  config.models.forEach((m, i) => {
    const p = `/models/${i}`;
    if (!harnesses.has(m.harness)) err(`${p}/harness`, `unknown harness "${m.harness}"`);
    const supported = new Set(m.supportedEfforts);
    (m.efforts || []).forEach((e, j) => {
      if (!supported.has(e)) err(`${p}/efforts/${j}`, `effort "${e}" is not in supportedEfforts of ${m.harness}/${m.modelId}; it is not substituted silently`);
    });
    if (m.api.pricingId !== null && !pricing.has(m.api.pricingId)) err(`${p}/api/pricingId`, `unknown pricing "${m.api.pricingId}"`);
    if (m.subscription.poolId !== null) {
      if (!pools.has(m.subscription.poolId)) err(`${p}/subscription/poolId`, `unknown quota pool "${m.subscription.poolId}"`);
      else {
        const pool = config.quotaPools[pools.get(m.subscription.poolId)];
        if (pool.harness !== m.harness) err(`${p}/subscription/poolId`, `pool "${pool.id}" belongs to harness ${pool.harness}`);
      }
    }
    for (const phase of ['apply', 'verify']) {
      const c = m.coefficients[phase];
      const checkCoef = (cp, coef) => {
        if ((coef.value === null) !== (coef.status === 'unknown')) err(cp, 'value must be null exactly when status is "unknown"');
        if (coef.status === 'measured' && !(coef.sources && coef.sources.length)) err(`${cp}/sources`, 'measured coefficient requires benchmark sources');
        if (coef.inheritedFrom && coef.status === 'measured') err(`${cp}/status`, 'an inherited coefficient cannot be measured for the new model; use proxy or user-override');
      };
      for (const f of FACTOR_IDS) checkCoef(`${p}/coefficients/${phase}/base/${f}`, c.base[f]);
      for (const e of Object.keys(c.effortDelta || {})) if (!supported.has(e)) err(`${p}/coefficients/${phase}/effortDelta/${e}`, `effort "${e}" is not supported`);
      for (const [e, map] of Object.entries(c.byEffort || {})) {
        if (!supported.has(e)) err(`${p}/coefficients/${phase}/byEffort/${e}`, `effort "${e}" is not supported`);
        for (const [f, coef] of Object.entries(map)) checkCoef(`${p}/coefficients/${phase}/byEffort/${e}/${f}`, coef);
      }
      for (const [k, sect] of [['api', m.api.usageMultiplierBp], ['subscription', m.subscription.loadMultiplierBp], ['time', m.time.multiplierBp]]) {
        for (const e of Object.keys(sect[phase])) if (!supported.has(e)) err(`${p}/${k}/${k === 'api' ? 'usageMultiplierBp' : k === 'subscription' ? 'loadMultiplierBp' : 'multiplierBp'}/${phase}/${e}`, `effort "${e}" is not supported`);
      }
    }
  });
  config.quotaPools.forEach((pool, i) => {
    if (!harnesses.has(pool.harness)) err(`/quotaPools/${i}/harness`, `unknown harness "${pool.harness}"`);
    if (pool.observation && pool.conversion && pool.observation.unit !== pool.conversion.unit) {
      err(`/quotaPools/${i}/conversion/unit`, 'conversion unit must match observation unit');
    }
  });
  return errors;
}


// ------------------------------------------------------------------ merge (v1 rules)
function deref(node) {
  let refName = null;
  while (node && node.$ref) {
    refName = node.$ref;
    node = node.$ref.slice(2).split('/').reduce((n, p) => n[p], configSchemaV1);
  }
  return { node, refName };
}

function objectBranch(node) {
  if (node.type === 'object') return node;
  if (node.anyOf) {
    for (const b of node.anyOf) {
      const { node: n } = deref(b);
      if (n.type === 'object') return n;
    }
  }
  return null;
}

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esc = (k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');

function mergeNode(schemaNode, base, over, path, ctx) {
  const { node, refName } = deref(schemaNode);
  if (isPlain(over)) {
    const obj = objectBranch(node);
    if (!obj) {
      ctx.errors.push({ path: path || '/', message: 'object given where a scalar or array is expected' });
      return base;
    }
    if (refName === '#/$defs/coefficient') return mergeCoefficient(obj, base, over, path, ctx);
    const result = isPlain(base) ? { ...base } : {};
    for (const key of Object.keys(over)) {
      const p = `${path}/${esc(key)}`;
      if (key === 'id' && isPlain(base) && base.id === over.id) continue;
      let child;
      if (obj.propertyNames && obj.propertyNames.enum && !obj.propertyNames.enum.includes(key)) {
        ctx.errors.push({ path: p, message: `unknown key "${key}"` });
        continue;
      }
      if (obj.properties && key in obj.properties) child = obj.properties[key];
      else if (obj.additionalProperties && typeof obj.additionalProperties === 'object') child = obj.additionalProperties;
      else { ctx.errors.push({ path: p, message: `unknown key "${key}"` }); continue; }
      result[key] = mergeNode(child, isPlain(base) ? base[key] : undefined, over[key], p, ctx);
    }
    return result;
  }
  if (Array.isArray(over) && Array.isArray(base) && node.type === 'array' && node.items) {
    const { node: itemNode } = deref(node.items);
    if (itemNode.type === 'object' && itemNode.properties && itemNode.properties.id) {
      const result = base.map((x) => x);
      for (const [i, item] of over.entries()) {
        if (!isPlain(item) || typeof item.id !== 'string') {
          ctx.errors.push({ path: `${path}/${i}/id`, message: 'override entries in this list are matched by "id"' });
          continue;
        }
        const idx = result.findIndex((x) => x.id === item.id);
        if (idx >= 0) result[idx] = mergeNode(node.items, result[idx], item, `${path}/${idx}`, ctx);
        else {
          result.push(clone(item));
          ctx.paths.push(`${path}/${result.length - 1}`);
        }
      }
      return result;
    }
  }
  ctx.paths.push(path || '/');
  return clone(over);
}

function mergeCoefficient(obj, base, over, path, ctx) {
  for (const key of Object.keys(over)) {
    if (!(key in obj.properties)) ctx.errors.push({ path: `${path}/${esc(key)}`, message: `unknown key "${key}"` });
  }
  const result = isPlain(base) ? { ...base } : {};
  for (const key of Object.keys(over)) if (key in obj.properties) result[key] = clone(over[key]);
  if ('value' in over && !('status' in over)) {
    result.status = over.value === null ? 'unknown' : 'user-override';
    if (!('basis' in over)) result.basis = `user override${base && base.basis ? ` (shipped basis: ${base.basis})` : ''}`;
    if (result.status === 'user-override') delete result.sources;
    delete result.inheritedFrom;
  }
  ctx.paths.push(path);
  ctx.touchedCoefficients.add(path);
  return result;
}

const downgrade = (status) => (status === 'unknown' || status === 'user-override' ? status : 'proxy');

// When an override changes modelId or harness of a catalog entry, carried-over evidence keeps
// its original identity: coefficients not explicitly overridden become proxy + inheritedFrom.
function markInherited(effective, defaults, ctx) {
  effective.models.forEach((m, i) => {
    const orig = defaults.models.find((d) => d.id === m.id);
    if (!orig || (orig.modelId === m.modelId && orig.harness === m.harness)) return;
    const from = (coef) => coef.inheritedFrom || { modelId: orig.modelId, harness: orig.harness, status: coef.status };
    for (const phase of ['apply', 'verify']) {
      const pc = m.coefficients[phase];
      const mark = (coef, p) => {
        if (ctx.touchedCoefficients.has(p) || coef.status === 'user-override') return coef;
        if (coef.status === 'unknown') return coef;
        return { ...coef, status: downgrade(coef.status), inheritedFrom: from(coef) };
      };
      const newBase = {};
      for (const f of FACTOR_IDS) newBase[f] = mark(pc.base[f], `/models/${i}/coefficients/${phase}/base/${f}`);
      pc.base = newBase;
      if (pc.byEffort) {
        for (const [e, map] of Object.entries(pc.byEffort)) {
          for (const [f, coef] of Object.entries(map)) map[f] = mark(coef, `/models/${i}/coefficients/${phase}/byEffort/${e}/${f}`);
        }
      }
      if (pc.effortDelta) {
        for (const [e, d] of Object.entries(pc.effortDelta)) {
          if (d.status === 'measured') pc.effortDelta[e] = { ...d, status: 'proxy', basis: `${d.basis} (inherited from ${orig.harness}/${orig.modelId})` };
        }
      }
    }
    if (!ctx.paths.some((p) => p.startsWith(`/models/${i}/identity`))) {
      m.identity = { ...m.identity, status: 'unconfirmed', note: `modelId/harness changed from ${orig.harness}/${orig.modelId}; identity not re-verified` };
    }
    if (!ctx.paths.some((p) => p.startsWith(`/models/${i}/clientModelId`)) && orig.modelId !== m.modelId) {
      m.clientModelId = null;
    }
  });
}

export function mergeConfigV1(defaults, overrides = null, { defaultsLabel = 'config/defaults.json' } = {}) {
  assertValid('defaults', configErrorsV1(defaults));
  const effective = clone(defaults);
  delete effective.provenance;
  const ctx = { errors: [], paths: [], touchedCoefficients: new Set() };
  let merged = effective;
  if (overrides !== null) {
    assertValid('overrides', structuralErrorsV1('overrides', overrides));
    const set = overrides.set;
    for (const k of ['kind', 'schemaVersion', 'provenance']) {
      if (k in set) ctx.errors.push({ path: `/${k}`, message: `"${k}" cannot be overridden` });
    }
    const filtered = Object.fromEntries(Object.entries(set).filter(([k]) => !['kind', 'schemaVersion', 'provenance'].includes(k)));
    merged = mergeNode(configSchemaV1, effective, filtered, '', ctx);
    if (ctx.errors.length) throw new ValidationError('overrides', ctx.errors.map((e) => ({ path: `/set${e.path}`, message: e.message })));
    markInherited(merged, defaults, ctx);
  }
  merged.provenance = { defaults: defaultsLabel, overridePaths: [...new Set(ctx.paths)].sort() };
  assertValid('effective config', configErrorsV1(merged));
  return merged;
}

// Builds an overrides document that turns `defaults` into `edited` (used by the configurator export).
function diffToOverridesV1Unused(defaults, edited, note) {
  const set = diffNode(configSchemaV1, defaults, edited);
  return { kind: 'openspec-assess.overrides', schemaVersion: 1, ...(note ? { note } : {}), set: set || {} };
}

function diffNode(schemaNode, a, b) {
  if (canonicalStringify(a === undefined ? null : a) === canonicalStringify(b === undefined ? null : b) && a !== undefined) return undefined;
  const { node, refName } = deref(schemaNode);
  if (isPlain(a) && isPlain(b) && refName !== '#/$defs/coefficient') {
    const obj = objectBranch(node);
    if (obj) {
      const out = {};
      for (const key of Object.keys(b)) {
        if (key === 'provenance') continue;
        const child = (obj.properties && obj.properties[key]) || (typeof obj.additionalProperties === 'object' ? obj.additionalProperties : true);
        const d = child === true ? (canonicalStringify(a[key] ?? null) === canonicalStringify(b[key]) && key in a ? undefined : b[key]) : diffNode(child, a[key], b[key]);
        if (d !== undefined) out[key] = d;
      }
      return Object.keys(out).length ? out : undefined;
    }
  }
  if (Array.isArray(a) && Array.isArray(b) && node.type === 'array' && node.items) {
    const { node: itemNode } = deref(node.items);
    if (itemNode.type === 'object' && itemNode.properties && itemNode.properties.id) {
      const out = [];
      for (const item of b) {
        const prev = a.find((x) => x.id === item.id);
        if (!prev) { out.push(item); continue; }
        const d = diffNode(node.items, prev, item);
        if (d !== undefined) out.push({ id: item.id, ...d });
      }
      return out.length ? out : undefined;
    }
  }
  if (refName === '#/$defs/coefficient' && isPlain(a) && isPlain(b)) {
    return canonicalStringify(a) === canonicalStringify(b) ? undefined : clone(b);
  }
  return clone(b);
}

// v1 resolution of the coefficient used for (phase, effort, factor): byEffort first, otherwise
// clamp(base + effortDelta, 0, 10000); an unknown base stays unknown; a missing delta counts as 0.
export function resolveCoefficientV1(model, phase, effort, factor) {
  const pc = model.coefficients[phase];
  const direct = pc.byEffort && pc.byEffort[effort] && pc.byEffort[effort][factor];
  if (direct) return { rule: 'byEffort', value: direct.value, entry: direct, base: null, delta: null };
  const base = pc.base[factor];
  const delta = pc.effortDelta && pc.effortDelta[effort] ? pc.effortDelta[effort] : null;
  const raw = base.value === null ? null : base.value + (delta ? delta.deltaBp : 0);
  const value = raw === null ? null : Math.min(10000, Math.max(0, raw));
  return { rule: 'base+delta', value, entry: null, base, delta, clamped: raw !== null && raw !== value };
}
