import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate, mergeConfig, canonicalStringify, renderMarkdown, RANKING_KEYS, compareCodeUnits, compareFraction,
} from '../src/core/index.mjs';
import { clone } from '../src/core/canonical.mjs';
import { defaults, benchmarks, criticalProfile, mechanicalProfile } from './helpers.mjs';

const ov = (set) => ({ kind: 'openspec-assess.overrides', schemaVersion: 3, set });
const allAvailable = (cfg = defaults()) => {
  for (const m of cfg.models) m.availability = 'available';
  return cfg;
};
const run = (cfg, profile = criticalProfile(), asOf = null) => evaluate({ profile, config: cfg, benchmarks: benchmarks(), asOf });
const cand = (r, key, id) => r.rankings[key].candidates.find((c) => c.candidateId === id);
const excl = (r, key, id) => r.rankings[key].excluded.find((c) => c.candidateId === id);

test('5.1 disabled and unavailable candidates are excluded with reasons, sorted by id', () => {
  const cfg = allAvailable();
  cfg.models.find((m) => m.id === 'codex.astra').enabled = false;
  cfg.models.find((m) => m.id === 'antigravity.flash').availability = 'unavailable';
  const r = run(cfg);
  for (const key of RANKING_KEYS) {
    const ex = r.rankings[key].excluded;
    assert.deepEqual(ex.map((e) => e.candidateId), ['antigravity/gemini-3.8-flash', 'codex/gpt-6-astra']);
    assert.match(ex[1].reasons[0], /disabled/);
    assert.match(ex[0].reasons[0], /unavailable/);
    assert.equal(cand(r, key, 'codex/gpt-6-astra'), undefined);
  }
});

test('5.1 effort variants come only from supported efforts; an explicit effort subset is honoured', () => {
  const cfg = allAvailable();
  const flash = cfg.models.find((m) => m.id === 'antigravity.flash');
  flash.efforts = ['low', 'medium'];
  const r = run(cfg);
  const c = cand(r, 'apply/subscription', 'antigravity/gemini-3.8-flash');
  const efforts = [c.recommendedEffort, ...c.otherEfforts.map((o) => o.effort)].sort();
  assert.deepEqual(efforts, ['low', 'medium']);
  const opus = cand(r, 'apply/api', 'claude-code/claude-opus-5-5');
  assert.deepEqual([opus.recommendedEffort, ...opus.otherEfforts.map((o) => o.effort)].sort(), ['high', 'low', 'max', 'medium', 'xhigh']);
});

test('5.1 insufficient known context excludes; unknown context for a hard constraint is provisional, not a pass', () => {
  const cfg = allAvailable();
  cfg.constraints.minContextTokens = 1040000;
  const r = run(cfg);
  assert.ok(excl(r, 'apply/api', 'claude-code/claude-opus-5-5').reasons.some((x) => /context window 1000000 < required 1040000/.test(x)));
  assert.equal(cand(r, 'apply/api', 'codex/gpt-6-astra').group, 'eligible');
  const argon = cand(r, 'apply/api', 'antigravity/gemini-4-argon');
  assert.equal(argon.group, 'provisional');
  assert.ok(argon.reasons.some((x) => /context window unknown/.test(x)));
});

test('5.2 apply and verify use separate matrices; a phase-specific override changes only that phase', () => {
  const base = run(allAvailable());
  const k = 'claude-code/claude-haiku-5-5';
  const effort = cand(base, 'apply/api', k).recommendedEffort;
  const cfg = mergeConfig(allAvailable(), ov({ models: [{ id: 'claude-code.haiku', quality: { apply: { [effort]: { consequences: { value: 9900 } } } } }] }));
  const r = run(cfg);
  assert.ok(cand(r, 'apply/api', k).suitability.valueBp > cand(base, 'apply/api', k).suitability.valueBp);
  assert.equal(cand(r, 'verify/api', k).suitability.valueBp, cand(base, 'verify/api', k).suitability.valueBp);
  assert.deepEqual(r.properties, base.properties, 'change properties never depend on model coefficients');
});

test('5.2 unknown active coefficient is not zero: candidate is provisional with coverage, no full score', () => {
  const cfg = allAvailable();
  const sol = cfg.models.find((m) => m.id === 'codex.sol');
  for (const e of sol.supportedEfforts) sol.quality.verify[e].testability = { value: null, status: 'unknown', basis: 'no data' };
  const c = cand(run(cfg), 'verify/api', 'codex/gpt-6.1-sol');
  assert.equal(c.group, 'provisional');
  assert.equal(c.suitability.valueBp, null);
  assert.equal(c.suitability.complete, false);
  assert.ok(c.suitability.coverageBp > 0 && c.suitability.coverageBp < 10000);
  const t = c.suitability.contributions.find((x) => x.factor === 'testability');
  assert.equal(t.coefficientBp, null);
  assert.equal(t.contributionBp, null);
});

