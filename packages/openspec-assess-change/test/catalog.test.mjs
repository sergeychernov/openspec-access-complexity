import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { provenanceErrors, benchmarksErrors, configErrors, FACTOR_IDS } from '../src/core/index.mjs';
import { defaults, benchmarks, PKG } from './helpers.mjs';

const FAMILIES = {
  codex: ['Astra', 'Sol', 'Terra', 'Luna'],
  'claude-code': ['Opus', 'Sonnet', 'Haiku'],
  antigravity: ['Argon', 'Hydrogen', 'Flash'],
};

test('3.1 one pinned entry per agreed family, with sources, check date and no "latest"', () => {
  const cfg = defaults();
  assert.equal(cfg.models.length, 10);
  for (const [harness, fams] of Object.entries(FAMILIES)) {
    for (const f of fams) {
      const m = cfg.models.filter((x) => x.harness === harness && x.family === f);
      assert.equal(m.length, 1, `${harness}/${f}`);
      assert.doesNotMatch(m[0].modelId, /latest/i);
      assert.equal(m[0].identity.checkedAt, cfg.catalog.verifiedAt);
      const srcIds = new Set(cfg.catalog.sources.map((s) => s.id));
      for (const s of m[0].identity.sources) assert.ok(srcIds.has(s), s);
    }
  }
});

test('3.1 confirmed identities carry a client id equal to the model id; unconfirmed ones are not synthesized', () => {
  for (const m of defaults().models) {
    if (m.identity.status === 'confirmed') assert.equal(m.clientModelId, m.modelId, m.id);
    else assert.equal(m.clientModelId, null, `${m.id}: client id must not be synthesized from the display name`);
    assert.equal(m.availability, 'unknown', 'account availability is configured separately');
    assert.ok(m.supportedEfforts.length > 0);
    for (const e of m.supportedEfforts) assert.match(e, /^(low|medium|high|xhigh|max)$/);
  }
});

