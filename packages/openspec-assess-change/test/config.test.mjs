import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeConfig, diffToOverrides, evaluate, configErrors, provenanceErrors, benchmarksErrors, ValidationError, FACTOR_IDS, canonicalStringify,
} from '../src/core/index.mjs';
import { clone } from '../src/core/canonical.mjs';
import { defaults, benchmarks, criticalProfile } from './helpers.mjs';

const ov = (set) => ({ kind: 'openspec-assess.overrides', schemaVersion: 3, set });
const q = (cfg, id, phase, effort, factor) => cfg.models.find((m) => m.id === id).quality[phase][effort][factor];
const setQ = (phase, effort, factor, rec) => ({ quality: { [phase]: { [effort]: { [factor]: rec } } } });

test('merge order defaults → overrides keeps explicit 0 and false', () => {
  const eff = mergeConfig(defaults(), ov({
    phases: { apply: { relevanceWeights: { logic: 0 } } },
    models: [{ id: 'codex.luna', enabled: false }],
  }));
  assert.equal(eff.phases.apply.relevanceWeights.logic, 0);
  assert.equal(eff.phases.apply.relevanceWeights.architecture, 3, 'absent keys inherit');
  assert.equal(eff.models.find((m) => m.id === 'codex.luna').enabled, false);
  assert.deepEqual(eff.provenance.overridePaths, ['/models/3/enabled', '/phases/apply/relevanceWeights/logic']);
  const r = evaluate({ profile: criticalProfile(), config: eff, benchmarks: benchmarks() });
  assert.ok(!r.rankings['apply/api'].relevance.find((x) => x.factor === 'logic').relevance);
  assert.ok(r.rankings['verify/api'].relevance.find((x) => x.factor === 'logic').relevance > 0);
});

test('9.1 an explicit 0 estimate is a value, not unknown and not replaced by a default', () => {
  const eff = mergeConfig(defaults(), ov({ models: [{ id: 'codex.sol', ...setQ('apply', 'high', 'logic', { value: 0, basis: 'fails on this code base' }) }] }));
  const r = q(eff, 'codex.sol', 'apply', 'high', 'logic');
  assert.equal(r.value, 0);
  assert.equal(r.status, 'user-override');
});

test('unknown override keys are reported, never ignored', () => {
  assert.throws(() => mergeConfig(defaults(), ov({ phases: { apply: { relevanceWeights: { logik: 2 } } } })),
    (e) => e instanceof ValidationError && e.errors.some((x) => x.path === '/set/phases/apply/relevanceWeights/logik'));
  assert.throws(() => mergeConfig(defaults(), ov({ selection: { api: { weight: {} } } })),
    (e) => e.errors.some((x) => x.path === '/set/selection/api/weight'));
  assert.throws(() => mergeConfig(defaults(), ov({ kind: 'x' })), (e) => e.errors.some((x) => x.path === '/set/kind'));
  assert.throws(() => mergeConfig(defaults(), ov({ models: [{ id: 'codex.sol', ...setQ('apply', 'high', 'logik', { value: 1 }) }] })),
    (e) => e.errors.some((x) => /logik/.test(x.path)));
});

test('9.1 v1 config/overrides are refused with a migration hint, not reinterpreted', () => {
  const v1 = { kind: 'openspec-assess.overrides', schemaVersion: 1, set: {} };
  assert.throws(() => mergeConfig(defaults(), v1), (e) => e.errors.some((x) => /migrate-config/.test(x.message)));
  const d = defaults();
  d.schemaVersion = 1;
  assert.ok(configErrors(d).some((x) => /explicit format migration/.test(x.message)));
  const d2 = defaults();
  d2.schemaVersion = 2;
  assert.ok(configErrors(d2).some((x) => /explicit format migration/.test(x.message) && /switch-policy/.test(x.message)), 'v2 documents need the format migration too');
  assert.throws(() => mergeConfig(defaults(), { kind: 'openspec-assess.overrides', schemaVersion: 2, set: {} }), (e) => e.errors.some((x) => /migrate-config/.test(x.message)));
});

