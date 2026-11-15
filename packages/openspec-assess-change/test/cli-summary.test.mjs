import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { formatScore, formatMicros, formatFraction, RANKING_KEYS, migrateConfigV2 } from '../src/core/index.mjs';
import { defaults, loadJson } from './helpers.mjs';
import { demoProject, cli, CHANGE, AS_OF, readJson, writeJson } from './project.mjs';

function oneModel(config = defaults()) {
  for (const m of config.models) {
    m.enabled = m.id === 'codex.sol';
    if (!m.enabled) continue;
    m.availability = 'available';
    m.efforts = ['medium'];
    for (const phase of ['apply', 'verify']) {
      m.resources.time.minutes[phase].medium = { value: 10000, status: 'heuristic', basis: 'one minute per category minute' };
      for (const category of Object.keys(config.workloads.timeMinutes[phase])) config.workloads.timeMinutes[phase][category] = { low: 60, typical: 60, high: 60 };
    }
  }
  return config;
}

function assessSummary(t, config) {
  const p = demoProject();
  t.after(() => rmSync(p.dir, { recursive: true, force: true }));
  const file = join(p.dir, 'summary-defaults.json');
  writeJson(file, config);
  const pin = cli(p.dir, ['pin-evidence', '--change', CHANGE]);
  assert.equal(pin.code, 0, pin.stdout + pin.stderr);
  const run = cli(p.dir, ['assess', '--change', CHANGE, '--defaults', file, '--as-of', AS_OF]);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  const latest = readJson(join(p.changeRoot, 'assessment', 'latest.json'));
  return { stdout: run.stdout, report: readJson(join(p.changeRoot, 'assessment', 'runs', latest.assessmentId, 'report.json')) };
}

test('12.4 assess stdout shows scaled fit, floor, upper C, typical T and S for both resource modes', (t) => {
  const { stdout, report } = assessSummary(t, oneModel());
  assert.doesNotMatch(stdout, /\butility\b/);
  assert.match(stdout, /S is for comparison, not a price or quota draw/);
  assert.match(stdout, /max\(0, T − 30\) \/ 30/);
  for (const key of RANKING_KEYS) {
    const r = report.rankings[key];
    assert.equal(r.candidates.length, 1, key);
    const c = r.candidates[0];
    assert.ok(stdout.includes(`Quality floor ${formatScore(r.qualityFloorBp)} (0–100).`), key);
    assert.ok(stdout.includes(`fit ${formatScore(c.suitability.valueBp)} · C `), key);
    assert.equal(c.time.typicalMinutes, 60, key);
    assert.ok(stdout.includes('T 60 min (typical) · penalty ×1.05 · S '), key);
    assert.ok(c.adjusted.cost > 0, key);
    assert.equal(BigInt(c.adjusted.value.numerator) * 100n, BigInt(c.adjusted.cost) * 105n * BigInt(c.adjusted.value.denominator), key);
    const cost = key.endsWith('/api') ? formatMicros(c.resource.highMicros, c.resource.currency) : `${c.resource.highLoad} load units`;
    assert.ok(stdout.includes(`C ${cost} (upper)`), key);
    const adjusted = key.endsWith('/api')
      ? `${c.resource.currency} ${formatFraction({ numerator: c.adjusted.value.numerator, denominator: (BigInt(c.adjusted.value.denominator) * 1000000n).toString() }, 6)}`
      : `${formatFraction(c.adjusted.value, 6)} load units`;
    assert.ok(stdout.includes(`S ${adjusted} (comparison)`), key);
  }
});

test('12.4 assess stdout keeps known C and explains missing time instead of assuming no penalty', (t) => {
  const config = oneModel();
  const model = config.models.find((m) => m.enabled);
  for (const phase of ['apply', 'verify']) model.resources.time.minutes[phase].medium = { value: null, status: 'unknown', basis: 'time not measured' };
  const { stdout, report } = assessSummary(t, config);
  for (const key of RANKING_KEYS) {
    const c = report.rankings[key].candidates[0];
    assert.equal(c.adjusted.complete, false, key);
    assert.ok(c.adjusted.cost > 0, key);
  }
  assert.ok(stdout.includes('T unknown min (typical) · penalty unknown · S unknown (missing typical time (needed for the time penalty))'));
  assert.doesNotMatch(stdout, /\butility\b/);
});

test('12.4 assess stdout identifies missing API cost and subscription load without replacing them with zero', (t) => {
  const config = oneModel();
  const model = config.models.find((m) => m.enabled);
  for (const phase of ['apply', 'verify']) {
    model.resources.api.usage[phase].medium = { value: null, status: 'unknown', basis: 'API usage not measured' };
    model.resources.subscription.load[phase].medium = { value: null, status: 'unknown', basis: 'subscription load not measured' };
  }
  const { stdout, report } = assessSummary(t, config);
  for (const key of RANKING_KEYS) assert.equal(report.rankings[key].candidates[0].adjusted.cost, null, key);
  assert.match(stdout, /C unknown \(upper\) · T 60 min \(typical\) · penalty ×1\.05/);
  assert.ok(stdout.includes('S unknown (missing API cost (high forecast))'));
  assert.ok(stdout.includes('S unknown (missing subscription load (high forecast))'));
});

test('12.4 assess stdout retains scaled utility only for the explicit legacy policy', (t) => {
  const { config } = migrateConfigV2({ defaults: loadJson('config/legacy/defaults-v2.json') });
  const { stdout, report } = assessSummary(t, oneModel(config));
  assert.match(stdout, /Policy weighted-utility v1 \(legacy\); utility 0–100/);
  assert.doesNotMatch(stdout, / · S |S is for comparison/);
  for (const key of RANKING_KEYS) {
    const c = report.rankings[key].candidates[0];
    assert.ok(stdout.includes(`fit ${formatScore(c.suitability.valueBp)} · utility ${formatScore(c.utilityBp)}`), key);
  }
});
