// 9.8 Explicit v1 → v2 migration. The old numbers come from the genuine 0.1.0 package
// (test/fixtures/v1/openspec-assess-change-0.1.0.tgz), never from a re-implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  migrateConfigV1, migrateConfigV2, switchPolicy, evaluate, RANKING_KEYS, configErrors,
} from '../src/core/index.mjs';
import { PKG, benchmarks, loadJson, criticalProfile, mechanicalProfile } from './helpers.mjs';
import {
  tmp, cli, demoProject, CHANGE, AS_OF, treeDigest, readJson,
} from './project.mjs';

const FIX = join(PKG, 'test', 'fixtures', 'v1');
const RUN_V1 = '66b046efd6ee7f2ebae0870a6d62114c1690f1a68b84f6c6ee884d496ed278cc';
const v1Defaults = () => loadJson('config/legacy/defaults-v1.json');
const v1Overrides = () => readJson(join(FIX, 'archived-change', 'assessment', 'overrides.json'));

let oldPkg = null;
function oldPackage() {
  if (oldPkg) return oldPkg;
  const dir = tmp('osa-v1pkg-');
  const r = spawnSync('tar', ['-xzf', join(FIX, 'openspec-assess-change-0.1.0.tgz'), '-C', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  oldPkg = join(dir, 'package');
  return oldPkg;
}
const oldCore = () => import(pathToFileURL(join(oldPackage(), 'src', 'core', 'index.mjs')).href);

// Comparable numbers of a report: per ranking the ordered candidates with effort, group, scores,
// resources, time and every other effort; plus exclusions and change properties.
function numbers(report) {
  const out = { properties: report.properties };
  for (const k of RANKING_KEYS) {
    const r = report.rankings[k];
    out[k] = {
      status: r.status,
      floor: r.qualityFloorBp,
      excluded: r.excluded,
      candidates: r.candidates.map((c) => ({
        id: c.candidateId, effort: c.recommendedEffort, group: c.group, fit: c.suitability.valueBp, coverage: c.suitability.coverageBp,
        contributions: c.suitability.contributions.map((x) => [x.factor, x.coefficientBp, x.contributionBp]),
        utility: c.utilityBp,
        resource: [c.resource.lowMicros ?? c.resource.lowLoad, c.resource.typicalMicros ?? c.resource.typicalLoad, c.resource.highMicros ?? c.resource.highLoad],
        time: [c.time.lowMinutes, c.time.typicalMinutes, c.time.highMinutes],
        others: c.otherEfforts.map((o) => [o.effort, o.group, o.suitabilityBp, o.utilityBp, o.resourceHigh]),
      })),
    };
  }
  return out;
}

test('9.8 migrating the genuine v1 config keeps every number, effort and order of the v1 report', () => {
  const old = readJson(join(FIX, 'archived-change', 'assessment', 'runs', RUN_V1, 'report.json'));
  const { config } = migrateConfigV1({ defaults: v1Defaults(), overrides: v1Overrides(), benchmarks: benchmarks() });
  const profile = readJson(join(FIX, 'archived-change', 'assessment', 'runs', RUN_V1, 'profile.json'));
  const now = evaluate({ profile, config, benchmarks: benchmarks(), asOf: old.asOf });
  assert.deepEqual(numbers(now), numbers(old));
  assert.equal(now.version.evaluator, 3, 'the new run is a new evaluator identity, not the old bytes');
  assert.equal(config.selection.policy, 'weighted-utility', 'the format migration keeps the legacy selection policy');
});

function syntheticV1() {
  const ov = {
    kind: 'openspec-assess.overrides',
    schemaVersion: 1,
    set: {
      models: [
        { id: 'codex.sol', availability: 'available', coefficients: { apply: { byEffort: { high: { logic: { value: 6100, status: 'user-override', basis: 'direct high record' } } } } } },
        { id: 'codex.astra', availability: 'available', coefficients: { apply: { base: { architecture: { value: 9800 } }, effortDelta: { max: { deltaBp: 600, status: 'heuristic', basis: 'max' } } } } },
        { id: 'claude-code.opus', availability: 'available', coefficients: { verify: { base: { testability: { value: null } } } } },
        { id: 'claude-code.sonnet', availability: 'available', api: { usageMultiplierBp: { apply: { high: 9000 } } } },
        { id: 'codex.terra', availability: 'available', coefficients: { apply: { effortDelta: { low: { deltaBp: -9000, status: 'user-override', basis: 'never use low' } } } } },
        { id: 'codex.luna', availability: 'available' },
        { id: 'claude-code.haiku', availability: 'available' },
      ],
    },
  };
  return ov;
}

test('9.8 byEffort beats base + delta, clamping and unknown follow the v1 rules (checked against 0.1.0)', async () => {
  const old = await oldCore();
  const ov = syntheticV1();
  const v1Effective = old.mergeConfig(v1Defaults(), ov);
  const { config, stats } = migrateConfigV1({ defaults: v1Defaults(), overrides: ov, benchmarks: benchmarks() });
  assert.deepEqual(configErrors(config), []);
  assert.ok(stats.byEffort >= 1 && stats.clamped >= 2 && stats.unknown >= 1, JSON.stringify(stats));
  const q = (id) => config.models.find((m) => m.id === id).quality;
  assert.deepEqual([q('codex.sol').apply.high.logic.value, q('codex.sol').apply.high.logic.status, q('codex.sol').apply.high.logic.migratedFrom.rule], [6100, 'user-override', 'byEffort']);
  assert.equal(q('codex.astra').apply.max.architecture.value, 10000, '9800 + 600 is clamped to 10000');
  assert.equal(q('codex.astra').apply.max.architecture.migratedFrom.clamped, true);
  assert.equal(q('codex.terra').apply.low.volume.value, 0, 'negative sums clamp to 0');
  assert.equal(q('claude-code.opus').verify.medium.testability.status, 'unknown', 'an unknown base stays unknown for every effort');
  assert.equal(q('claude-code.opus').verify.max.testability.value, null);
  const sonnetUsage = config.models.find((m) => m.id === 'claude-code.sonnet').resources.api.usage.apply.high;
  assert.deepEqual([sonnetUsage.value, sonnetUsage.status], [9000, 'user-override']);
  for (const profile of [criticalProfile(), mechanicalProfile()]) {
    for (const asOf of [null, AS_OF]) {
      const before = old.evaluate({ profile, config: v1Effective, benchmarks: benchmarks(), asOf });
      const after = evaluate({ profile, config, benchmarks: benchmarks(), asOf });
      assert.deepEqual(numbers(after), numbers(before), `${profile.change.name} ${asOf}`);
    }
  }
});

test('9.8 migrated provenance: composites become heuristic, zero delta keeps the base status, nothing is upgraded', () => {
  const { config } = migrateConfigV1({ defaults: v1Defaults(), overrides: syntheticV1(), benchmarks: benchmarks() });
  const sol = config.models.find((m) => m.id === 'codex.sol');
  const med = sol.quality.apply.medium.logic;
  assert.equal(med.status, 'proxy', 'v1 base proxy + 0 delta keeps its applicable provenance');
  assert.deepEqual(med.sources, ['aa-cai-2.1.codex.sol.max']);
  const high = sol.quality.apply.high.architecture;
  assert.equal(high.status, 'heuristic', 'base + a heuristic delta is a heuristic composite');
  assert.deepEqual(high.support, ['aa-cai-2.1.codex.sol.max'], 'the old source becomes supporting evidence of the composite');
  assert.equal(high.migratedFrom.base.status, 'proxy');
  assert.equal(high.migratedFrom.effortDelta.deltaBp, 300);
  for (const m of config.models) {
    for (const phase of ['apply', 'verify']) {
      for (const e of m.supportedEfforts) for (const r of Object.values(m.quality[phase][e])) assert.notEqual(r.status, 'measured');
    }
  }
});

test('9.8 migrate-config CLI writes a separate result and never changes inputs or history', () => {
  const p = demoProject();
  const assessment = join(p.changeRoot, 'assessment');
  rmSync(assessment, { recursive: true, force: true });
  cpSync(join(FIX, 'archived-change', 'assessment'), assessment, { recursive: true });
  const before = treeDigest(assessment);
  const out = join(p.dir, 'migrated.json');
  const r = cli(p.dir, ['migrate-config', '--change', CHANGE, '--out', out, '--json']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(existsSync(out));
  assert.equal(readJson(out).schemaVersion, 3);
  assert.equal(readJson(out).selection.policy, 'weighted-utility');
  assert.deepEqual(treeDigest(assessment), before, 'v1 overrides, runs, manifests and latest untouched');
  assert.equal(cli(p.dir, ['migrate-config', '--change', CHANGE, '--out', out]).code, 1, 'existing output is not overwritten without --force');
  assert.equal(cli(p.dir, ['migrate-config', '--change', CHANGE, '--out', join(assessment, 'runs', RUN_V1, 'x.json')]).code, 2, 'never writes into history');
  assert.equal(cli(p.dir, ['migrate-config', '--change', CHANGE, '--out', join(assessment, 'overrides.json'), '--force']).code, 2, 'never overwrites an input');
});

test('9.8 history is not migrated: new evaluator refuses v1 replay, 0.1.0 replays it, new assess adds a separate run', () => {
  const p = demoProject();
  const assessment = join(p.changeRoot, 'assessment');
  rmSync(assessment, { recursive: true, force: true });
  cpSync(join(FIX, 'archived-change', 'assessment'), assessment, { recursive: true });
  const oldRun = join(assessment, 'runs', RUN_V1);
  const runBefore = treeDigest(oldRun);
  const latestBefore = readFileSync(join(assessment, 'latest.json'));

  const r = cli(p.dir, ['replay', assessment, '--json']);
  assert.equal(r.code, 4);
  assert.match(r.json.message, /Install openspec-assess-change 0\.1\.0/);
  const oldReplay = spawnSync(process.execPath, [join(oldPackage(), 'bin', 'openspec-assess.mjs'), 'replay', assessment, '--json'], { cwd: p.dir, encoding: 'utf8' });
  assert.equal(oldReplay.status, 0, oldReplay.stderr);
  assert.equal(JSON.parse(oldReplay.stdout).reproduced, true, 'the compatible release reproduces the v1 run');

  const fresh = cli(p.dir, ['check-freshness', '--change', CHANGE, '--json']);
  assert.equal(fresh.code, 1, fresh.stdout + fresh.stderr);
  assert.ok(fresh.json.error === 'validation' || fresh.json.reasons.some((x) => x.kind === 'version'), 'v1 inputs are reported, not silently reinterpreted');

  const a1 = cli(p.dir, ['assess', '--change', CHANGE, '--as-of', AS_OF, '--json']);
  assert.equal(a1.code, 1, 'a v1 overrides file is refused until migrated');
  assert.ok(a1.json.errors.some((e) => /migrate-config/.test(e.message)));

  assert.equal(cli(p.dir, ['migrate-config', '--change', CHANGE, '--out', join(assessment, 'config.json')]).code, 0);
  rmSync(join(assessment, 'overrides.json'));
  cli(p.dir, ['pin-evidence', '--change', CHANGE]);
  const a2 = cli(p.dir, ['assess', '--change', CHANGE, '--as-of', AS_OF, '--json']);
  assert.equal(a2.code, 0, a2.stdout + a2.stderr);
  assert.notEqual(a2.json.assessmentId, RUN_V1);
  assert.deepEqual(treeDigest(oldRun), runBefore, 'the v1 run, its manifest and report are byte-identical');
  const latest = readJson(join(assessment, 'latest.json'));
  assert.deepEqual(latest.history.map((h) => h.assessmentId), [RUN_V1, a2.json.assessmentId]);
  assert.notDeepEqual(readFileSync(join(assessment, 'latest.json')), latestBefore);
  const oldReport = readJson(join(oldRun, 'report.json'));
  const newReport = a2.json.report;
  for (const k of RANKING_KEYS) {
    assert.deepEqual(newReport.rankings[k].candidates.map((c) => [c.candidateId, c.recommendedEffort, c.suitability.valueBp, c.utilityBp]),
      oldReport.rankings[k].candidates.map((c) => [c.candidateId, c.recommendedEffort, c.suitability.valueBp, c.utilityBp]), `${k}: same numbers after migration`);
  }
});

// ------------------------------------------------------------------ 10.5 v2 format migration and the policy switch
const FIX2 = join(PKG, 'test', 'fixtures', 'v2');
const RUN_V2 = 'f1ec548a94fe49a0f6f7ff610f7475e425c7cb8a65e197443ad189b38c85b885';
const v2Defaults = () => loadJson('config/legacy/defaults-v2.json');
const v2Overrides = () => readJson(join(FIX2, 'archived-change', 'assessment', 'overrides.json'));
let oldPkg2 = null;
function package020() {
  if (oldPkg2) return oldPkg2;
  const dir = tmp('osa-v2pkg-');
  const r = spawnSync('tar', ['-xzf', join(FIX2, 'openspec-assess-change-0.2.0.tgz'), '-C', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  oldPkg2 = join(dir, 'package');
  return oldPkg2;
}

test('10.5 format migration v2 → v3 keeps the legacy policy and every number of the genuine 0.2.0 run', () => {
  const old = readJson(join(FIX2, 'archived-change', 'assessment', 'runs', RUN_V2, 'report.json'));
  const { config } = migrateConfigV2({ defaults: v2Defaults(), overrides: v2Overrides() });
  assert.equal(config.selection.policy, 'weighted-utility');
  const profile = readJson(join(FIX2, 'archived-change', 'assessment', 'runs', RUN_V2, 'profile.json'));
  const now = evaluate({ profile, config, benchmarks: benchmarks(), asOf: old.asOf });
  assert.deepEqual(numbers(now), numbers(old));
});

test('10.5 switch-policy keeps estimates, resources, constraints and availability; only the ranking rule changes', () => {
  const { config: legacy } = migrateConfigV2({ defaults: v2Defaults(), overrides: v2Overrides() });
  const { config: switched, changed, previous } = switchPolicy(legacy);
  assert.equal(changed, true);
  assert.equal(switched.selection.policy, 'minimum-resource-with-time-penalty');
  assert.deepEqual(switched.selection.api.timePenalty, { graceMinutes: 30, intervalMinutes: 30, rateBp: 500 });
  for (const mode of ['api', 'subscription']) {
    assert.equal(switched.selection[mode].weights, undefined, 'old weights are not left silently active');
    assert.equal(switched.selection[mode].anchors, undefined);
  }
  assert.deepEqual(previous.api.weights, legacy.selection.api.weights, 'the previous settings are reported, not converted');
  const strip = (c) => { const x = JSON.parse(JSON.stringify(c)); delete x.selection; delete x.provenance; return x; };
  assert.deepEqual(strip(switched), strip(legacy));
  assert.equal(switchPolicy(switched).changed, false, 'switching twice is a no-op');
  const profile = readJson(join(FIX2, 'archived-change', 'assessment', 'runs', RUN_V2, 'profile.json'));
  const a = evaluate({ profile, config: legacy, benchmarks: benchmarks(), asOf: AS_OF });
  const b = evaluate({ profile, config: switched, benchmarks: benchmarks(), asOf: AS_OF });
  assert.deepEqual(b.properties, a.properties);
  for (const k of RANKING_KEYS) {
    assert.deepEqual(b.rankings[k].candidates.map((c) => c.candidateId).sort(), a.rankings[k].candidates.map((c) => c.candidateId).sort(), 'same candidates');
    for (const c of b.rankings[k].candidates) {
      const o = a.rankings[k].candidates.find((x) => x.candidateId === c.candidateId);
      const all = (x) => [[x.recommendedEffort, x.suitability.valueBp], ...x.otherEfforts.map((y) => [y.effort, y.suitabilityBp])].sort();
      assert.deepEqual(all(c), all(o), `${k} ${c.candidateId}: quality per effort unchanged`);
    }
  }
  assert.notDeepEqual(b.rankings['apply/api'].candidates.map((c) => c.candidateId), a.rankings['apply/api'].candidates.map((c) => c.candidateId), 'the order may change by design');
});

test('10.5 history across the policy change: v2 runs are not recomputed; a new run is separate', () => {
  const p = demoProject();
  const assessment = join(p.changeRoot, 'assessment');
  rmSync(assessment, { recursive: true, force: true });
  cpSync(join(FIX2, 'archived-change', 'assessment'), assessment, { recursive: true });
  const oldRun = join(assessment, 'runs', RUN_V2);
  const runBefore = treeDigest(oldRun);
  const r = cli(p.dir, ['replay', assessment, '--json']);
  assert.equal(r.code, 4);
  assert.match(r.json.message, /Install openspec-assess-change 0\.2\.0/);
  const old = spawnSync(process.execPath, [join(package020(), 'bin', 'openspec-assess.mjs'), 'replay', assessment, '--json'], { cwd: p.dir, encoding: 'utf8' });
  assert.equal(old.status, 0, old.stderr);
  assert.equal(JSON.parse(old.stdout).reproduced, true, '0.2.0 reproduces its own run');
  const a1 = cli(p.dir, ['assess', '--change', CHANGE, '--json']);
  assert.equal(a1.code, 1, 'v2 overrides are refused until migrated');
  const legacy = join(p.dir, 'legacy.json');
  assert.equal(cli(p.dir, ['migrate-config', '--change', CHANGE, '--out', legacy]).code, 0);
  assert.equal(readJson(legacy).selection.policy, 'weighted-utility');
  assert.equal(cli(p.dir, ['switch-policy', '--config', legacy, '--out', join(assessment, 'config.json')]).code, 0);
  assert.equal(readJson(legacy).selection.policy, 'weighted-utility', 'the input of switch-policy is not modified');
  assert.equal(cli(p.dir, ['switch-policy', '--config', legacy, '--out', legacy]).code, 2, 'never overwrites its input');
  rmSync(join(assessment, 'overrides.json'));
  cli(p.dir, ['pin-evidence', '--change', CHANGE]);
  const a2 = cli(p.dir, ['assess', '--change', CHANGE, '--as-of', AS_OF, '--json']);
  assert.equal(a2.code, 0, a2.stdout + a2.stderr);
  assert.equal(a2.json.report.rankings['apply/api'].policy.id, 'minimum-resource-with-time-penalty');
  assert.notEqual(a2.json.assessmentId, RUN_V2);
  assert.deepEqual(treeDigest(oldRun), runBefore, 'the v2 run, manifest and report are byte-identical');
  assert.deepEqual(readJson(join(assessment, 'latest.json')).history.map((h) => h.assessmentId), [RUN_V2, a2.json.assessmentId]);
});