test('all relevance weights zero → rating not defined, no artificial list', () => {
  const zero = Object.fromEntries(Object.keys(defaults().phases.verify.relevanceWeights).map((k) => [k, 0]));
  const eff = mergeConfig(defaults(), ov({ phases: { verify: { relevanceWeights: zero } } }));
  const r = evaluate({ profile: criticalProfile(), config: eff, benchmarks: benchmarks() });
  for (const k of ['verify/api', 'verify/subscription']) {
    assert.equal(r.rankings[k].status, 'undefined');
    assert.deepEqual(r.rankings[k].candidates, []);
    assert.equal(r.rankings[k].recommended, null);
  }
  assert.notEqual(r.rankings['apply/api'].status, 'undefined');
});

test('9.1 an override changes exactly one record and keeps the replaced record as origin', () => {
  const d = defaults();
  const eff = mergeConfig(d, ov({ models: [{ id: 'codex.sol', ...setQ('apply', 'high', 'architecture', { value: 9900, basis: 'own experience on this repo' }) }] }));
  const rec = q(eff, 'codex.sol', 'apply', 'high', 'architecture');
  assert.equal(rec.status, 'user-override');
  assert.equal(rec.value, 9900);
  assert.equal(rec.basis, 'own experience on this repo');
  assert.deepEqual(rec.origin, q(d, 'codex.sol', 'apply', 'high', 'architecture'), 'original value, status, basis and support kept separately');
  assert.equal(rec.support, undefined, 'supporting evidence of the old number is not attributed to the user value');
  for (const m of eff.models) {
    for (const phase of ['apply', 'verify']) {
      for (const e of m.supportedEfforts) {
        for (const f of FACTOR_IDS) {
          if (m.id === 'codex.sol' && phase === 'apply' && e === 'high' && f === 'architecture') continue;
          assert.deepEqual(m.quality[phase][e][f], q(d, m.id, phase, e, f), `${m.id} ${phase}/${e}/${f} unchanged`);
        }
      }
    }
  }
  assert.deepEqual(eff.models.find((m) => m.id === 'codex.sol').resources, d.models.find((m) => m.id === 'codex.sol').resources, 'resources unchanged');
  const base = evaluate({ profile: criticalProfile(), config: d, benchmarks: benchmarks() });
  const r = evaluate({ profile: criticalProfile(), config: eff, benchmarks: benchmarks() });
  assert.deepEqual(r.properties, base.properties);
  assert.deepEqual(r.rankings['verify/api'], base.rankings['verify/api']);
});

test('9.1 explicit "no data" keeps the previous record separately; reset restores the default record', () => {
  const d = defaults();
  const eff = mergeConfig(d, ov({ models: [{ id: 'codex.terra', ...setQ('verify', 'low', 'testability', { value: null, basis: 'never tried for review' }) }] }));
  const rec = q(eff, 'codex.terra', 'verify', 'low', 'testability');
  assert.deepEqual([rec.value, rec.status], [null, 'unknown']);
  assert.equal(rec.origin.value, q(d, 'codex.terra', 'verify', 'low', 'testability').value);
  const reset = mergeConfig(d, ov({}));
  assert.deepEqual(q(reset, 'codex.terra', 'verify', 'low', 'testability'), q(d, 'codex.terra', 'verify', 'low', 'testability'));
});

test('9.1 a second edit keeps the earliest original as origin', () => {
  const d = defaults();
  const first = mergeConfig(d, ov({ models: [{ id: 'codex.sol', ...setQ('apply', 'low', 'logic', { value: 5000 }) }] }));
  delete first.provenance;
  const second = mergeConfig(first, ov({ models: [{ id: 'codex.sol', ...setQ('apply', 'low', 'logic', { value: 5100 }) }] }));
  assert.deepEqual(q(second, 'codex.sol', 'apply', 'low', 'logic').origin, q(d, 'codex.sol', 'apply', 'low', 'logic'));
});

test('9.1 a missing record is an error naming the combination; no neighbouring effort is borrowed', () => {
  const cfg = defaults();
  delete cfg.models[1].quality.verify.max;
  assert.ok(configErrors(cfg).some((e) => e.path === '/models/1/quality/verify/max' && /missing explicit quality records/.test(e.message)));
  const cfg2 = defaults();
  delete cfg2.models[1].quality.apply.high.logic;
  assert.ok(configErrors(cfg2).some((e) => e.path === '/models/1/quality/apply/high/logic' && /required/.test(e.message)));
  const cfg3 = defaults();
  delete cfg3.models[1].resources.subscription.load.apply.xhigh;
  assert.ok(configErrors(cfg3).some((e) => e.path === '/models/1/resources/subscription/load/apply/xhigh'));
});

