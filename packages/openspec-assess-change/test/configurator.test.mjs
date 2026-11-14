import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { request } from 'node:http';
import {
  effectiveFrom, exportOverrides, preview, matrix, setEstimate, setEstimateFromText, setResource, resetEstimate, setModelField, setPath, resetToDefaults,
  compareReports, reportBytes, allLevels, provenanceCard, configDigestText, WEIGHT_LABEL, WEIGHT_HELP,
  setResourceFromText, parseRequiredInt, parsePercentBp, setTimePenalty, economicsView, CLEAR_HELP,
} from '../configurator/model.mjs';
import { startServer, resolveRequestPath } from '../src/node/server.mjs';
import { canonicalStringify, FACTOR_IDS, formatScore, parseScore, mergeConfig } from '../src/core/index.mjs';
import { defaults, benchmarks, PKG, loadJson } from './helpers.mjs';

const golden = (n) => readFileSync(join(PKG, 'examples', 'golden', n), 'utf8');
const AS_OF = '2026-11-14T12:00:00Z';

test('7.2 configurator preview reproduces the CLI golden report byte for byte', () => {
  const d = defaults();
  const edited = effectiveFrom(d, loadJson('examples/golden/overrides.json'));
  const r = preview({ defaults: d, edited, profile: loadJson('examples/golden/profile.json'), benchmarks: benchmarks(), asOf: AS_OF });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(reportBytes(r.report), golden('report.json'));
});

test('7.1 matrix exposes every factor × model for each phase with provenance of the shown effort', () => {
  const cfg = effectiveFrom(defaults(), null);
  for (const phase of ['apply', 'verify']) {
    const m = matrix(cfg, phase);
    assert.deepEqual(m.map((r) => r.factor), FACTOR_IDS);
    for (const row of m) {
      assert.equal(row.cells.length, 10);
      for (const c of row.cells) assert.ok(c.status && c.basis && c.letter && c.effort);
    }
  }
});

test('7.1 editing estimates, weights, model fields and resources round-trips through export', () => {
  const d = defaults();
  let cfg = effectiveFrom(d, null);
  cfg = setEstimate(cfg, 'codex.sol', 'apply', 'high', 'architecture', 9100);
  cfg = setEstimate(cfg, 'codex.sol', 'verify', 'medium', 'testability', null);
  cfg = setPath(cfg, '/phases/verify/relevanceWeights/consequences', 0);
  cfg = setModelField(cfg, 'claude-code.haiku', 'enabled', false);
  cfg = setModelField(cfg, 'antigravity.flash', 'efforts', ['low']);
  cfg = setPath(cfg, '/selection/subscription/timePenalty/rateBp', 0);
  cfg = setResource(cfg, 'codex.terra', 'load', 'apply', 'low', 5000);
  cfg = setPath(cfg, `/pricing/${cfg.pricing.findIndex((p) => p.id === 'antigravity.argon.standard')}/rates/output`, 12000000);
  const ov = exportOverrides(d, cfg);
  const back = effectiveFrom(d, ov);
  const sol = back.models.find((m) => m.id === 'codex.sol');
  assert.equal(sol.quality.apply.high.architecture.value, 9100);
  assert.equal(sol.quality.apply.high.architecture.status, 'user-override');
  assert.equal(sol.quality.apply.high.architecture.origin.value, d.models.find((m) => m.id === 'codex.sol').quality.apply.high.architecture.value, 'original record exported with the override');
  assert.equal(sol.quality.verify.medium.testability.status, 'unknown');
  assert.equal(sol.quality.apply.medium.architecture.value, d.models.find((m) => m.id === 'codex.sol').quality.apply.medium.architecture.value, 'other efforts untouched');
  assert.equal(back.phases.verify.relevanceWeights.consequences, 0, 'explicit 0 survives export');
  assert.equal(back.models.find((m) => m.id === 'claude-code.haiku').enabled, false, 'explicit false survives export');
  assert.deepEqual(back.models.find((m) => m.id === 'antigravity.flash').efforts, ['low']);
  assert.equal(back.selection.subscription.timePenalty.rateBp, 0, 'k = 0 survives export');
  assert.equal(back.models.find((m) => m.id === 'codex.terra').resources.subscription.load.apply.low.value, 5000);
  assert.ok(JSON.stringify(ov).length < 8000, 'export is a minimal override document, not a full copy');
});

