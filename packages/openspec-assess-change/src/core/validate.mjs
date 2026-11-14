// Structural + semantic validation (pure). Filesystem-dependent checks (existence, digests,
// artifact completeness, task IDs) live in src/node/evidence.mjs.
import { validateSchema, ValidationError } from './jsonschema.mjs';
import {
  profileSchema, configSchema, benchmarksSchema, overridesSchema, manifestSchema, latestSchema, reportSchema, KINDS, SCHEMA_VERSIONS,
} from './schemas.mjs';
import { FACTOR_IDS, JUDGMENT_FACTORS, QUANTITY_IDS } from './factors.mjs';
import { compareCodeUnits } from './canonical.mjs';

function versionGate(doc, type, label) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return [{ path: '/', message: `${label} must be a JSON object` }];
  }
  if (doc.kind !== KINDS[type]) {
    return [{ path: '/kind', message: `expected "${KINDS[type]}", got ${JSON.stringify(doc.kind)}` }];
  }
  if ((type === 'config' || type === 'overrides') && (doc.schemaVersion === 1 || doc.schemaVersion === 2)) {
    const what = doc.schemaVersion === 1 ? 'base + effortDelta, weighted utility' : 'explicit per-effort records, weighted utility';
    return [{
      path: '/schemaVersion',
      message: `${type} schemaVersion ${doc.schemaVersion} (${what}) needs an explicit format migration to schemaVersion ${SCHEMA_VERSIONS[type]}: run "openspec-assess migrate-config" (keeps the legacy weighted-utility policy and its numbers), then "openspec-assess switch-policy" to adopt minimum-resource-with-time-penalty. Old documents are not reinterpreted silently.`,
    }];
  }
  if (doc.schemaVersion !== SCHEMA_VERSIONS[type]) {
    return [{
      path: '/schemaVersion',
      message: `unsupported ${type} schemaVersion ${JSON.stringify(doc.schemaVersion)}; this evaluator supports ${SCHEMA_VERSIONS[type]}. Install a package release that supports it; the document is not interpreted as the current version.`,
    }];
  }
  return null;
}

const SCHEMAS = {
  profile: profileSchema,
  config: configSchema,
  benchmarks: benchmarksSchema,
  overrides: overridesSchema,
  manifest: manifestSchema,
  latest: latestSchema,
  report: reportSchema,
};

export function structuralErrors(type, doc, label = type) {
  const gate = versionGate(doc, type, label);
  if (gate) return gate;
  return validateSchema(SCHEMAS[type], doc);
}

