import test from 'node:test';
import assert from 'node:assert/strict';
import { priceUsage, apiForecast, subscriptionForecast, poolStatus, evaluate, canonicalStringify } from '../src/core/index.mjs';
import { defaults, benchmarks, criticalProfile, mechanicalProfile } from './helpers.mjs';

const pricing = (over = {}) => ({
  id: 'p', status: 'example', currency: 'USD', tier: 'standard',
  rates: { uncachedInput: 2000000, cacheRead: 200000, cacheWrite: 2500000, output: 10000000, reasoning: null },
  reasoningBilling: 'as-output', longContext: null, toolCharges: { 'web-search': 10000 }, ...over,
});
const usage = (over = {}) => ({ uncachedInputTokens: 1000000, cacheReadTokens: 2000000, cacheWriteTokens: 100000, outputTokens: 50000, reasoningTokens: 100000, peakContextTokens: 100000, toolCalls: {}, ...over });

test('disjoint billing categories: cache read/write, reasoning once, tool charges', () => {
  const r = priceUsage(usage({ toolCalls: { 'web-search': 3 } }), pricing());
  const by = Object.fromEntries(r.lines.map((l) => [l.category, l.micros]));
  assert.equal(by.uncachedInput, 2000000);
  assert.equal(by.cacheRead, 400000);
  assert.equal(by.cacheWrite, 250000);
  assert.equal(by.output, 500000);
  assert.equal(by.reasoning, 1000000, 'reasoning billed at output rate exactly once');
  assert.equal(by['tool:web-search'], 30000);
  assert.equal(r.totalMicros, 2000000 + 400000 + 250000 + 500000 + 1000000 + 30000);
  const sep = priceUsage(usage(), pricing({ reasoningBilling: 'separate', rates: { ...pricing().rates, reasoning: 5000000 } }));
  assert.equal(sep.lines.find((l) => l.category === 'reasoning').micros, 500000);
  assert.equal(sep.lines.filter((l) => l.category === 'output').length, 1);
});

test('missing rate or tool charge makes the total unknown, never zero', () => {
  const r = priceUsage(usage(), pricing({ rates: { ...pricing().rates, cacheWrite: null } }));
  assert.equal(r.totalMicros, null);
  assert.deepEqual(r.missing, ['rate.cacheWrite']);
  const t = priceUsage(usage({ toolCalls: { 'code-exec': 1 } }), pricing());
  assert.equal(t.totalMicros, null);
  const zero = priceUsage(usage({ cacheWriteTokens: 0 }), pricing({ rates: { ...pricing().rates, cacheWrite: null } }));
  assert.notEqual(zero.totalMicros, null, 'a null rate for an unused category does not block the total');
});

test('long-context tier applies above the explicit threshold', () => {
  const p = pricing({ longContext: { thresholdTokens: 200000, rates: { uncachedInput: 4000000, cacheRead: 400000, cacheWrite: 5000000, output: 15000000, reasoning: null } } });
  assert.equal(priceUsage(usage({ peakContextTokens: 150000 }), p).longContext, false);
  const long = priceUsage(usage({ peakContextTokens: 250000 }), p);
  assert.equal(long.longContext, true);
  assert.equal(long.lines.find((l) => l.category === 'uncachedInput').micros, 4000000);
});

test('API forecast: currency mismatch and unknown usage stay unknown', () => {
  const cfg = defaults();
  const model = cfg.models[0];
  const workload = { low: 's', typical: 's', high: 'm' };
  const byId = new Map([[model.resources.api.pricingId, pricing({ id: model.resources.api.pricingId, currency: 'EUR' })]]);
  const f = apiForecast({ model, pricingById: byId, workloads: cfg.workloads, phase: 'apply', effort: 'high', workload, currency: 'USD' });
  assert.equal(f.status, 'unknown');
  assert.ok(f.notes.some((n) => /no conversion/.test(n)));
  const byId2 = new Map([[model.resources.api.pricingId, pricing({ id: model.resources.api.pricingId })]]);
  const g = apiForecast({ model, pricingById: byId2, workloads: cfg.workloads, phase: 'apply', effort: 'high', workload, currency: 'USD' });
  assert.equal(g.status, 'known');
  assert.ok(g.lowMicros <= g.typicalMicros && g.typicalMicros <= g.highMicros);
  assert.equal(g.kind, 'scenario-forecast');
  assert.deepEqual(g.usageRecord, { value: model.resources.api.usage.apply.high.value, unit: 'token-workload-multiplier-bp', status: 'heuristic', basis: model.resources.api.usage.apply.high.basis });
  model.resources.api.usage.apply.high = { value: null, status: 'unknown', basis: 'no data' };
  const u = apiForecast({ model, pricingById: byId2, workloads: cfg.workloads, phase: 'apply', effort: 'high', workload, currency: 'USD' });
  assert.equal(u.status, 'unknown');
  assert.equal(u.highMicros, null, 'unknown usage is not zero cost');
});

