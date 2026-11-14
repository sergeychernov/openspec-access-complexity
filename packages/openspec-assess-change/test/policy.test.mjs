// Section 10: policy minimum-resource-with-time-penalty (cheapest sufficient variant).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustedCost, compareFraction, formatFraction, evaluate, mergeConfig, configErrors, RANKING_KEYS, DEFAULT_TIME_PENALTY,
} from '../src/core/index.mjs';
import { clone } from '../src/core/canonical.mjs';
import { defaults, benchmarks, criticalProfile, mechanicalProfile, loadJson } from './helpers.mjs';

const P = DEFAULT_TIME_PENALTY;
const S = (cost, typicalMinutes, penalty = P, costUnit = 'micros') => adjustedCost({ cost, typicalMinutes, penalty, costUnit });
const frac = (n, d) => ({ numerator: String(n), denominator: String(d) });
const ov = (set) => ({ kind: 'openspec-assess.overrides', schemaVersion: 3, set });
const allAvailable = (cfg = defaults()) => {
  for (const m of cfg.models) m.availability = 'available';
  return cfg;
};
const run = (cfg, profile = criticalProfile(), asOf = null) => evaluate({ profile, config: cfg, benchmarks: benchmarks(), asOf });

// ------------------------------------------------------------------ 10.1 configuration
test('10.1 shipped defaults: explicit policy and the same penalty for API and subscription, no utility weights', () => {
  const d = defaults();
  assert.equal(d.selection.policy, 'minimum-resource-with-time-penalty');
  assert.equal(d.selection.policyVersion, 1);
  assert.deepEqual(d.selection.api.timePenalty, { graceMinutes: 30, intervalMinutes: 30, rateBp: 500 });
  assert.deepEqual(d.selection.subscription.timePenalty, { graceMinutes: 30, intervalMinutes: 30, rateBp: 500 });
  for (const mode of ['api', 'subscription']) {
    assert.equal(d.selection[mode].weights, undefined);
    assert.equal(d.selection[mode].anchors, undefined);
  }
  assert.deepEqual(configErrors(d), []);
});

test('10.1 validation: interval > 0, non-negative grace and rate, k = 0 allowed, old weights/anchors refused', () => {
  const bad = (mut) => { const d = defaults(); mut(d); return configErrors(d); };
  assert.ok(bad((d) => { d.selection.api.timePenalty.intervalMinutes = 0; }).some((e) => e.path === '/selection/api/timePenalty/intervalMinutes'));
  assert.ok(bad((d) => { d.selection.api.timePenalty.graceMinutes = -1; }).length > 0);
  assert.ok(bad((d) => { d.selection.subscription.timePenalty.rateBp = -5; }).length > 0);
  assert.ok(bad((d) => { d.selection.subscription.timePenalty.rateBp = 10001; }).length > 0);
  assert.ok(bad((d) => { d.selection.api.timePenalty.rateBp = 0.5; }).length > 0, 'non-integer refused');
  assert.deepEqual(bad((d) => { d.selection.api.timePenalty.rateBp = 0; }), [], 'k = 0 is a valid explicit switch-off');
  assert.ok(bad((d) => { d.selection.api.weights = { quality: 7, economy: 3, time: 0 }; }).some((e) => /legacy weighted-utility policy/.test(e.message)));
  assert.ok(bad((d) => { delete d.selection.subscription.timePenalty; }).some((e) => /required by policy/.test(e.message)));
  assert.throws(() => mergeConfig(defaults(), ov({ selection: { api: { anchors: { costMicros: 20000000, timeMinutes: 480 } } } })), (e) => e.errors.some((x) => /no effect under minimum-resource-with-time-penalty/.test(x.message)), 'old anchors are never silently active');
});

test('10.1 partial override of the penalty keeps the other parameters (and explicit 0)', () => {
  const eff = mergeConfig(defaults(), ov({ selection: { subscription: { timePenalty: { rateBp: 0 } } } }));
  assert.deepEqual(eff.selection.subscription.timePenalty, { graceMinutes: 30, intervalMinutes: 30, rateBp: 0 });
  assert.deepEqual(eff.selection.api.timePenalty, P);
});

