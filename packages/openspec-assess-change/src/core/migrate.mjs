// Explicit format migrations of working configurations to config schema 3, and the separate, explicit
// switch of the selection policy. Both run only on request (`openspec-assess migrate-config`,
// `openspec-assess switch-policy`), return a new document for review/export and never touch assessment
// runs, manifests or latest.json.
//
// Format migration keeps the selection rule: the result uses the legacy policy "weighted-utility" with
// the old weights and anchors, so scores, resources, efforts and order stay as they were.
//   v1 (base + effortDelta, optional byEffort) → explicit per-effort records → schema 3 (legacy policy)
//   v2 (explicit per-effort records)            → schema 3 (legacy policy)
// The policy switch (weighted-utility → minimum-resource-with-time-penalty) is a deliberate change of
// the ranking rule: estimates, resources, constraints and availability are kept; the old weights/anchors
// are removed (never left silently active) and the time penalty starts at g = 30, s = 30, k = 0.05.
//
// Rules (identical numbers for unchanged meaning):
//   1. Rebuild the v1 effective config from the chosen v1 defaults and overrides by the v1 rules.
//   2. For every supported effort: a direct byEffort record wins; otherwise clamp(base + delta, 0, 10000);
//      an unknown base stays unknown; a missing delta counts as 0.
//   3. Provenance: a byEffort record keeps its status; base + 0 keeps the base status; base + a non-zero
//      delta is a composite → "heuristic" (or "user-override" when both parts were user-set). The v1
//      inputs are kept verbatim in `migratedFrom`. Nothing becomes measured or proxy by migrating.
//   4. Resource multipliers become per-effort records (heuristic, or user-override when overridden);
//      prices, pools, constraints, weights, enabled/allowed efforts and preferences are copied.
import { FACTOR_IDS } from './factors.mjs';
import { clone } from './canonical.mjs';
import { RESOURCE_UNITS, KINDS, SCHEMA_VERSIONS, DEFAULT_TIME_PENALTY } from './schemas.mjs';
import { mergeConfig } from './config-merge.mjs';
import { POLICY_ID, LEGACY_POLICY_ID, POLICY_VERSION } from './policy.mjs';
import { configErrors, assertValid } from './validate.mjs';
import { mergeConfigV1, resolveCoefficientV1 } from './legacy/v1.mjs';

const DERIVING = new Set(['measured', 'proxy']);

function provenanceFields(src, status) {
  const out = {};
  const ids = [...(src.sources || [])];
  if (ids.length) {
    if (DERIVING.has(status)) out.sources = ids;
    else out.support = ids;
  }
  if (src.inheritedFrom) out.inheritedFrom = clone(src.inheritedFrom);
  return out;
}

function migrateQuality(model, phase, effort, factor, recordsById) {
  const r = resolveCoefficientV1(model, phase, effort, factor);
  if (r.rule === 'byEffort') {
    const e = r.entry;
    const status = e.value === null ? 'unknown' : e.status;
    return {
      value: e.value,
      status,
      basis: `migrated from v1 byEffort.${effort}.${factor}: ${e.basis}`,
      ...provenanceFields(e, status),
      migratedFrom: { fromSchemaVersion: 1, rule: 'byEffort', entry: clone(e), note: `v1 direct record for effort ${effort} (highest priority in v1)` },
    };
  }
  const { base, delta, value, clamped } = r;
  const deltaBp = delta ? delta.deltaBp : 0;
  let status;
  if (value === null) status = 'unknown';
  else if (deltaBp === 0) status = base.status;
  else if (base.status === 'user-override' && delta && delta.status === 'user-override') status = 'user-override';
  else status = 'heuristic';
  // A measurement at another effort is not a measurement of this effort.
  if (status === 'measured' && (base.sources || []).some((id) => recordsById.get(id) && recordsById.get(id).model.effort !== effort)) status = 'proxy';
  const deltaText = delta ? `${deltaBp >= 0 ? '+' : ''}${deltaBp} (${delta.status}: ${delta.basis})` : '+0 (no v1 delta for this effort)';
  const basis = value === null
    ? `migrated from v1: base is unknown (${base.basis}); stays unknown`
    : `migrated from v1: base ${base.value} (${base.status}: ${base.basis}) ${deltaText} = ${value}${clamped ? ' after clamping to 0..10000' : ''}`;
  const migratedFrom = { fromSchemaVersion: 1, rule: 'base+delta', base: clone(base), clamped: Boolean(clamped), note: `v1 rule clamp(base + effortDelta.${effort}) for ${phase}/${factor}` };
  if (delta) migratedFrom.effortDelta = clone(delta);
  return { value, status, basis, ...provenanceFields(base, status), migratedFrom };
}