test('cheaper per-token model that needs more tokens can cost more per task', () => {
  const cfg = defaults();
  const [a, b] = [cfg.models[0], cfg.models[1]];
  a.resources.api.usage.apply.high.value = 10000;
  b.resources.api.usage.apply.high.value = 40000;
  const byId = new Map([
    [a.resources.api.pricingId, pricing({ id: a.resources.api.pricingId })],
    [b.resources.api.pricingId, pricing({ id: b.resources.api.pricingId, rates: { uncachedInput: 1000000, cacheRead: 100000, cacheWrite: 1250000, output: 5000000, reasoning: null } })],
  ]);
  const workload = { low: 'm', typical: 'm', high: 'm' };
  const ca = apiForecast({ model: a, pricingById: byId, workloads: cfg.workloads, phase: 'apply', effort: 'high', workload, currency: 'USD' });
  const cb = apiForecast({ model: b, pricingById: byId, workloads: cfg.workloads, phase: 'apply', effort: 'high', workload, currency: 'USD' });
  assert.ok(cb.highMicros > ca.highMicros, 'per-task forecast, not price per million, decides');
});

test('subscription load is separate from API price; no observation → unknown capacity', () => {
  const cfg = defaults();
  const model = cfg.models[0];
  const pools = new Map(cfg.quotaPools.map((p) => [p.id, p]));
  const f = subscriptionForecast({ model, poolById: pools, workloads: cfg.workloads, phase: 'apply', effort: 'high', workload: { low: 's', typical: 's', high: 's' }, asOf: null });
  assert.equal(f.kind, 'relative-load-forecast');
  assert.equal(f.capacity.status, 'unknown');
  assert.match(f.capacity.reason, /no quota observation/);
  // API pricing must not influence load
  const cfg2 = defaults();
  cfg2.pricing[0] = pricing({ id: cfg2.pricing[0].id });
  const r1 = evaluate({ profile: criticalProfile(), config: cfg, benchmarks: benchmarks() });
  const r2 = evaluate({ profile: criticalProfile(), config: cfg2, benchmarks: benchmarks() });
  assert.equal(canonicalStringify(r1.rankings['apply/subscription']), canonicalStringify(r2.rankings['apply/subscription']));
});

test('shared quota pool is reported once and not cloned per model', () => {
  const r = evaluate({ profile: criticalProfile(), config: defaults(), benchmarks: benchmarks() });
  const pools = r.rankings['apply/subscription'].pools;
  const codex = pools.find((p) => p.poolId === 'codex-plan');
  assert.equal(codex.shared, true);
  assert.equal(codex.candidates.length, 4);
  assert.match(codex.note, /does not create a new independent limit/);
  assert.equal(pools.filter((p) => p.poolId === 'codex-plan').length, 1);
});

function withObservation(remaining, conversion = { quotaUnitsPer1000Load: 1000, unit: 'credits', source: 'user-confirmed plan table' }) {
  const cfg = defaults();
  for (const m of cfg.models) m.availability = 'available';
  cfg.quotaPools[0].observation = { observedAt: '2026-11-14T08:00:00Z', maxAgeHours: 6, remaining, unit: 'credits', resetAt: '2026-11-15T00:00:00Z', source: 'usage page' };
  cfg.quotaPools[0].conversion = conversion;
  return cfg;
}

test('observation freshness depends only on explicit as-of, not on the system clock', () => {
  const cfg = withObservation(100000);
  const realNow = Date.now;
  const RealDate = Date;
  try {
    Date.now = () => { throw new Error('clock must not be read'); };
    const fresh = evaluate({ profile: criticalProfile(), config: cfg, benchmarks: benchmarks(), asOf: '2026-11-14T09:00:00Z' });
    const c = fresh.rankings['apply/subscription'].candidates.find((x) => x.harness === 'codex');
    assert.equal(c.resource.pool.status, 'fresh');
    assert.equal(c.resource.capacity.status, 'fits');
  } finally { Date.now = realNow; globalThis.Date = RealDate; }
  const expired = evaluate({ profile: criticalProfile(), config: cfg, benchmarks: benchmarks(), asOf: '2026-11-14T20:00:00Z' });
  assert.equal(expired.rankings['apply/subscription'].candidates.find((x) => x.harness === 'codex').resource.pool.status, 'expired');
  const noAsOf = evaluate({ profile: criticalProfile(), config: cfg, benchmarks: benchmarks() });
  assert.match(noAsOf.rankings['apply/subscription'].candidates.find((x) => x.harness === 'codex').resource.pool.reason, /no explicit as-of/);
  assert.equal(poolStatus(cfg.quotaPools[0], '2026-11-15T00:00:00Z').status, 'expired');
});

test('known quota shortfall excludes, possible shortfall is provisional, missing conversion stays unknown', () => {
  const asOf = '2026-11-14T09:00:00Z';
  const short = evaluate({ profile: mechanicalProfile(), config: withObservation(1), benchmarks: benchmarks(), asOf });
  const ex = short.rankings['apply/subscription'].excluded.filter((x) => x.candidateId.startsWith('codex/'));
  assert.equal(ex.length, 4);
  assert.match(ex[0].reasons[0], /known quota shortfall/);
  const noConv = evaluate({ profile: mechanicalProfile(), config: withObservation(1, null), benchmarks: benchmarks(), asOf });
  const c = noConv.rankings['apply/subscription'].candidates.find((x) => x.harness === 'codex');
  assert.equal(c.resource.capacity.status, 'unknown');
  assert.match(c.resource.capacity.reason, /percentages are not invented/);
});