// ------------------------------------------------------------------ profile
export function profileErrors(profile) {
  const errors = structuralErrors('profile', profile);
  if (errors.length) return errors;
  const err = (path, message) => errors.push({ path, message });

  const byId = new Map();
  profile.evidence.forEach((e, i) => {
    const p = `/evidence/${i}`;
    if (byId.has(e.id)) err(`${p}/id`, `duplicate evidence id "${e.id}"`);
    byId.set(e.id, { ...e, index: i });
    if (e.path !== undefined && e.base === undefined) err(`${p}/base`, 'is required when path is set');
    if (['artifact', 'requirement', 'task'].includes(e.kind)) {
      if (e.path === undefined) err(`${p}/path`, `is required for ${e.kind} evidence`);
      if (e.base !== undefined && e.base !== 'change') err(`${p}/base`, `${e.kind} evidence is relative to the change root ("change")`);
    }
    if (['requirement', 'task'].includes(e.kind) && e.locator === undefined) {
      err(`${p}/locator`, `is required for ${e.kind} evidence (requirement name or task id)`);
    }
    if (['file', 'check-result'].includes(e.kind)) {
      if (e.path === undefined) err(`${p}/path`, `is required for ${e.kind} evidence`);
      if (e.base !== undefined && e.base !== 'repo') err(`${p}/base`, `${e.kind} evidence is relative to the repository root ("repo")`);
    }
    if (e.kind === 'diff') {
      if (e.revision === undefined) err(`${p}/revision`, 'diff evidence requires the base revision (git diff <revision>)');
      if (e.path !== undefined) err(`${p}/path`, 'diff evidence is identified by revision, not path');
      if (e.digest === undefined) err(`${p}/digest`, 'diff evidence requires the digest of the diff (use pin-evidence)');
    }
    if (e.planned === true) {
      if (e.kind !== 'file') err(`${p}/planned`, 'only file evidence can be planned');
      if (e.digest !== undefined) err(`${p}/digest`, 'a planned (not yet existing) file cannot have a digest');
      if (!e.derivedFrom) err(`${p}/derivedFrom`, 'planned file must reference the task or requirement it follows from');
    } else {
      if (e.derivedFrom !== undefined) err(`${p}/derivedFrom`, 'only planned evidence uses derivedFrom');
      if (e.path !== undefined && e.digest === undefined) {
        err(`${p}/digest`, 'existing local evidence requires a digest (use pin-evidence to fill it)');
      }
    }
  });
  profile.evidence.forEach((e, i) => {
    for (const [j, ref] of (e.derivedFrom || []).entries()) {
      const target = byId.get(ref);
      if (!target) err(`/evidence/${i}/derivedFrom/${j}`, `unknown evidence id "${ref}"`);
      else if (target.planned === true || !['task', 'requirement', 'artifact'].includes(target.kind)) {
        err(`/evidence/${i}/derivedFrom/${j}`, `must reference existing task, requirement or artifact evidence, got ${target.kind}${target.planned ? ' (planned)' : ''}`);
      }
    }
  });

  const checkRefs = (path, refs) => {
    const list = [];
    for (const [j, ref] of (refs || []).entries()) {
      const target = byId.get(ref);
      if (!target) err(`${path}/${j}`, `unknown evidence id "${ref}"`);
      else list.push(target);
    }
    return list;
  };

  for (const q of QUANTITY_IDS) {
    const v = profile.quantities[q];
    const p = `/quantities/${q}`;
    if (v.state === 'known') {
      for (const f of ['kind', 'min', 'max', 'rationale', 'evidence']) if (v[f] === undefined) err(`${p}/${f}`, 'is required for a known quantity');
      if (v.min !== undefined && v.max !== undefined && v.min > v.max) err(`${p}/max`, 'must be >= min');
      const refs = checkRefs(`${p}/evidence`, v.evidence);
      if (v.kind === 'measured') {
        if (v.min !== v.max) err(`${p}/max`, 'a measured quantity is exact (min == max); use estimated for ranges');
        if (refs.length && refs.every((r) => r.planned)) err(`${p}/evidence`, 'measured value needs measurement evidence, not planned files');
        if (['files', 'diffLines', 'generatedFiles'].includes(q) && !refs.some((r) => ['diff', 'check-result'].includes(r.kind))) {
          err(`${p}/evidence`, `measured ${q} requires diff or check-result evidence`);
        }
      }
    } else {
      for (const f of ['kind', 'min', 'max']) if (v[f] !== undefined) err(`${p}/${f}`, `must be absent when state is ${v.state}`);
      if (v.state === 'not-applicable' && v.rationale === undefined) err(`${p}/rationale`, 'not-applicable requires a rationale');
      checkRefs(`${p}/evidence`, v.evidence);
    }
  }

  for (const f of JUDGMENT_FACTORS) {
    const v = profile.factors[f];
    const p = `/factors/${f}`;
    if (v.state === 'known') {
      for (const k of ['level', 'kind', 'rationale', 'evidence']) if (v[k] === undefined) err(`${p}/${k}`, 'is required for a known factor');
      const refs = checkRefs(`${p}/evidence`, v.evidence);
      if (v.kind === 'measured' && refs.some((r) => r.planned)) err(`${p}/kind`, 'a level based on planned files is a forecast, not measured');
    } else {
      for (const k of ['level', 'kind']) if (v[k] !== undefined) err(`${p}/${k}`, `must be absent when state is ${v.state}`);
      if (v.state === 'not-applicable' && v.rationale === undefined) err(`${p}/rationale`, 'not-applicable requires a rationale');
      checkRefs(`${p}/evidence`, v.evidence);
    }
    if (v.details) {
      const allowed = { domains: ['domainIds', 'links', 'tags'], layers: ['layerCategories', 'boundaryCrossings', 'tags'] }[f] || ['tags'];
      for (const k of Object.keys(v.details)) if (!allowed.includes(k)) err(`${p}/details/${k}`, `not allowed for factor ${f}`);
    }
  }

  if (profile.scope.mode === 'tasks' && !profile.scope.taskIds) err('/scope/taskIds', 'is required when mode is "tasks"');
  if (profile.scope.mode === 'all-tasks' && profile.scope.taskIds) err('/scope/taskIds', 'must be absent when mode is "all-tasks"');
  if (profile.stage === 'planning' && profile.previousAssessmentId !== undefined) err('/previousAssessmentId', 'only verification profiles reference a previous assessment');
  if (profile.stage === 'verification' && !profile.evidence.some((e) => e.kind === 'diff')) {
    err('/evidence', 'verification profile must link the actual diff (diff evidence)');
  }
  return errors;
}