function migrateResource(oldTable, phase, effort, overridden, oldBasis, what) {
  const v = oldTable && oldTable[phase] && oldTable[phase][effort];
  const value = v === undefined ? null : v;
  const status = value === null ? 'unknown' : (overridden ? 'user-override' : 'heuristic');
  return {
    value,
    status,
    basis: value === null
      ? `migrated from v1: no ${what} for ${phase}/${effort}; stays unknown`
      : `migrated from v1 ${what} ${phase}/${effort} = ${value}${overridden ? ' (user override in v1)' : ''}; v1 basis: ${oldBasis || 'not stated'}`,
    migratedFrom: { fromSchemaVersion: 1, rule: 'resource', note: `v1 per-phase/effort ${what} multiplier` },
  };
}

export function migrateConfigV1({ defaults, overrides = null, benchmarks = null, label = 'v1 defaults' }) {
  const v1 = mergeConfigV1(defaults, overrides, { defaultsLabel: label });
  const overridePaths = v1.provenance.overridePaths;
  const touched = (prefix) => overridePaths.some((p) => p === prefix || p.startsWith(`${prefix}/`) || prefix.startsWith(`${p}/`));
  const recordsById = new Map((benchmarks ? benchmarks.records : []).map((r) => [r.id, r]));
  const stats = { models: 0, records: 0, byEffort: 0, baseDelta: 0, clamped: 0, unknown: 0, composite: 0 };

  const models = v1.models.map((m, i) => {
    stats.models += 1;
    const quality = { apply: {}, verify: {} };
    for (const phase of ['apply', 'verify']) {
      for (const e of m.supportedEfforts) {
        quality[phase][e] = {};
        for (const f of FACTOR_IDS) {
          const rec = migrateQuality(m, phase, e, f, recordsById);
          quality[phase][e][f] = rec;
          stats.records += 1;
          if (rec.migratedFrom.rule === 'byEffort') stats.byEffort += 1; else stats.baseDelta += 1;
          if (rec.migratedFrom.clamped) stats.clamped += 1;
          if (rec.value === null) stats.unknown += 1;
          if (rec.migratedFrom.rule === 'base+delta' && rec.migratedFrom.effortDelta && rec.migratedFrom.effortDelta.deltaBp !== 0 && rec.value !== null) stats.composite += 1;
        }
      }
    }
    const table = (old, basis, kind, what, path) => {
      const out = { unit: RESOURCE_UNITS[kind], apply: {}, verify: {} };
      for (const phase of ['apply', 'verify']) {
        for (const e of m.supportedEfforts) out[phase][e] = migrateResource(old, phase, e, touched(`/models/${i}/${path}/${phase}/${e}`) || touched(`/models/${i}/${path}/${phase}`), basis, what);
      }
      return out;
    };
    const out = {
      id: m.id,
      family: m.family,
      displayName: m.displayName,
      modelId: m.modelId,
      harness: m.harness,
      clientModelId: m.clientModelId,
      enabled: m.enabled,
      availability: m.availability,
      supportedEfforts: [...m.supportedEfforts],
      contextWindowTokens: m.contextWindowTokens,
      capabilities: m.capabilities === null ? null : [...m.capabilities],
      identity: clone(m.identity),
      quality,
      resources: {
        api: { pricingId: m.api.pricingId, usage: table(m.api.usageMultiplierBp, m.api.basis, 'usage', 'api.usageMultiplierBp', 'api/usageMultiplierBp') },
        subscription: { poolId: m.subscription.poolId, load: table(m.subscription.loadMultiplierBp, m.subscription.basis, 'load', 'subscription.loadMultiplierBp', 'subscription/loadMultiplierBp') },
        time: { minutes: table(m.time.multiplierBp, m.time.basis, 'minutes', 'time.multiplierBp', 'time/multiplierBp') },
      },
    };
    if (m.efforts) out.efforts = [...m.efforts];
    return out;
  });

  const config = {
    kind: KINDS.config,
    schemaVersion: SCHEMA_VERSIONS.config,
    catalog: clone(v1.catalog),
    complexityRules: clone(v1.complexityRules),
    phases: clone(v1.phases),
    workloads: clone(v1.workloads),
    harnesses: clone(v1.harnesses),
    models,
    pricing: clone(v1.pricing),
    quotaPools: clone(v1.quotaPools),
    constraints: clone(v1.constraints),
    selection: legacySelection(v1.selection),
  };
  assertValid('migrated config', configErrors(config));
  return { config, stats, v1OverridePaths: overridePaths };
}