// ------------------------------------------------------------------ 10.2 formula and comparator
test('10.6 time 29/30/31/45/60/90/150 minutes: continuous linear multiplier', () => {
  const m = (t) => S(1000, t).multiplier;
  assert.deepEqual(m(29), frac(1, 1));
  assert.deepEqual(m(30), frac(1, 1));
  assert.deepEqual(m(31), frac(601, 600));
  assert.deepEqual(m(45), frac(41, 40), '×1.025');
  assert.deepEqual(m(60), frac(21, 20), '×1.05');
  assert.deepEqual(m(90), frac(11, 10), '×1.10');
  assert.deepEqual(m(150), frac(6, 5), '×1.20');
  assert.equal(compareFraction(S(1000, 29).value, S(1000, 10).value), 0, 'time inside the grace period gives no advantage');
});

test('10.6 fractional penalty at C = 1 is exact: 31 min is 1/600 more than 30 min, display rounding is not a tie', () => {
  const a = S(1, 30, P, 'load-units').value;
  const b = S(1, 31, P, 'load-units').value;
  assert.deepEqual(a, frac(1, 1));
  assert.deepEqual(b, frac(601, 600));
  assert.equal(compareFraction(a, b), -1);
  assert.equal(formatFraction(a, 2), formatFraction(b, 2), 'equal when rounded to 2 decimals …');
  assert.notEqual(compareFraction(a, b), 0, '… but never a tie in the comparison');
});

test('10.6 cost above the old $20 / 1000-load anchors keeps strict order; S grows with C at equal T', () => {
  assert.equal(compareFraction(S(21000000, 45).value, S(200000000, 45).value), -1, '21 USD < 200 USD');
  assert.equal(compareFraction(S(1500, 45, P, 'load-units').value, S(3000, 45, P, 'load-units').value), -1, '1500 < 3000 load units');
  let prev = S(0, 60).value;
  for (const c of [1, 2, 1000, 20000000, 20000001, 999999999]) {
    const cur = S(c, 60).value;
    assert.equal(compareFraction(prev, cur), -1, `C ${c}`);
    prev = cur;
  }
});

test('10.3 the spec example: C = 10 USD, T = 60 min → S = 10.5 USD; the forecast stays 10 USD', () => {
  const a = S(10000000, 60);
  assert.deepEqual(a.value, frac(10500000, 1));
  assert.equal(a.cost, 10000000);
  assert.equal(a.overMinutes, 30);
});

test('10.3 unknown C or T is never zero; k = 0 does not need T; known zero stays zero', () => {
  assert.equal(S(null, 45).value, null);
  assert.equal(S(null, 45).complete, false);
  assert.equal(S(0, null).value, null, 'unknown T with k > 0 stays unknown even for C = 0');
  assert.deepEqual(S(0, null).missing, ['typical time (needed for the time penalty)']);
  const off = { ...P, rateBp: 0 };
  assert.deepEqual(S(500, null, off).value, frac(500, 1), 'k = 0 explicitly disables the time penalty');
  assert.deepEqual(S(0, 90).value, frac(0, 1));
});

test('10.6 different high-time with equal typical time gives equal S (high time is not T)', () => {
  const cfg = allAvailable();
  const r1 = run(cfg);
  const cfg2 = clone(cfg);
  for (const phase of ['apply', 'verify']) for (const c of Object.keys(cfg2.workloads.timeMinutes[phase])) cfg2.workloads.timeMinutes[phase][c].high *= 3;
  const r2 = run(cfg2);
  for (const key of RANKING_KEYS) {
    const a = r1.rankings[key].candidates.map((c) => [c.candidateId, c.recommendedEffort, c.adjusted && c.adjusted.value]);
    const b = r2.rankings[key].candidates.map((c) => [c.candidateId, c.recommendedEffort, c.adjusted && c.adjusted.value]);
    assert.deepEqual(b, a, key);
    assert.notDeepEqual(r2.rankings[key].candidates[0].time.highMinutes, r1.rankings[key].candidates[0].time.highMinutes);
  }
});

function eligibleComplete(r, key) {
  return r.rankings[key].candidates.filter((c) => c.group === 'eligible' && c.economicComplete);
}