test('9.5 the 0–100 scale round-trips exactly and rejects bad input without rounding', () => {
  for (const [bp, text] of [[0, '0'], [8200, '82'], [8201, '82.01'], [10000, '100']]) {
    assert.equal(formatScore(bp), text);
    assert.deepEqual(parseScore(text), { ok: true, bp });
  }
  for (const bad of ['100.01', '82.001', '-1', '101', '1e2', '82,5', 'NaN', 'Infinity', '']) assert.equal(parseScore(bad).ok, false, bad);
  const d = defaults();
  const cfg = effectiveFrom(d, null);
  const r = setEstimateFromText(cfg, 'codex.sol', 'apply', 'high', 'logic', '82.01');
  assert.equal(r.config.models.find((m) => m.id === 'codex.sol').quality.apply.high.logic.value, 8201);
  const exported = exportOverrides(d, r.config);
  assert.match(JSON.stringify(exported), /"value":8201/, 'export keeps integer bp');
  assert.equal(setEstimateFromText(cfg, 'codex.sol', 'apply', 'high', 'logic', '82.015').ok, false);
  const unknown = setEstimate(cfg, 'codex.sol', 'apply', 'high', 'logic', null);
  const rec = unknown.models.find((m) => m.id === 'codex.sol').quality.apply.high.logic;
  assert.deepEqual([rec.value, rec.status], [null, 'unknown']);
  assert.equal(rec.origin.value, cfg.models.find((m) => m.id === 'codex.sol').quality.apply.high.logic.value, '"Нет данных" keeps the previous record separately');
  assert.equal(WEIGHT_LABEL.apply, 'Важность параметра для реализации');
  assert.equal(WEIGHT_LABEL.verify, 'Важность параметра для проверки');
  assert.match(WEIGHT_HELP, /вес 2 даёт вдвое больший вклад, чем вес 1/);
  assert.match(WEIGHT_HELP, /не отменяет обязательные ограничения/);
});

test('9.5 display formatting never changes ranks: report bytes are identical whatever is displayed', () => {
  const d = defaults();
  const profile = loadJson('examples/golden/profile.json');
  const edited = effectiveFrom(d, loadJson('examples/golden/overrides.json'));
  const a = preview({ defaults: d, edited, profile, benchmarks: benchmarks(), asOf: AS_OF });
  const roundTrip = setEstimateFromText(edited, 'codex.sol', 'apply', 'high', 'logic', formatScore(edited.models.find((m) => m.id === 'codex.sol').quality.apply.high.logic.value));
  const b = preview({ defaults: d, edited: roundTrip.config, profile, benchmarks: benchmarks(), asOf: AS_OF });
  const order = (r) => Object.fromEntries(Object.entries(r.report.rankings).map(([k, v]) => [k, v.candidates.map((c) => [c.candidateId, c.suitability.valueBp])]));
  assert.deepEqual(order(b), order(a));
});