test('5.2 not-applicable factors are excluded from relevance', () => {
  const p = criticalProfile();
  p.factors.compatibility = { state: 'not-applicable', rationale: 'internal code only' };
  const r = run(allAvailable(), p);
  for (const key of RANKING_KEYS) assert.ok(!r.rankings[key].relevance.some((x) => x.factor === 'compatibility'));
});

test('5.2 a failed critical factor cannot be compensated by low price', () => {
  const cfg = allAvailable();
  const luna = cfg.models.find((m) => m.id === 'codex.luna');
  // Luna becomes almost free; consequences coefficient stays below the critical 7500 bp minimum.
  cfg.pricing.find((p) => p.id === 'codex.luna.standard').rates = { uncachedInput: 1, cacheRead: 1, cacheWrite: 1, output: 1, reasoning: null };
  const r = run(cfg);
  const c = cand(r, 'verify/api', 'codex/gpt-6-luna');
  assert.equal(c.group, 'below-threshold');
  assert.ok(c.critical.some((x) => x.factor === 'consequences' && x.status === 'fail'));
  assert.notEqual(r.rankings['verify/api'].recommended.candidateId, 'codex/gpt-6-luna');
  const ranks = r.rankings['verify/api'].candidates;
  assert.ok(ranks.findIndex((x) => x.candidateId === 'codex/gpt-6-luna') > ranks.findIndex((x) => x.group === 'eligible'));
  assert.ok(luna);
});

test('5.3 adding an unrelated candidate does not change the scores of the others', () => {
  const before = run(allAvailable());
  const cfg = allAvailable();
  const extra = clone(cfg.models.find((m) => m.id === 'codex.luna'));
  Object.assign(extra, { id: 'codex.extra', modelId: 'gpt-extra', displayName: 'Extra', clientModelId: null });
  cfg.models.push(extra);
  const after = run(cfg);
  for (const key of RANKING_KEYS) {
    for (const c of before.rankings[key].candidates) {
      const a = cand(after, key, c.candidateId);
      assert.equal(a.suitability.valueBp, c.suitability.valueBp, `${key} ${c.candidateId} suitability`);
      assert.deepEqual(a.adjusted, c.adjusted, `${key} ${c.candidateId} adjusted cost S`);
      assert.equal(a.recommendedEffort, c.recommendedEffort);
    }
  }
});

test('5.3/10.1 API and subscription have separate policy settings', () => {
  const base = run(allAvailable());
  const cfg = allAvailable();
  cfg.selection.subscription.timePenalty = { graceMinutes: 0, intervalMinutes: 1, rateBp: 10000 };
  const r = run(cfg);
  assert.deepEqual(r.rankings['apply/api'], base.rankings['apply/api']);
  assert.notDeepEqual(r.rankings['apply/subscription'].candidates.map((c) => c.adjusted && c.adjusted.value), base.rankings['apply/subscription'].candidates.map((c) => c.adjusted && c.adjusted.value));
});

test('5.4 ties are ordered by candidate id in code-unit order, not by locale', () => {
  // Make Sol identical to Sonnet 5.5 in price, resources and quality (Sol's own list price differs above
  // 272K tokens of context), so every sorting criterion ties.
  const cfg = allAvailable();
  const sonnet = cfg.models.find((m) => m.id === 'claude-code.sonnet');
  const sol = cfg.models.find((m) => m.id === 'codex.sol');
  sol.quality = clone(sonnet.quality);
  sol.resources.api.usage = clone(sonnet.resources.api.usage);
  sol.resources.time = clone(sonnet.resources.time);
  const pi = cfg.pricing.findIndex((p) => p.id === 'codex.sol.standard');
  cfg.pricing[pi] = { ...clone(cfg.pricing.find((p) => p.id === 'claude-code.sonnet.standard')), id: 'codex.sol.standard' };
  const r = run(cfg, mechanicalProfile());
  const list = r.rankings['apply/api'].candidates;
  const i = list.findIndex((c) => c.candidateId === 'claude-code/claude-sonnet-5-5');
  const j = list.findIndex((c) => c.candidateId === 'codex/gpt-6.1-sol');
  assert.deepEqual(list[i].adjusted.value, list[j].adjusted.value, 'equal S');
  assert.equal(list[i].adjusted.cost, list[j].adjusted.cost, 'equal C');
  assert.equal(list[i].suitability.valueBp, list[j].suitability.valueBp);
  assert.ok(i < j);
  assert.equal(compareCodeUnits('Z', 'a'), -1, 'uppercase sorts before lowercase in code units');
  assert.ok('Z'.localeCompare('a') > 0, 'localeCompare would order differently');
});