test('10.2 excess quality does not compensate a larger S; order is S ↑, C ↑, F ↓, IDs', () => {
  const r = run(allAvailable(), mechanicalProfile());
  for (const key of RANKING_KEYS) {
    const list = eligibleComplete(r, key);
    assert.ok(list.length >= 2, key);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      const cmp = compareFraction(a.adjusted.value, b.adjusted.value);
      assert.ok(cmp <= 0, `${key}: S ascending`);
      if (cmp === 0) {
        assert.ok(a.adjusted.cost <= b.adjusted.cost, `${key}: equal S → C ascending`);
        if (a.adjusted.cost === b.adjusted.cost) assert.ok(a.suitability.valueBp >= b.suitability.valueBp, `${key}: then F descending`);
      }
    }
  }
  // A stronger candidate with a larger S never ranks above a sufficient cheaper one.
  const key = 'apply/api';
  const list = eligibleComplete(r, key);
  const strongest = [...list].sort((a, b) => b.suitability.valueBp - a.suitability.valueBp)[0];
  assert.notEqual(strongest.candidateId, list[0].candidateId, 'the most capable candidate is not first when a cheaper one suffices');
  assert.equal(compareFraction(list[0].adjusted.value, strongest.adjusted.value), -1);
  assert.ok(list[0].suitability.valueBp < strongest.suitability.valueBp);
});

test('10.2 the same comparator picks the effort of each model: no allowed eligible effort has a smaller S', () => {
  const r = run(allAvailable(), mechanicalProfile());
  for (const key of RANKING_KEYS) {
    for (const c of r.rankings[key].candidates.filter((x) => x.group === 'eligible' && x.economicComplete)) {
      for (const o of c.otherEfforts.filter((x) => x.group === 'eligible' && x.adjustedValue)) {
        assert.ok(compareFraction(c.adjusted.value, o.adjustedValue) <= 0, `${key} ${c.candidateId}: ${c.recommendedEffort} vs ${o.effort}`);
      }
    }
  }
});

test('10.6 a low effort is recommended when its quality is sufficient', () => {
  const profile = loadJson('examples/golden/profile.json');
  const cfg = mergeConfig(defaults(), loadJson('examples/golden/overrides.json'));
  const r = evaluate({ profile, config: cfg, benchmarks: benchmarks(), asOf: '2026-11-14T12:00:00Z' });
  const opus = r.rankings['apply/api'].candidates.find((c) => c.candidateId === 'claude-code/claude-opus-5-5');
  assert.equal(opus.group, 'eligible');
  assert.equal(opus.recommendedEffort, 'low', 'low already passes the floor; higher efforts only add cost');
  assert.ok(opus.otherEfforts.some((o) => o.suitabilityBp > opus.suitability.valueBp), 'higher efforts have more quality but are not preferred');
});

test('10.6 ties: equal S and C fall back to F, then to stable IDs; time inside the grace period is no key', () => {
  const cfg = allAvailable();
  // Make Sonnet 5.5 and Sol 6.1 identical in cost/time but give Sol a higher apply quality at medium.
  const sol = cfg.models.find((m) => m.id === 'codex.sol');
  for (const f of Object.keys(sol.quality.apply.medium)) sol.quality.apply.medium[f] = { ...sol.quality.apply.medium[f], value: sol.quality.apply.medium[f].value + 100 };
  for (const m of cfg.models) if (!['codex.sol', 'claude-code.sonnet'].includes(m.id)) m.enabled = false;
  for (const m of cfg.models) m.efforts = ['medium'];
  const r = run(cfg, criticalProfile());
  const list = r.rankings['apply/api'].candidates;
  assert.equal(compareFraction(list[0].adjusted.value, list[1].adjusted.value), 0, 'same S');
  assert.equal(list[0].candidateId, 'codex/gpt-6.1-sol', 'higher F wins the tie');
  for (const f of Object.keys(sol.quality.apply.medium)) sol.quality.apply.medium[f] = clone(cfg.models.find((m) => m.id === 'claude-code.sonnet').quality.apply.medium[f]);
  const r2 = run(cfg, criticalProfile());
  assert.deepEqual(r2.rankings['apply/api'].candidates.map((c) => c.candidateId), ['claude-code/claude-sonnet-5-5', 'codex/gpt-6.1-sol'], 'full tie → candidate ID in code-unit order');
});