test('9.6 the effort shown in a column is view state: config digest and rankings do not change', () => {
  const d = defaults();
  const cfg = effectiveFrom(d, loadJson('examples/golden/overrides.json'));
  const before = configDigestText(cfg);
  const m1 = matrix(cfg, 'apply', { 'codex.astra': 'medium', 'codex.sol': 'high' });
  const astra = m1[0].cells.find((c) => c.modelId === 'codex.astra');
  const sol = m1[0].cells.find((c) => c.modelId === 'codex.sol');
  assert.equal(astra.effort, 'medium');
  assert.equal(sol.effort, 'high');
  assert.equal(sol.value, cfg.models.find((m) => m.id === 'codex.sol').quality.apply.high.volume.value);
  assert.equal(configDigestText(cfg), before, 'viewing does not edit the config');
  const allowedOnly = setModelField(cfg, 'codex.sol', 'efforts', ['low']);
  assert.equal(matrix(allowedOnly, 'apply', { 'codex.sol': 'max' })[0].cells.find((c) => c.modelId === 'codex.sol').effort, 'max', 'view is independent of allowed efforts');
});

test('9.6 "Все уровни" lists only supported efforts and edits exactly one cell with its own provenance', () => {
  const d = defaults();
  const cfg = effectiveFrom(d, null);
  const t = allLevels(cfg, 'antigravity.hydrogen', 'verify');
  assert.deepEqual(t.efforts, ['low', 'medium', 'high', 'xhigh']);
  assert.equal(t.quality.length, FACTOR_IDS.length);
  assert.deepEqual(t.resources.map((r) => r.kind), ['usage', 'load', 'minutes']);
  assert.ok(t.resources.every((r) => r.cells.every((c) => c.display.startsWith('×'))), 'resources keep their own units, not 0–100');
  const edited = setEstimate(cfg, 'antigravity.hydrogen', 'verify', 'xhigh', 'logic', 7000);
  const t2 = allLevels(edited, 'antigravity.hydrogen', 'verify');
  const changed = [];
  t2.quality.forEach((row, i) => row.cells.forEach((c, j) => { if (c.status !== t.quality[i].cells[j].status || c.value !== t.quality[i].cells[j].value) changed.push(`${row.factor}/${c.effort}`); }));
  assert.deepEqual(changed, ['logic/xhigh']);
  assert.equal(t2.quality.find((r) => r.factor === 'logic').cells.find((c) => c.effort === 'xhigh').letter, 'o');
  assert.deepEqual(allLevels(edited, 'antigravity.hydrogen', 'apply'), allLevels(cfg, 'antigravity.hydrogen', 'apply'), 'the other phase is untouched');
  assert.throws(() => setEstimate(cfg, 'antigravity.flash', 'apply', 'max', 'logic', 5000), /not supported/);
});

test('9.7 provenance card resolves supporting evidence, origin and inherited identity; JSON keeps full status IDs', () => {
  const d = defaults();
  const cfg = effectiveFrom(d, null);
  const rec = cfg.models.find((m) => m.id === 'codex.sol').quality.apply.high.logic;
  const card = provenanceCard(rec, benchmarks(), { phase: 'apply', factor: 'logic' });
  assert.equal(card.letter, 'h');
  assert.equal(card.status, 'heuristic');
  assert.deepEqual(card.sources, [], 'nothing derives the number');
  assert.equal(card.support[0].id, 'aa-cai-2.1.codex.sol.max');
  assert.equal(card.support[0].effort, 'max');
  assert.equal(card.support[0].retrievedAt, '2026-11-14');
  assert.match(card.support[0].benchmark, /v2\.1/);
  const edited = setEstimate(cfg, 'codex.sol', 'apply', 'high', 'logic', 9000, 'own runs');
  const c2 = provenanceCard(edited.models.find((m) => m.id === 'codex.sol').quality.apply.high.logic, benchmarks(), { phase: 'apply', factor: 'logic' });
  assert.equal(c2.letter, 'o');
  assert.equal(c2.basis, 'own runs');
  assert.equal(c2.origin.status, 'heuristic');
  assert.equal(c2.origin.support[0].id, 'aa-cai-2.1.codex.sol.max');
  const exported = JSON.stringify(exportOverrides(d, edited));
  assert.match(exported, /"status":"user-override"/);
  assert.doesNotMatch(exported, /"status":"[phoum]"/, 'letters are display only');
  const reset = resetEstimate(edited, d, 'codex.sol', 'apply', 'high', 'logic');
  assert.deepEqual(exportOverrides(d, reset).set, {}, 'reset restores the default record with its provenance');
  const moved = mergeConfig(d, { kind: 'openspec-assess.overrides', schemaVersion: 3, set: { models: [{ id: 'codex.sol', modelId: 'gpt-6.2-sol' }] } });
  const c3 = provenanceCard(moved.models.find((m) => m.id === 'codex.sol').quality.apply.high.logic, benchmarks(), { phase: 'apply', factor: 'logic' });
  assert.deepEqual(c3.inheritedFrom, { modelId: 'gpt-6.1-sol', harness: 'codex', status: 'heuristic' });
});