test('3.2 benchmark snapshot: independent records with provenance, units, versions and no duplicates', () => {
  const b = benchmarks();
  assert.deepEqual(benchmarksErrors(b), []);
  const cfg = defaults();
  const cands = new Set(cfg.models.map((m) => `${m.harness}/${m.modelId}`));
  for (const r of b.records) {
    assert.equal(r.source.kind, 'independent');
    assert.match(r.source.url, /^https:\/\//);
    assert.ok(r.benchmark.version && r.unit && r.source.retrievedAt);
    assert.ok(cands.has(`${r.model.harness}/${r.model.modelId}`), `${r.id} measures a catalog candidate exactly`);
    assert.ok(cfg.models.find((m) => m.modelId === r.model.modelId).supportedEfforts.includes(r.model.effort), `${r.id} effort is supported`);
  }
  for (const m of b.mappings) {
    assert.equal(m.relation, 'proxy', 'an aggregate coding index is never a direct factor measurement');
    assert.equal(m.phase, 'apply', 'no verify mapping without a comparable verify measurement');
  }
});

test('3.3/9.2 every estimate is an explicit labelled record; nothing heuristic is measured or proxy', () => {
  const cfg = defaults();
  assert.deepEqual(configErrors(cfg), []);
  assert.deepEqual(provenanceErrors(cfg, benchmarks()), []);
  let supported = 0;
  for (const m of cfg.models) {
    for (const phase of ['apply', 'verify']) {
      assert.deepEqual(Object.keys(m.quality[phase]).sort(), [...m.supportedEfforts].sort(), `${m.id} ${phase}: one row per supported effort`);
      for (const e of m.supportedEfforts) {
        for (const f of FACTOR_IDS) {
          const c = m.quality[phase][e][f];
          assert.ok(c.basis.includes(`effort ${e}`), `${m.id} ${phase}/${e}/${f} basis names its effort`);
          assert.equal(c.status, 'heuristic');
          assert.equal(c.sources, undefined, 'no number is derived from a benchmark');
          if (c.support) { supported += 1; assert.equal(phase, 'apply'); }
        }
      }
    }
  }
  assert.ok(supported > 0, 'the independent index is shown as supporting evidence');
  for (const key of ['complexityRules', 'workloads', 'selection']) assert.ok(cfg[key].basis.length > 20, `${key} basis`);
  for (const phase of ['apply', 'verify']) assert.ok(cfg.phases[phase].basis.length > 20);
});

test('3.3 heuristic tier order agrees with the independent index inside each harness', () => {
  const cfg = defaults();
  const index = benchmarks().records.filter((r) => r.metric === 'index');
  for (const harness of Object.keys(FAMILIES)) {
    const rows = index.filter((r) => r.model.harness === harness)
      .map((r) => ({ score: r.score, coef: cfg.models.find((m) => m.modelId === r.model.modelId).quality.apply[r.model.effort].logic.value }));
    for (const a of rows) for (const c of rows) if (a.score > c.score) assert.ok(a.coef >= c.coef, `${harness}: higher index must not get a lower prior`);
  }
});

test('9.2 tier-based per-effort values: apply and verify independent, plateaus allowed, no shared delta', () => {
  const cfg = defaults();
  const m = (id) => cfg.models.find((x) => x.id === id);
  const v = (id, phase, e, f = 'volume') => m(id).quality[phase][e][f].value;
  assert.equal(v('codex.astra', 'apply', 'medium'), 8200);
  assert.equal(v('codex.astra', 'verify', 'medium'), 8000, 'verify is its own table, not the apply value');
  assert.equal(v('claude-code.haiku', 'apply', 'xhigh'), v('claude-code.haiku', 'apply', 'max'), 'equal values across efforts are kept');
  const steps = (id) => m(id).supportedEfforts.slice(1).map((e, i) => v(id, 'apply', e) - v(id, 'apply', m(id).supportedEfforts[i]));
  assert.notDeepEqual(steps('codex.luna'), steps('codex.astra'), 'effort steps are not one shared delta curve');
  for (const x of cfg.models) assert.ok(x.quality.apply.medium.architecture.value <= x.quality.apply.medium.volume.value);
  assert.equal(JSON.stringify(cfg).includes('effortDelta'), false);
  assert.equal(JSON.stringify(cfg).includes('"base"'), false);
});

test('9.3 resource records exist per model, phase and effort with units and provenance', () => {
  const cfg = defaults();
  for (const x of cfg.models) {
    for (const [t, unit] of [[x.resources.api.usage, 'token-workload-multiplier-bp'], [x.resources.subscription.load, 'load-workload-multiplier-bp'], [x.resources.time.minutes, 'time-workload-multiplier-bp']]) {
      assert.equal(t.unit, unit);
      for (const phase of ['apply', 'verify']) {
        assert.deepEqual(Object.keys(t[phase]).sort(), [...x.supportedEfforts].sort());
        for (const e of x.supportedEfforts) {
          assert.ok(Number.isSafeInteger(t[phase][e].value));
          assert.equal(t[phase][e].status, 'heuristic');
          assert.ok(t[phase][e].basis.includes(`effort ${e}`));
        }
      }
    }
  }
});

test('3.3 confirmed list prices are recorded in micros with a source; unknown prices stay unknown', () => {
  const cfg = defaults();
  for (const p of cfg.pricing) {
    if (p.status === 'confirmed') {
      assert.match(p.source.url, /^https:\/\//);
      for (const v of Object.values(p.rates)) assert.ok(v === null || Number.isSafeInteger(v));
      assert.ok(p.rates.uncachedInput > 0 && p.rates.output > 0);
    } else {
      assert.ok(Object.values(p.rates).every((v) => v === null));
    }
  }
  const opus = cfg.pricing.find((p) => p.id === 'claude-code.opus.standard');
  assert.deepEqual(opus.rates, { uncachedInput: 4000000, cacheRead: 200000, cacheWrite: 5000000, output: 20000000, reasoning: null });
});

test('shipped defaults are regenerated exactly by the documented build script', () => {
  const r = spawnSync(process.execPath, ['scripts/build-defaults.mjs', '--check'], { cwd: PKG, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const s = spawnSync(process.execPath, ['scripts/generate-schemas.mjs', '--check'], { cwd: PKG, encoding: 'utf8' });
  assert.equal(s.status, 0, s.stderr);
});
