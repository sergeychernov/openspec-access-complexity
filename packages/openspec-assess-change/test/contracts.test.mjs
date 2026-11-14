import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  canonicalStringify, parseJsonStrict, CanonicalError, profileErrors, configErrors, benchmarksErrors,
  structuralErrors, evaluate, mulDiv, normalize, weightedAverage,
} from '../src/core/index.mjs';
import { clone } from '../src/core/canonical.mjs';
import { mechanicalProfile, criticalProfile, defaults, benchmarks, PKG } from './helpers.mjs';

test('valid fixtures pass structural and semantic validation', () => {
  assert.deepEqual(profileErrors(mechanicalProfile()), []);
  assert.deepEqual(profileErrors(criticalProfile()), []);
  assert.deepEqual(configErrors(defaults()), []);
  assert.deepEqual(benchmarksErrors(benchmarks()), []);
});

test('unsupported schema versions are rejected without interpretation', () => {
  for (const [type, doc] of [['profile', mechanicalProfile()], ['config', defaults()], ['benchmarks', benchmarks()]]) {
    const d = clone(doc);
    d.schemaVersion = 9;
    const errs = type === 'profile' ? profileErrors(d) : type === 'config' ? configErrors(d) : benchmarksErrors(d);
    assert.equal(errs.length, 1, type);
    assert.equal(errs[0].path, '/schemaVersion');
    assert.match(errs[0].message, /unsupported .* schemaVersion 9/);
  }
  const wrongKind = { ...mechanicalProfile(), kind: 'openspec-assess.config' };
  assert.equal(profileErrors(wrongKind)[0].path, '/kind');
});

test('invalid types, ranges and unknown fields are reported with field paths', () => {
  const p = mechanicalProfile();
  p.factors.logic.level = 5;
  p.factors.layers.level = '2';
  p.extra = true;
  const errs = profileErrors(p);
  const paths = errs.map((e) => e.path);
  assert.ok(paths.includes('/factors/logic/level'));
  assert.ok(paths.includes('/factors/layers/level'));
  assert.ok(paths.includes('/extra'));
  const c = defaults();
  c.models[0].typo = 1;
  assert.ok(configErrors(c).some((e) => e.path === '/models/0/typo' && /unknown field/.test(e.message)));
});

test('duplicate IDs are rejected', () => {
  const p = mechanicalProfile();
  p.evidence.push({ ...p.evidence[0] });
  assert.ok(profileErrors(p).some((e) => /duplicate evidence id "proposal"/.test(e.message)));
  const c = defaults();
  c.models.push({ ...clone(c.models[0]) });
  const ce = configErrors(c);
  assert.ok(ce.some((e) => /duplicate id "codex.astra"/.test(e.message)));
  assert.ok(ce.some((e) => /candidate codex\/gpt-6-astra is defined twice/.test(e.message)));
  const b = benchmarks();
  const rec = { id: 'r1', benchmark: { name: 'X', version: '1' }, source: { url: 'https://x', publisher: 'x', retrievedAt: '2026-01-01', kind: 'independent' }, model: { modelId: 'm', harness: 'h', effort: 'high' }, metric: 'pass', score: 5000, unit: 'bp' };
  b.records.push(rec, { ...rec });
  assert.ok(benchmarksErrors(b).some((e) => /duplicate record id/.test(e.message)));
});

test('duplicate JSON keys and non-integer numbers are rejected', () => {
  assert.throws(() => parseJsonStrict('{"a":1,"a":2}'), /duplicate object key "a"/);
  assert.throws(() => canonicalStringify({ a: 1.5 }), CanonicalError);
  assert.throws(() => canonicalStringify({ a: NaN }), CanonicalError);
  assert.throws(() => canonicalStringify({ a: Infinity }), CanonicalError);
  assert.equal(canonicalStringify({ a: -0 }), '{"a":0}');
});

test('canonical serialization ignores key order and sorts by code units', () => {
  const a = { b: 1, a: { d: [3, { y: 1, x: 2 }], c: 'é' }, B: true, 'ä': null };
  const b = { 'ä': null, B: true, a: { c: 'é', d: [3, { x: 2, y: 1 }] }, b: 1 };
  assert.equal(canonicalStringify(a), canonicalStringify(b));
  assert.equal(canonicalStringify(a), '{"B":true,"a":{"c":"é","d":[3,{"x":2,"y":1}]},"b":1,"ä":null}');
});

test('report bytes are identical for permuted input keys', () => {
  const p = mechanicalProfile();
  const reverseDeep = (v) => (Array.isArray(v) ? v.map(reverseDeep) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, reverseDeep(v[k])])) : v);
  const r1 = canonicalStringify(evaluate({ profile: p, config: defaults(), benchmarks: benchmarks() }), { pretty: true });
  const r2 = canonicalStringify(evaluate({ profile: reverseDeep(p), config: reverseDeep(defaults()), benchmarks: reverseDeep(benchmarks()) }), { pretty: true });
  assert.equal(r1, r2);
});

test('output does not depend on locale or timezone of the host', () => {
  const script = `
    import { evaluate, canonicalStringify, renderMarkdown } from './src/core/index.mjs';
    import { mechanicalProfile, defaults, benchmarks } from './test/helpers.mjs';
    const r = evaluate({ profile: mechanicalProfile(), config: defaults(), benchmarks: benchmarks() });
    process.stdout.write(canonicalStringify(r) + renderMarkdown(r));
  `;
  const run = (env) => spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: PKG, env: { ...process.env, ...env }, encoding: 'utf8' });
  const a = run({ LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', TZ: 'UTC' });
  const b = run({ LANG: 'tr_TR.UTF-8', LC_ALL: 'tr_TR.UTF-8', TZ: 'Pacific/Kiritimati' });
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);
  assert.equal(a.stdout, b.stdout);
});

test('integer arithmetic floors and never produces fractions', () => {
  assert.equal(mulDiv(7, 3, 2), 10);
  assert.equal(mulDiv(-7, 3, 2), -11);
  assert.equal(normalize(5, 10), 5000);
  assert.equal(normalize(50, 10), 10000);
  assert.equal(weightedAverage([[1, 3], [2, 4]]), 3);
  assert.equal(weightedAverage([[0, 3]]), null);
  assert.equal(mulDiv(Number.MAX_SAFE_INTEGER, 2, 4), Math.floor(Number.MAX_SAFE_INTEGER / 2));
});

test('generated report satisfies the strict report schema', () => {
  const r = evaluate({ profile: criticalProfile(), config: defaults(), benchmarks: benchmarks() });
  assert.deepEqual(structuralErrors('report', r), []);
  const bad = clone(r);
  bad.rankings['apply/api'].surprise = 1;
  assert.ok(structuralErrors('report', bad).some((e) => e.path === '/rankings/apply~1api/surprise'));
});