// Semantic rules of one estimate record (quality or resource) and of its kept origin.
function checkRecord(path, rec, err) {
  if (!rec) return;
  const one = (pp, x) => {
    if ((x.value === null) !== (x.status === 'unknown')) err(`${pp}/value`, 'value must be null exactly when status is "unknown"');
    const hasSources = Array.isArray(x.sources) && x.sources.length > 0;
    if ((x.status === 'measured' || x.status === 'proxy') && !hasSources) err(`${pp}/sources`, `${x.status} requires the benchmark records the number is derived from`);
    if (!(x.status === 'measured' || x.status === 'proxy') && x.sources !== undefined) {
      err(`${pp}/sources`, `"sources" derive the number and are only allowed for measured or proxy; list evidence that merely supports a ${x.status} value under "support"`);
    }
    if (x.inheritedFrom && x.status === 'measured') err(`${pp}/status`, 'an inherited value cannot be measured for the new model');
  };
  one(path, rec);
  if (rec.origin) {
    one(`${path}/origin`, rec.origin);
    if (rec.status !== 'user-override' && rec.status !== 'unknown') err(`${path}/origin`, 'origin is kept only for a user-override or a user-set unknown');
  }
}

// ------------------------------------------------------------------ config
export function configErrors(config) {
  const errors = structuralErrors('config', config);
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
    const r = m.resources;
    if (r.api.pricingId !== null && !pricing.has(r.api.pricingId)) err(`${p}/resources/api/pricingId`, `unknown pricing "${r.api.pricingId}"`);
    if (r.subscription.poolId !== null) {
      if (!pools.has(r.subscription.poolId)) err(`${p}/resources/subscription/poolId`, `unknown quota pool "${r.subscription.poolId}"`);
      else {
        const pool = config.quotaPools[pools.get(r.subscription.poolId)];
        if (pool.harness !== m.harness) err(`${p}/resources/subscription/poolId`, `pool "${pool.id}" belongs to harness ${pool.harness}`);
      }
    }
    // Every supported effort has an explicit record for both phases (and every factor); no other effort.
    const tables = [
      ['quality', (phase) => m.quality[phase], true],
      ['resources/api/usage', (phase) => r.api.usage[phase], false],
      ['resources/subscription/load', (phase) => r.subscription.load[phase], false],
      ['resources/time/minutes', (phase) => r.time.minutes[phase], false],
    ];
    for (const [name, get, isQuality] of tables) {
      for (const phase of ['apply', 'verify']) {
        const t = get(phase);
        const tp = `${p}/${name}/${phase}`;
        for (const e of m.supportedEfforts) if (!(e in t)) err(`${tp}/${e}`, `missing explicit ${isQuality ? 'quality' : 'resource'} records for supported effort "${e}" (use status "unknown" with value null when there is no data; values are never inherited from another effort)`);
        for (const e of Object.keys(t)) {
          if (!supported.has(e)) { err(`${tp}/${e}`, `effort "${e}" is not in supportedEfforts`); continue; }
          if (isQuality) for (const f of FACTOR_IDS) checkRecord(`${tp}/${e}/${f}`, t[e][f], err);
          else checkRecord(`${tp}/${e}`, t[e], err);
        }
      }
    }
  });
  const sel = config.selection;
  for (const mode of ['api', 'subscription']) {
    const m = sel[mode];
    if (sel.policy === 'minimum-resource-with-time-penalty') {
      if (!m.timePenalty) err(`/selection/${mode}/timePenalty`, 'is required by policy minimum-resource-with-time-penalty');
      for (const k of ['weights', 'anchors']) {
        if (m[k] !== undefined) err(`/selection/${mode}/${k}`, `belongs to the legacy weighted-utility policy and would have no effect under minimum-resource-with-time-penalty; remove it (old weights/anchors are never applied silently)`);
      }
    } else {
      for (const k of ['weights', 'anchors']) if (m[k] === undefined) err(`/selection/${mode}/${k}`, 'is required by the legacy weighted-utility policy');
      if (m.timePenalty !== undefined) err(`/selection/${mode}/timePenalty`, 'is used only by minimum-resource-with-time-penalty; switch the policy explicitly (openspec-assess switch-policy)');
    }
  }
  config.quotaPools.forEach((pool, i) => {
    if (!harnesses.has(pool.harness)) err(`/quotaPools/${i}/harness`, `unknown harness "${pool.harness}"`);
    if (pool.observation && pool.conversion && pool.observation.unit !== pool.conversion.unit) {
      err(`/quotaPools/${i}/conversion/unit`, 'conversion unit must match observation unit');
    }
  });
  return errors;
}