test('5.4 incomplete economic data stays eligible-incomplete after complete ones, without zero cost advantage', () => {
  const cfg = allAvailable();
  cfg.pricing.find((p) => p.id === 'codex.luna.standard').status = 'unknown';
  const list = run(cfg).rankings['apply/api'].candidates;
  const luna = list.find((c) => c.candidateId === 'codex/gpt-6-luna');
  assert.equal(luna.resource.status, 'unknown');
  assert.equal(luna.utilityBp, null);
  assert.equal(luna.economicComplete, false);
  assert.deepEqual(luna.missingEconomic, ['API cost (high forecast)']);
  assert.equal(luna.adjusted.value, null, 'no S without C');
  const lastComplete = list.map((c) => c.group === 'eligible' && c.economicComplete).lastIndexOf(true);
  assert.ok(list.indexOf(luna) > lastComplete);
});

test('5.4 no eligible candidate → explicit no-suitable, nothing recommended', () => {
  const cfg = allAvailable();
  for (const phase of ['apply', 'verify']) cfg.phases[phase].qualityFloors = [{ fromDemandBp: 0, floorBp: 10000 }];
  const r = run(cfg);
  for (const key of RANKING_KEYS) {
    assert.equal(r.rankings[key].status, 'no-suitable');
    assert.equal(r.rankings[key].recommended, null);
  }
});

test('5.4 only provisional candidates → provisional-only, nothing recommended', () => {
  const r = run(defaults());
  for (const key of RANKING_KEYS) {
    assert.equal(r.rankings[key].status, 'provisional-only');
    assert.equal(r.rankings[key].recommended, null);
    assert.ok(r.rankings[key].candidates.every((c) => c.group !== 'eligible'));
  }
});

test('5.4 recommended effort is the best variant of the same model+harness by the ranking rules', () => {
  const r = run(allAvailable());
  for (const key of RANKING_KEYS) {
    for (const c of r.rankings[key].candidates) {
      for (const o of c.otherEfforts) {
        if (c.group === 'eligible' && o.group === 'eligible' && c.economicComplete && o.adjustedValue) assert.ok(compareFraction(c.adjusted.value, o.adjustedValue) <= 0, `${key} ${c.candidateId} ${o.effort}`);
      }
    }
  }
});

