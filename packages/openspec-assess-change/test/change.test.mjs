import test from 'node:test';
import assert from 'node:assert/strict';
import { computeChange, evaluate, profileErrors, RUBRIC, FACTOR_IDS, LEVEL_MAX } from '../src/core/index.mjs';
import { clone } from '../src/core/canonical.mjs';
import { mechanicalProfile, criticalProfile, defaults, benchmarks } from './helpers.mjs';

const rules = () => defaults().complexityRules;

test('rubric has five anchors for every factor', () => {
  for (const f of FACTOR_IDS) assert.equal(RUBRIC[f].anchors.length, LEVEL_MAX + 1, f);
});

test('large mechanical change: high volume, low architectural complexity, shown separately', () => {
  const c = computeChange(mechanicalProfile(), rules());
  assert.equal(c.factors.volume.upper, 4);
  assert.equal(c.factors.architecture.upper, 0);
  assert.ok(c.indices.volume.upper >= 7500);
  assert.ok(c.indices.complexity.upper <= 1000);
  assert.notEqual(c.indices.volume.upper, c.indices.complexity.upper);
});

test('small critical change: few files do not zero consequences or verification demand', () => {
  const c = computeChange(criticalProfile(), rules());
  assert.ok(c.factors.volume.upper <= 1);
  assert.equal(c.factors.consequences.upper, 4);
  assert.ok(c.indices.risk.upper >= 5000);
  assert.ok(c.demandBp >= c.indices.risk.upper);
  const r = evaluate({ profile: criticalProfile(), config: defaults(), benchmarks: benchmarks() });
  const crit = r.rankings['verify/api'].candidates[0].critical.find((x) => x.factor === 'consequences');
  assert.ok(crit, 'critical consequences rule applies to verify');
});

test('unknown is not zero: bounds 0..4, conservative ranking level, reported as missing', () => {
  const p = criticalProfile();
  p.factors.compatibility = { state: 'unknown', rationale: 'need for migration not investigated yet' };
  assert.deepEqual(profileErrors(p), []);
  const c = computeChange(p, rules());
  assert.equal(c.factors.compatibility.state, 'unknown');
  assert.equal(c.factors.compatibility.lower, 0);
  assert.equal(c.factors.compatibility.upper, 4);
  assert.equal(c.factors.compatibility.rankingLevel, rules().unknownRankingLevel);
  assert.ok(c.unknownFactors.includes('compatibility'));
  assert.ok(c.indices.risk.upper > c.indices.risk.lower);
  const r = evaluate({ profile: p, config: defaults(), benchmarks: benchmarks() });
  assert.ok(r.missingData.unknownFactors.includes('compatibility'));
  assert.ok(!r.missingData.notApplicableFactors.includes('compatibility'));
});

test('not-applicable is excluded with a rationale and differs from unknown', () => {
  const p = mechanicalProfile();
  p.factors.compatibility = { state: 'not-applicable' };
  assert.ok(profileErrors(p).some((e) => e.path === '/factors/compatibility/rationale'));
  p.factors.compatibility.rationale = 'no public contracts or stored data involved';
  assert.deepEqual(profileErrors(p), []);
  const c = computeChange(p, rules());
  assert.ok(c.notApplicableFactors.includes('compatibility'));
  assert.ok(!c.indices.risk.factors.includes('compatibility'));
});

test('unknown quantity keeps volume bounds open', () => {
  const p = criticalProfile();
  p.quantities.diffLines = { state: 'unknown' };
  const c = computeChange(p, rules());
  assert.equal(c.factors.volume.state, 'unknown');
  assert.equal(c.factors.volume.upper, 4);
});

test('change properties do not depend on the model configuration', () => {
  const base = evaluate({ profile: criticalProfile(), config: defaults(), benchmarks: benchmarks() });
  const cfg = defaults();
  const astra = cfg.models.find((m) => m.id === 'codex.astra');
  astra.enabled = false;
  cfg.pricing.find((x) => x.id === 'codex.astra.standard').rates = { uncachedInput: 99000000, cacheRead: 1, cacheWrite: 1, output: 99000000, reasoning: null };
  cfg.pricing.find((x) => x.id === 'codex.astra.standard').status = 'example';
  cfg.phases.apply.relevanceWeights.logic = 0;
  cfg.quotaPools[0].observation = { observedAt: '2026-11-14T00:00:00Z', maxAgeHours: 24, remaining: 5, unit: 'credits', resetAt: null, source: 'test' };
  const changed = evaluate({ profile: criticalProfile(), config: cfg, benchmarks: benchmarks(), asOf: '2026-11-14T01:00:00Z' });
  assert.deepEqual(changed.properties, base.properties);
  assert.notDeepEqual(changed.rankings, base.rankings);
});

test('profile stage and scope are reflected; planning estimates stay estimates', () => {
  const p = mechanicalProfile();
  p.scope = { mode: 'tasks', taskIds: ['1.1'] };
  const r = evaluate({ profile: p, config: defaults(), benchmarks: benchmarks() });
  assert.equal(r.change.stage, 'planning');
  assert.deepEqual(r.change.scope.taskIds, ['1.1']);
  assert.deepEqual(r.properties.quantities.files, { state: 'known', kind: 'estimated', min: 60, max: 80 });
  assert.equal(r.properties.factors.volume.kind, 'estimated');
});

test('profile clone is not mutated by evaluation', () => {
  const p = mechanicalProfile();
  const before = clone(p);
  evaluate({ profile: p, config: defaults(), benchmarks: benchmarks() });
  assert.deepEqual(p, before);
});