// ------------------------------------------------------------------ benchmarks
function measurementKey(r) {
  return [r.benchmark.name, r.benchmark.version, r.model.modelId, r.model.harness, r.model.effort, r.metric].join('\u0000');
}

export function benchmarksErrors(bench) {
  const errors = structuralErrors('benchmarks', bench);
  if (errors.length) return errors;
  const err = (path, message) => errors.push({ path, message });
  const ids = new Map();
  const keys = new Map();
  bench.records.forEach((r, i) => {
    if (ids.has(r.id)) err(`/records/${i}/id`, `duplicate record id "${r.id}"`);
    ids.set(r.id, i);
    const k = measurementKey(r);
    if (keys.has(k)) err(`/records/${i}`, `duplicates measurement of /records/${keys.get(k)} (same benchmark version, model, harness, effort and metric); one measurement must not gain weight by repetition`);
    keys.set(k, i);
  });
  const mids = new Map();
  const mkeys = new Map();
  bench.mappings.forEach((m, i) => {
    if (mids.has(m.id)) err(`/mappings/${i}/id`, `duplicate mapping id "${m.id}"`);
    mids.set(m.id, i);
    const k = [m.benchmark.name, m.benchmark.version, m.metric, m.phase, m.factor].join('\u0000');
    if (mkeys.has(k)) err(`/mappings/${i}`, `duplicates mapping /mappings/${mkeys.get(k)}`);
    mkeys.set(k, i);
  });
  return errors;
}