function legacySelection(sel) {
  return {
    policy: LEGACY_POLICY_ID,
    policyVersion: POLICY_VERSION,
    api: { currency: sel.api.currency, weights: clone(sel.api.weights), anchors: clone(sel.api.anchors) },
    subscription: { weights: clone(sel.subscription.weights), anchors: clone(sel.subscription.anchors) },
    basis: `${sel.basis} (legacy weighted-utility policy kept by the format migration; switch explicitly with openspec-assess switch-policy)`,
  };
}

// v2 documents differ from schema 3 only by the missing selection policy: the v2 merge rules are the
// schema-3 rules. Defaults and overrides are lifted to schema 3 under the legacy policy and merged.
function liftV2(doc, label) {
  if (!doc || doc.schemaVersion !== 2) throw new RangeError(`${label}: expected schemaVersion 2, got ${doc && doc.schemaVersion}`);
  const out = clone(doc);
  out.schemaVersion = SCHEMA_VERSIONS[doc.kind === KINDS.overrides ? 'overrides' : 'config'];
  if (doc.kind === KINDS.config) out.selection = legacySelection(doc.selection);
  return out;
}

export function migrateConfigV2({ defaults, overrides = null, label = 'v2 defaults' }) {
  const merged = mergeConfig(liftV2(defaults, 'v2 defaults'), overrides ? liftV2(overrides, 'v2 overrides') : null, { defaultsLabel: label });
  const overridePaths = merged.provenance.overridePaths;
  delete merged.provenance;
  assertValid('migrated config', configErrors(merged));
  return { config: merged, stats: { models: merged.models.length, fromSchemaVersion: 2 }, v2OverridePaths: overridePaths };
}

// Explicit policy switch on a schema-3 working config.
export function switchPolicy(config, { timePenalty = DEFAULT_TIME_PENALTY } = {}) {
  if (config.selection.policy === POLICY_ID) return { config: clone(config), changed: false, previous: null };
  const next = clone(config);
  delete next.provenance;
  const prev = config.selection;
  next.selection = {
    policy: POLICY_ID,
    policyVersion: POLICY_VERSION,
    api: { currency: prev.api.currency, timePenalty: clone(timePenalty) },
    subscription: { timePenalty: clone(timePenalty) },
    basis: `Switched explicitly from ${prev.policy} (API weights q${prev.api.weights.quality}/e${prev.api.weights.economy}/t${prev.api.weights.time}, anchors ${prev.api.anchors.costMicros} micros/${prev.api.anchors.timeMinutes} min; subscription weights q${prev.subscription.weights.quality}/e${prev.subscription.weights.economy}/t${prev.subscription.weights.time}, anchors ${prev.subscription.anchors.load} load/${prev.subscription.anchors.timeMinutes} min). Those weights and anchors no longer apply; the ranking rule is minimum-resource-with-time-penalty with g = ${timePenalty.graceMinutes} min, s = ${timePenalty.intervalMinutes} min, k = ${timePenalty.rateBp / 100} %.`,
  };
  assertValid('switched config', configErrors(next));
  return { config: next, changed: true, previous: { policy: prev.policy, api: { weights: prev.api.weights, anchors: prev.api.anchors }, subscription: { weights: prev.subscription.weights, anchors: prev.subscription.anchors } } };
}