test('10.6 the individual S of a candidate does not depend on other candidates', () => {
  const before = run(allAvailable());
  const cfg = allAvailable();
  const extra = clone(cfg.models.find((m) => m.id === 'codex.luna'));
  Object.assign(extra, { id: 'codex.extra', modelId: 'gpt-extra', displayName: 'Extra', clientModelId: null });
  cfg.models.push(extra);
  const after = run(cfg);
  for (const key of RANKING_KEYS) {
    for (const c of before.rankings[key].candidates) {
      const a = after.rankings[key].candidates.find((x) => x.candidateId === c.candidateId);
      assert.deepEqual(a.adjusted, c.adjusted, `${key} ${c.candidateId}`);
    }
  }
});

test('10.3 budget and quota checks use the original forecast, not S', () => {
  const cfg = allAvailable();
  const r0 = run(cfg, mechanicalProfile());
  const penalised = r0.rankings['apply/api'].candidates.find((c) => c.economicComplete && c.adjusted.overMinutes > 0);
  assert.ok(penalised, 'some candidate exceeds the grace period');
  cfg.constraints.api.maxCostMicros = penalised.resource.highMicros;
  const r = run(cfg, mechanicalProfile());
  const c = r.rankings['apply/api'].candidates.find((x) => x.candidateId === penalised.candidateId);
  assert.equal(c.recommendedEffort, penalised.recommendedEffort);
  assert.equal(c.resource.highMicros, cfg.constraints.api.maxCostMicros);
  assert.ok(!c.reasons.some((x) => /API budget/.test(x)), 'high forecast equals the budget: no budget warning although S is larger');
  assert.equal(compareFraction(c.adjusted.value, { numerator: String(cfg.constraints.api.maxCostMicros), denominator: '1' }), 1, 'S exceeds the budget, the forecast does not');
});

test('10.3 no economic recommendation without a complete eligible variant; quality failure is a different status', () => {
  const cfg = allAvailable();
  for (const m of cfg.models) for (const phase of ['apply', 'verify']) for (const e of m.supportedEfforts) m.resources.time.minutes[phase][e] = { value: null, status: 'unknown', basis: 'no time data' };
  const r = run(cfg);
  for (const key of RANKING_KEYS) {
    assert.equal(r.rankings[key].status, 'economics-undefined', key);
    assert.equal(r.rankings[key].recommended, null);
    assert.ok(r.rankings[key].candidates.some((c) => c.group === 'eligible'), 'sufficient candidates stay visible');
    assert.ok(r.rankings[key].candidates.filter((c) => c.group === 'eligible').every((c) => c.adjusted.value === null));
  }
  cfg.selection.api.timePenalty.rateBp = 0;
  const off = run(cfg);
  assert.equal(off.rankings['apply/api'].status, 'ok', 'with k = 0 the time is not needed');
  assert.equal(off.rankings['apply/subscription'].status, 'economics-undefined');
  const floors = allAvailable();
  for (const phase of ['apply', 'verify']) floors.phases[phase].qualityFloors = [{ fromDemandBp: 0, floorBp: 10000 }];
  assert.equal(run(floors).rankings['apply/api'].status, 'no-suitable');
});

test('10.3 report and trace carry C, T, penalty parameters, multiplier, exact S and reasons', () => {
  const r = run(allAvailable(), mechanicalProfile());
  const c = r.rankings['verify/api'].candidates[0];
  assert.deepEqual(Object.keys(c.adjusted).sort(), ['complete', 'cost', 'costUnit', 'graceMinutes', 'intervalMinutes', 'missing', 'multiplier', 'overMinutes', 'policy', 'rateBp', 'typicalMinutes', 'value']);
  assert.equal(c.adjusted.cost, c.resource.highMicros);
  assert.equal(c.adjusted.typicalMinutes, c.time.typicalMinutes);
  assert.equal(r.rankings['verify/api'].policy.id, 'minimum-resource-with-time-penalty');
  assert.equal(r.rankings['verify/api'].selectionWeights, null, 'no utility weights shown as active settings');
  const t = r.trace['verify/api'].find((x) => x.candidateId === c.candidateId && x.effort === c.recommendedEffort);
  assert.deepEqual(t.adjusted, c.adjusted);
  assert.equal(c.utilityBp, null);
});