test('9.1 adding a supported effort requires explicit records for both phases and every factor', () => {
  const cfg = defaults();
  const flash = cfg.models.find((m) => m.id === 'antigravity.flash');
  flash.supportedEfforts = [...flash.supportedEfforts, 'xhigh'];
  const errs = configErrors(cfg).map((e) => e.path);
  for (const p of ['quality/apply/xhigh', 'quality/verify/xhigh', 'resources/api/usage/apply/xhigh', 'resources/time/minutes/verify/xhigh']) {
    assert.ok(errs.some((x) => x.endsWith(p)), p);
  }
  const unknownRow = Object.fromEntries(FACTOR_IDS.map((f) => [f, { value: null, status: 'unknown', basis: 'no data for xhigh yet' }]));
  const res = { value: null, status: 'unknown', basis: 'no data for xhigh yet' };
  for (const phase of ['apply', 'verify']) {
    flash.quality[phase].xhigh = clone(unknownRow);
    flash.resources.api.usage[phase].xhigh = clone(res);
    flash.resources.subscription.load[phase].xhigh = clone(res);
    flash.resources.time.minutes[phase].xhigh = clone(res);
  }
  assert.deepEqual(configErrors(cfg), [], 'explicit unknown records are accepted as missing data, not as zero');
});

test('9.1 records for unsupported efforts and value/status mismatches are rejected', () => {
  const cfg = defaults();
  cfg.models[9].quality.apply.max = clone(cfg.models[9].quality.apply.high);
  assert.ok(configErrors(cfg).some((e) => e.path === '/models/9/quality/apply/max' && /not in supportedEfforts/.test(e.message)));
  const cfg2 = defaults();
  cfg2.models[0].quality.apply.low.logic = { value: null, status: 'heuristic', basis: 'x' };
  assert.ok(configErrors(cfg2).some((e) => /value must be null exactly/.test(e.message)));
});

test('9.1 equal and non-monotonic estimates across efforts are kept as given', () => {
  const eff = mergeConfig(defaults(), ov({ models: [{ id: 'codex.sol', quality: { apply: { medium: { logic: { value: 8200 } }, high: { logic: { value: 8200 } }, max: { logic: { value: 7900 } } } } }] }));
  assert.deepEqual(['medium', 'high', 'max'].map((e) => q(eff, 'codex.sol', 'apply', e, 'logic').value), [8200, 8200, 7900]);
  const r = evaluate({ profile: criticalProfile(), config: eff, benchmarks: benchmarks() });
  const c = r.rankings['apply/api'].candidates.find((x) => x.candidateId === 'codex/gpt-6.1-sol');
  assert.ok(c);
});

test('manual model version update: carried records keep their status with inheritedFrom; defaults intact', () => {
  const d = defaults();
  const before = clone(d);
  const eff = mergeConfig(d, ov({
    models: [{ id: 'codex.sol', modelId: 'gpt-6.2-sol', displayName: 'GPT-6.2 Sol', ...setQ('verify', 'high', 'logic', { value: 8000, basis: 'checked on two changes' }) }],
  }));
  assert.deepEqual(d, before, 'defaults object is not mutated');
  const sol = eff.models.find((m) => m.id === 'codex.sol');
  assert.equal(sol.modelId, 'gpt-6.2-sol');
  const arch = sol.quality.apply.high.architecture;
  assert.equal(arch.status, 'heuristic', 'a carried heuristic stays heuristic (not proxy, not measured)');
  assert.deepEqual(arch.inheritedFrom, { modelId: 'gpt-6.1-sol', harness: 'codex', status: 'heuristic' });
  assert.deepEqual(arch.support, ['aa-cai-2.1.codex.sol.max'], 'supporting evidence keeps its original identity');
  assert.deepEqual(sol.resources.api.usage.apply.high.inheritedFrom, { modelId: 'gpt-6.1-sol', harness: 'codex', status: 'heuristic' });
  assert.equal(sol.quality.verify.high.logic.status, 'user-override');
  assert.equal(sol.quality.verify.high.logic.inheritedFrom, undefined);
  assert.equal(sol.identity.status, 'unconfirmed');
  assert.equal(sol.clientModelId, null, 'old client id is not carried to the new version');
  const r = evaluate({ profile: criticalProfile(), config: eff, benchmarks: benchmarks() });
  const c = r.rankings['apply/api'].candidates.find((x) => x.candidateId === 'codex/gpt-6.2-sol');
  assert.ok(c.suitability.contributions.some((k) => k.inheritedFrom && k.inheritedFrom.modelId === 'gpt-6.1-sol'));
});