test('7.1 schema errors are reported with field paths instead of a preview', () => {
  const d = defaults();
  let cfg = effectiveFrom(d, null);
  cfg = setEstimate(cfg, 'codex.sol', 'apply', 'low', 'logic', 12000);
  const r = preview({ defaults: d, edited: cfg, profile: loadJson('examples/golden/profile.json'), benchmarks: benchmarks() });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /logic/.test(e.path)));
  cfg = setModelField(effectiveFrom(d, null), 'antigravity.flash', 'efforts', ['xhigh']);
  const r2 = preview({ defaults: d, edited: cfg, profile: loadJson('examples/golden/profile.json'), benchmarks: benchmarks() });
  assert.ok(r2.errors.some((e) => /not in supportedEfforts/.test(e.message)));
});

test('7.2 reset restores selected defaults; defaults and input files are never modified', () => {
  const before = readFileSync(join(PKG, 'config', 'defaults.json'), 'utf8');
  const goldenBefore = golden('overrides.json');
  const d = defaults();
  let cfg = setEstimate(effectiveFrom(d, null), 'codex.sol', 'apply', 'low', 'logic', 100);
  cfg = setPath(cfg, '/selection/api/timePenalty/graceMinutes', 45);
  cfg = resetToDefaults(cfg, d, { models: ['codex.sol'] });
  assert.deepEqual(cfg.models.find((m) => m.id === 'codex.sol'), d.models.find((m) => m.id === 'codex.sol'));
  assert.equal(cfg.selection.api.timePenalty.graceMinutes, 45, 'not selected → kept');
  cfg = resetToDefaults(cfg, d, { groups: ['selection'] });
  assert.deepEqual(exportOverrides(d, cfg).set, {});
  assert.equal(readFileSync(join(PKG, 'config', 'defaults.json'), 'utf8'), before);
  assert.equal(golden('overrides.json'), goldenBefore);
});

test('7.2 rank comparison shows movement and threshold changes against a baseline', () => {
  const d = defaults();
  const profile = loadJson('examples/golden/profile.json');
  const start = effectiveFrom(d, loadJson('examples/golden/overrides.json'));
  const a = preview({ defaults: d, edited: start, profile, benchmarks: benchmarks(), asOf: AS_OF });
  let up = start;
  for (const e of start.models.find((m) => m.id === 'codex.luna').supportedEfforts) up = setEstimate(up, 'codex.luna', 'apply', e, 'logic', 10000);
  const b = preview({ defaults: d, edited: up, profile, benchmarks: benchmarks(), asOf: AS_OF });
  const cmp = compareReports(a.report, b.report);
  const luna = cmp['apply/api'].find((c) => c.candidateId === 'codex/gpt-6-luna');
  assert.ok(luna.delta >= 0);
  assert.deepEqual(cmp['verify/api'].map((c) => c.delta), cmp['verify/api'].map(() => 0), 'verify is unaffected by an apply edit');
});