test('5.5 four rankings with trace, provenance, exclusions and no probability claims', () => {
  const cfg = allAvailable();
  cfg.models.find((m) => m.id === 'codex.astra').enabled = false;
  const r = run(cfg);
  assert.deepEqual(Object.keys(r.rankings).sort(), [...RANKING_KEYS].sort());
  for (const key of RANKING_KEYS) {
    assert.ok(r.trace[key].length > 0);
    assert.ok(r.trace[key].some((t) => t.group === 'excluded'));
    const top = r.rankings[key].candidates[0];
    assert.equal(top.suitability.kind, 'heuristic-fit-score');
    for (const k of top.suitability.contributions) assert.ok(['measured', 'proxy', 'heuristic', 'unknown', 'user-override'].includes(k.coefficientStatus));
  }
  assert.ok(r.benchmarks.length > 0, 'proxy sources are listed with attribution');
  const md = renderMarkdown(r);
  assert.match(md, /not a probability/);
  assert.doesNotMatch(md.replace(/not a probability/g, ''), /probabilit|chance of success|% success/i);
  assert.doesNotMatch(JSON.stringify(r).replace(/not a probability/g, ''), /"probability"|successProbability/);
  assert.match(md, /h heuristic — support \[aa-cai-2\.1/);
  assert.doesNotMatch(md, /\| p proxy/, 'an ordering-only benchmark is not shown as the source of the number');
});

test('5.6 golden/metamorphic: identical inputs give identical bytes', () => {
  const a = canonicalStringify(run(allAvailable()));
  const b = canonicalStringify(run(allAvailable()));
  assert.equal(a, b);
});

test('5.6 metamorphic: changing verify weights affects only verify rankings', () => {
  const base = run(allAvailable());
  const cfg = allAvailable();
  cfg.phases.verify.relevanceWeights.testability = 9;
  const r = run(cfg);
  assert.deepEqual(r.rankings['apply/api'], base.rankings['apply/api']);
  assert.deepEqual(r.rankings['apply/subscription'], base.rankings['apply/subscription']);
  assert.notDeepEqual(r.rankings['verify/api'].relevance, base.rankings['verify/api'].relevance);
  assert.deepEqual(r.properties, base.properties);
});

test('5.6 metamorphic: lower resource use never increases the adjusted cost S, other things equal', () => {
  const base = run(allAvailable());
  const cfg = allAvailable();
  const sol = cfg.models.find((m) => m.id === 'codex.sol');
  for (const phase of ['apply', 'verify']) {
    for (const t of [sol.resources.api.usage[phase], sol.resources.subscription.load[phase]]) {
      for (const e of Object.keys(t)) t[e] = { ...t[e], value: Math.floor(t[e].value / 2) };
    }
  }
  const r = run(cfg);
  for (const key of RANKING_KEYS) {
    const b = cand(base, key, 'codex/gpt-6.1-sol');
    const a = cand(r, key, 'codex/gpt-6.1-sol');
    assert.ok(b.adjusted.value && a.adjusted.value, `${key}: S known`);
    assert.ok(compareFraction(a.adjusted.value, b.adjusted.value) <= 0, key);
    assert.equal(a.suitability.valueBp, b.suitability.valueBp, 'quality is unaffected');
  }
});

// ------------------------------------------------------------------ 9.4 exact effort records
test('9.4 each effort uses its own record: 82 at medium and 81 at high are both used as given', () => {
  const cfg = allAvailable();
  const sol = cfg.models.find((m) => m.id === 'codex.sol');
  for (const f of Object.keys(sol.quality.apply.medium)) {
    sol.quality.apply.medium[f] = { value: 8200, status: 'user-override', basis: 'test' };
    sol.quality.apply.high[f] = { value: 8100, status: 'user-override', basis: 'test' };
  }
  const c = cand(run(cfg), 'apply/api', 'codex/gpt-6.1-sol');
  const byEffort = Object.fromEntries([[c.recommendedEffort, c.suitability.valueBp], ...c.otherEfforts.map((o) => [o.effort, o.suitabilityBp])]);
  assert.equal(byEffort.medium, 8200);
  assert.equal(byEffort.high, 8100, 'high is not raised and not copied from medium');
});

test('9.4 an unknown record of one effort is not filled from another effort; zero relevance does not reduce coverage', () => {
  const cfg = allAvailable();
  const astra = cfg.models.find((m) => m.id === 'codex.astra');
  astra.quality.verify.high.testability = { value: null, status: 'unknown', basis: 'no data at high' };
  astra.efforts = ['medium', 'high'];
  const r = run(cfg);
  const c = cand(r, 'verify/api', 'codex/gpt-6-astra');
  const high = c.recommendedEffort === 'high' ? c : c.otherEfforts.find((o) => o.effort === 'high');
  const medium = c.recommendedEffort === 'medium' ? c : c.otherEfforts.find((o) => o.effort === 'medium');
  assert.equal(high.group, 'provisional');
  const fit = (x) => ('suitabilityBp' in x ? x.suitabilityBp : x.suitability.valueBp);
  assert.equal(fit(high), null);
  assert.ok(fit(medium) > 0, 'medium keeps its own complete record');
  const trace = r.trace['verify/api'].find((t) => t.candidateId === 'codex/gpt-6-astra' && t.effort === 'high');
  assert.equal(trace.coefficients.testability, null);
  assert.ok(trace.coverageBp < 10000);
  const cfg2 = clone(cfg);
  cfg2.phases.verify.relevanceWeights.testability = 0;
  const t2 = run(cfg2).trace['verify/api'].find((t) => t.candidateId === 'codex/gpt-6-astra' && t.effort === 'high');
  assert.equal(t2.coverageBp, 10000, 'an unknown factor with zero relevance does not lower coverage');
});

test('9.4 trace and contributions name the exact record and its provenance, with no effort delta', () => {
  const r = run(allAvailable());
  const c = r.rankings['apply/api'].candidates[0];
  for (const k of c.suitability.contributions) {
    assert.deepEqual(k.record, { phase: 'apply', effort: c.recommendedEffort, factor: k.factor });
    assert.equal('effortDelta' in k, false);
    assert.ok(k.basis.includes(`effort ${c.recommendedEffort}`));
  }
  assert.equal(JSON.stringify(r).includes('effortDelta'), false);
});

test('9.3 editing quality never changes resource forecasts', () => {
  const base = run(allAvailable());
  const cfg = allAvailable();
  const sol = cfg.models.find((m) => m.id === 'codex.sol');
  for (const e of sol.supportedEfforts) for (const f of Object.keys(sol.quality.apply[e])) sol.quality.apply[e][f] = { value: 9900, status: 'user-override', basis: 'test' };
  const r = run(cfg);
  for (const key of ['apply/api', 'apply/subscription']) {
    const b = cand(base, key, 'codex/gpt-6.1-sol');
    const a = cand(r, key, 'codex/gpt-6.1-sol');
    const all = (c) => [[c.recommendedEffort, c.resourceHigh ?? c.resource.highMicros ?? c.resource.highLoad], ...c.otherEfforts.map((o) => [o.effort, o.resourceHigh])].sort();
    assert.deepEqual(all(a), all(b), key);
  }
});