test('a carried measurement becomes proxy, never measured for the new version', () => {
  const d = defaults();
  const b = benchWith([rec('r1', { model: { modelId: 'gpt-6.1-sol', harness: 'codex', effort: 'high' } })], [mapping('direct')]);
  const sol = d.models.find((m) => m.id === 'codex.sol');
  sol.quality.apply.high.logic = { value: 7000, status: 'measured', basis: 'SWE-bench', sources: ['r1'] };
  assert.deepEqual(provenanceErrors(d, b), []);
  const eff = mergeConfig(d, ov({ models: [{ id: 'codex.sol', modelId: 'gpt-6.2-sol' }] }));
  const carried = eff.models.find((m) => m.id === 'codex.sol').quality.apply.high.logic;
  assert.equal(carried.status, 'proxy');
  assert.equal(carried.inheritedFrom.status, 'measured');
  assert.deepEqual(provenanceErrors(eff, b), []);
});

test('requesting an unsupported effort is a configuration error, not a silent substitution', () => {
  assert.throws(() => mergeConfig(defaults(), ov({ models: [{ id: 'antigravity.flash', efforts: ['xhigh'] }] })),
    (e) => e.errors.some((x) => /effort "xhigh" is not in supportedEfforts/.test(x.message)));
});

test('diffToOverrides round-trips through mergeConfig', () => {
  const d = defaults();
  const edited = clone(d);
  edited.models[1].quality.verify.high.testability = { value: 6100, status: 'user-override', basis: 'manual', origin: clone(d.models[1].quality.verify.high.testability) };
  edited.models[1].resources.time.minutes.apply.low = { value: 9000, status: 'user-override', basis: 'slow on this repo' };
  edited.selection.api.timePenalty.rateBp = 0;
  edited.models[2].enabled = false;
  const o = diffToOverrides(d, edited);
  assert.equal(o.schemaVersion, 3);
  const eff = mergeConfig(d, o);
  delete eff.provenance;
  assert.equal(canonicalStringify(eff), canonicalStringify(edited));
});

// -------------------------------------------------------------- provenance
function benchWith(records, mappings) {
  const b = benchmarks();
  b.records = [...b.records, ...records];
  b.mappings = [...b.mappings, ...mappings];
  return b;
}
const rec = (id, over = {}) => ({
  id,
  benchmark: { name: 'SWE-bench Verified', version: 'v1' },
  source: { url: 'https://example.org', publisher: 'Example', retrievedAt: '2026-11-01', kind: 'independent' },
  model: { modelId: 'gpt-6.1-sol', harness: 'codex', effort: 'high' },
  metric: 'resolved',
  score: 7000,
  unit: 'bp',
  ...over,
});
const mapping = (relation, over = {}) => ({ id: `m-${relation}`, benchmark: { name: 'SWE-bench Verified', version: 'v1' }, metric: 'resolved', phase: 'apply', factor: 'logic', relation, rationale: 'repo-level fixes', ...over });

test('measured needs an independent record of the same candidate and effort with a direct mapping', () => {
  const cfg = defaults();
  const sol = cfg.models.find((m) => m.id === 'codex.sol');
  sol.quality.apply.high.logic = { value: 7000, status: 'measured', basis: 'SWE-bench', sources: ['r1'] };
  assert.deepEqual(provenanceErrors(cfg, benchWith([rec('r1')], [mapping('direct')])), []);
  assert.ok(provenanceErrors(cfg, benchWith([rec('r1')], [mapping('proxy')])).some((e) => /label the value proxy/.test(e.message)));
  assert.ok(provenanceErrors(cfg, benchWith([rec('r1', { source: { ...rec('r1').source, kind: 'provider-claim' } })], [mapping('direct')])).some((e) => /provider claim/.test(e.message)));
  assert.ok(provenanceErrors(cfg, benchWith([rec('r1', { model: { modelId: 'gpt-6-astra', harness: 'codex', effort: 'high' } })], [mapping('direct')])).some((e) => /not this candidate/.test(e.message)));
  const lowCfg = defaults();
  lowCfg.models.find((m) => m.id === 'codex.sol').quality.apply.low.logic = { value: 7000, status: 'measured', basis: 'max result', sources: ['r1'] };
  assert.ok(provenanceErrors(lowCfg, benchWith([rec('r1', { model: { modelId: 'gpt-6.1-sol', harness: 'codex', effort: 'max' } })], [mapping('direct')])).some((e) => /measured at effort max, not low/.test(e.message)), 'a max result is not a low measurement');
});