function get(url, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('7.3 server binds to loopback, serves only allowlisted package files and has no write method', async () => {
  assert.throws(() => startServer({ host: '0.0.0.0' }), /loopback only/);
  const srv = await startServer();
  try {
    assert.match(srv.url, /^http:\/\/127\.0\.0\.1:\d+\/configurator\/index\.html$/);
    const base = `http://127.0.0.1:${srv.port}`;
    const root = await get(`${base}/`);
    assert.equal(root.status, 302);
    assert.equal(root.headers.location, '/configurator/index.html');
    const page = await get(`${base}/configurator/index.html`);
    assert.equal(page.status, 200);
    assert.match(page.headers['content-security-policy'], /default-src 'none'/);
    assert.equal((await get(`${base}/src/core/index.mjs`)).status, 200);
    assert.equal((await get(`${base}/config/defaults.json`)).status, 200);
    for (const p of ['/package.json', '/src/node/fsio.mjs', '/bin/openspec-assess.mjs', '/configurator/../package.json', '/%2e%2e/%2e%2e/etc/passwd', '/examples/demo-project/src/greet.mjs']) {
      assert.equal((await get(`${base}${p}`)).status, 404, p);
    }
    for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.equal((await get(`${base}/config/defaults.json`, m)).status, 405, m);
    assert.equal((await get(`${base}/configurator/index.html`, 'GET', { Host: 'evil.example' })).status, 421, 'DNS-rebinding host is refused');
  } finally {
    await srv.close();
  }
});

test('7.3 configurator assets reference no external resources', () => {
  for (const f of readdirSync(join(PKG, 'configurator'))) {
    const text = readFileSync(join(PKG, 'configurator', f), 'utf8');
    assert.doesNotMatch(text, /https?:\/\/(?!127\.0\.0\.1)/, `${f} must not load remote resources`);
    assert.doesNotMatch(text, /@import|fonts\.googleapis|cdn\./);
  }
  assert.equal(resolveRequestPath('/configurator/index.html') !== null, true);
  assert.ok(canonicalStringify({}) === '{}');
});

// ------------------------------------------------------------------ 10.4 / 10.7

test('10.4 clearing a nullable field means "no data": unknown with origin and letter u; 0 stays a number', () => {
  const d = defaults();
  const cfg = effectiveFrom(d, null);
  for (const text of ['', '   ', '\t']) {
    const r = setEstimateFromText(cfg, 'codex.astra', 'apply', 'high', 'logic', text);
    assert.equal(r.ok, true);
    const rec = r.config.models.find((m) => m.id === 'codex.astra').quality.apply.high.logic;
    assert.deepEqual([rec.value, rec.status], [null, 'unknown']);
    assert.equal(rec.origin.value, cfg.models.find((m) => m.id === 'codex.astra').quality.apply.high.logic.value, 'previous value kept');
    assert.equal(allLevels(r.config, 'codex.astra', 'apply').quality.find((x) => x.factor === 'logic').cells.find((c) => c.effort === 'high').letter, 'u');
  }
  const zero = setEstimateFromText(cfg, 'codex.astra', 'apply', 'high', 'logic', '0');
  assert.equal(zero.config.models.find((m) => m.id === 'codex.astra').quality.apply.high.logic.value, 0);
  assert.equal(setEstimateFromText(cfg, 'codex.astra', 'apply', 'high', 'logic', 'abc').ok, false, 'non-empty invalid input is an error');
  const res = setResourceFromText(cfg, 'codex.astra', 'minutes', 'apply', 'high', ' ');
  const rr = res.config.models.find((m) => m.id === 'codex.astra').resources.time.minutes.apply.high;
  assert.deepEqual([rr.value, rr.status], [null, 'unknown']);
  assert.ok(rr.origin.value > 0);
  assert.equal(setResourceFromText(cfg, 'codex.astra', 'minutes', 'apply', 'high', '0').config.models.find((m) => m.id === 'codex.astra').resources.time.minutes.apply.high.value, 0);
  assert.equal(setResourceFromText(cfg, 'codex.astra', 'minutes', 'apply', 'high', '1,5').ok, false);
  assert.match(CLEAR_HELP, /Очистите поле, если данных нет/);
});

test('10.4 explicit unknown survives export/import and is not replaced by the default', () => {
  const d = defaults();
  const cleared = setEstimateFromText(effectiveFrom(d, null), 'codex.sol', 'verify', 'low', 'logic', '').config;
  const back = effectiveFrom(d, exportOverrides(d, cleared));
  const rec = back.models.find((m) => m.id === 'codex.sol').quality.verify.low.logic;
  assert.deepEqual([rec.value, rec.status], [null, 'unknown']);
  assert.equal(rec.origin.status, 'heuristic');
  assert.deepEqual(effectiveFrom(d, exportOverrides(d, resetEstimate(cleared, d, 'codex.sol', 'verify', 'low', 'logic'))).models.find((m) => m.id === 'codex.sol').quality.verify.low.logic, d.models.find((m) => m.id === 'codex.sol').quality.verify.low.logic, 'reset restores the default with its provenance');
});

test('10.4 required numeric settings reject empty input instead of becoming 0 or unknown', () => {
  assert.equal(parseRequiredInt('').ok, false);
  assert.equal(parseRequiredInt('  ').ok, false);
  assert.deepEqual(parseRequiredInt('0'), { ok: true, value: 0 });
  assert.equal(parseRequiredInt('0', { min: 1 }).ok, false, 'interval 0 is rejected');
  assert.equal(parseRequiredInt('-3').ok, false);
  assert.equal(parseRequiredInt('2.5').ok, false);
  assert.deepEqual(parsePercentBp('5'), { ok: true, value: 500 });
  assert.deepEqual(parsePercentBp('0'), { ok: true, value: 0 });
  assert.deepEqual(parsePercentBp('2.5'), { ok: true, value: 250 });
  assert.equal(parsePercentBp('').ok, false);
  assert.equal(parsePercentBp('5.001').ok, false);
});

test('10.4/10.7 policy settings change the preview through the same evaluator; forecast and S are shown apart', () => {
  const d = defaults();
  const profile = loadJson('examples/golden/profile.json');
  const start = effectiveFrom(d, loadJson('examples/golden/overrides.json'));
  const a = preview({ defaults: d, edited: start, profile, benchmarks: benchmarks(), asOf: AS_OF });
  assert.equal(reportBytes(a.report), golden('report.json'), 'UI preview = CLI golden report');
  const changed = setTimePenalty(start, 'api', 'graceMinutes', 0);
  const b = preview({ defaults: d, edited: changed, profile, benchmarks: benchmarks(), asOf: AS_OF });
  assert.equal(b.ok, true);
  assert.notDeepEqual(b.report.rankings['apply/api'].candidates.map((c) => c.adjusted.value), a.report.rankings['apply/api'].candidates.map((c) => c.adjusted.value));
  assert.deepEqual(b.report.rankings['apply/subscription'], a.report.rankings['apply/subscription'], 'the subscription setting is separate');
  assert.deepEqual(b.report.properties, a.report.properties);
  const top = a.report.rankings['apply/api'].candidates[0];
  const v = economicsView(top, 'api');
  assert.match(v.forecast, /^USD /);
  assert.match(v.s, /^USD /);
  assert.match(v.multiplier, /^×/);
  const bad = setTimePenalty(start, 'api', 'intervalMinutes', 0);
  assert.equal(preview({ defaults: d, edited: bad, profile, benchmarks: benchmarks() }).ok, false, 'interval 0 is a validation error');
});

test('10.7 configurator assets have no ∅ button or "no data" menu', () => {
  for (const f of ['app.mjs', 'index.html', 'styles.css']) {
    const text = readFileSync(join(PKG, 'configurator', f), 'utf8');
    assert.doesNotMatch(text, /∅|class: 'nodata'|nodata/, f);
  }
});