// Every estimate record (and kept origin) that cites benchmark records, as [path, record, phase, factor|null, effort, model].
export function estimateRecords(config) {
  const out = [];
  config.models.forEach((model, i) => {
    for (const phase of ['apply', 'verify']) {
      for (const [effort, row] of Object.entries(model.quality[phase])) {
        for (const factor of FACTOR_IDS) {
          const rec = row[factor];
          const p = `/models/${i}/quality/${phase}/${effort}/${factor}`;
          out.push([p, rec, phase, factor, effort, model]);
          if (rec.origin) out.push([`${p}/origin`, rec.origin, phase, factor, effort, model]);
        }
      }
      for (const [name, table] of [['api/usage', model.resources.api.usage], ['subscription/load', model.resources.subscription.load], ['time/minutes', model.resources.time.minutes]]) {
        for (const [effort, rec] of Object.entries(table[phase])) {
          const p = `/models/${i}/resources/${name}/${phase}/${effort}`;
          out.push([p, rec, phase, null, effort, model]);
          if (rec.origin) out.push([`${p}/origin`, rec.origin, phase, null, effort, model]);
        }
      }
    }
  });
  return out;
}

// Provenance of each number against the benchmark snapshot. measured: an independent record of the
// exact candidate and effort with a direct mapping; proxy: an explicit mapping from a related record;
// support: records must exist but do not derive the number (a general ranking stays heuristic).
export function provenanceErrors(config, bench) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });
  const records = new Map(bench.records.map((r) => [r.id, r]));
  const findMapping = (r, phase, factor) => bench.mappings.find((m) => m.benchmark.name === r.benchmark.name
    && m.benchmark.version === r.benchmark.version && m.metric === r.metric && m.phase === phase && m.factor === factor);
  for (const [path, rec, phase, factor, effort, model] of estimateRecords(config)) {
    for (const [j, id] of (rec.support || []).entries()) if (!records.has(id)) err(`${path}/support/${j}`, `unknown benchmark record "${id}"`);
    const srcs = [];
    for (const [j, id] of (rec.sources || []).entries()) {
      const r = records.get(id);
      if (!r) { err(`${path}/sources/${j}`, `unknown benchmark record "${id}"`); continue; }
      srcs.push(r);
      if (factor === null) {
        if (rec.status === 'measured' && (r.model.modelId !== model.modelId || r.model.harness !== model.harness || r.model.effort !== effort || r.source.kind !== 'independent')) {
          err(`${path}/status`, `record "${id}" is not an independent measurement of ${model.harness}/${model.modelId} at effort ${effort}; label it proxy or heuristic`);
        }
        continue;
      }
      const mapping = findMapping(r, phase, factor);
      if (!mapping) {
        err(`${path}/sources/${j}`, `no mapping from ${r.benchmark.name} ${r.benchmark.version} (${r.metric}) to ${phase}/${factor}; incompatible benchmark sets need an explicit mapping`);
        continue;
      }
      if (rec.status === 'measured') {
        if (r.source.kind !== 'independent') err(`${path}/status`, `record "${id}" is a provider claim, not an independent measurement`);
        if (mapping.relation !== 'direct') err(`${path}/status`, `mapping "${mapping.id}" is a proxy; label the value proxy`);
        if (r.model.modelId !== model.modelId || r.model.harness !== model.harness) err(`${path}/status`, `record "${id}" measures ${r.model.harness}/${r.model.modelId}, not this candidate; label it proxy`);
        if (r.model.effort !== effort) err(`${path}/status`, `record "${id}" was measured at effort ${r.model.effort}, not ${effort}`);
      }
    }
    const seen = new Map();
    srcs.forEach((r) => {
      const k = measurementKey(r);
      if (seen.has(k)) err(`${path}/sources`, `records "${seen.get(k)}" and "${r.id}" are the same measurement`);
      seen.set(k, r.id);
    });
  }
  return errors;
}

export function assertValid(label, errors) {
  if (errors.length) throw new ValidationError(label, errors.sort((a, b) => compareCodeUnits(a.path, b.path)));
}

export { ValidationError };