test('9.2 a general ranking may support a heuristic but cannot be its source', () => {
  const cfg = defaults();
  const sol = cfg.models.find((m) => m.id === 'codex.sol');
  sol.quality.apply.high.logic = { value: 8200, status: 'heuristic', basis: 'tier', sources: ['aa-cai-2.1.codex.sol.max'] };
  assert.ok(configErrors(cfg).some((e) => /only allowed for measured or proxy/.test(e.message)));
  sol.quality.apply.high.logic = { value: 8200, status: 'heuristic', basis: 'tier', support: ['aa-cai-2.1.codex.sol.max'] };
  assert.deepEqual(configErrors(cfg), []);
  assert.deepEqual(provenanceErrors(cfg, benchmarks()), []);
  sol.quality.apply.high.logic.support = ['missing-record'];
  assert.ok(provenanceErrors(cfg, benchmarks()).some((e) => /unknown benchmark record "missing-record"/.test(e.message)));
});

test('verify value cannot reuse an apply benchmark without a mapping', () => {
  const cfg = defaults();
  const sol = cfg.models.find((m) => m.id === 'codex.sol');
  sol.quality.verify.high.logic = { value: 7000, status: 'measured', basis: 'coding score', sources: ['r1'] };
  assert.ok(provenanceErrors(cfg, benchWith([rec('r1')], [mapping('direct')])).some((e) => /no mapping .* to verify\/logic/.test(e.message)));
});

test('incompatible benchmark versions need explicit mappings; repeated measurement does not add weight', () => {
  const cfg = defaults();
  const sol = cfg.models.find((m) => m.id === 'codex.sol');
  sol.quality.apply.high.logic = { value: 7000, status: 'proxy', basis: 'two versions', sources: ['r1', 'r2'] };
  const r2 = rec('r2', { benchmark: { name: 'SWE-bench Verified', version: 'v2' } });
  assert.ok(provenanceErrors(cfg, benchWith([rec('r1'), r2], [mapping('proxy')])).some((e) => /SWE-bench Verified v2/.test(e.message)));
  const dup = benchWith([rec('r1'), rec('r3')], [mapping('proxy')]);
  assert.ok(benchmarksErrors(dup).some((e) => /duplicates measurement/.test(e.message)));
});

test('shipped defaults contain no measured or proxy estimate and validate', () => {
  const cfg = defaults();
  for (const m of cfg.models) {
    for (const phase of ['apply', 'verify']) {
      for (const e of m.supportedEfforts) {
        for (const f of FACTOR_IDS) assert.equal(m.quality[phase][e][f].status, 'heuristic');
        for (const t of [m.resources.api.usage, m.resources.subscription.load, m.resources.time.minutes]) assert.equal(t[phase][e].status, 'heuristic');
      }
    }
  }
  assert.deepEqual(configErrors(cfg), []);
  assert.deepEqual(provenanceErrors(cfg, benchmarks()), []);
});

test('catalog contains each of the ten agreed families with harness and pinned version', () => {
  const cfg = defaults();
  const expected = {
    codex: ['Astra', 'Sol', 'Terra', 'Luna'],
    'claude-code': ['Opus', 'Sonnet', 'Haiku'],
    antigravity: ['Argon', 'Hydrogen', 'Flash'],
  };
  for (const [h, fams] of Object.entries(expected)) {
    const got = cfg.models.filter((m) => m.harness === h).map((m) => m.family).sort();
    assert.deepEqual(got, [...fams].sort(), h);
  }
  assert.equal(cfg.models.length, 10);
  for (const m of cfg.models) {
    assert.ok(!/latest/i.test(m.modelId), `${m.id} must not use a moving alias`);
    assert.ok(m.identity.checkedAt && m.identity.sources.length, m.id);
    for (const s of m.identity.sources) assert.ok(cfg.catalog.sources.some((x) => x.id === s), `${m.id} source ${s}`);
  }
});
