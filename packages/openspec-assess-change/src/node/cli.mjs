// openspec-assess CLI. No LLM calls, no network, no clock: every time-dependent input is explicit.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { profileErrors } from '../core/validate.mjs';
import { ValidationError } from '../core/jsonschema.mjs';
import { versionIdentity, PACKAGE_VERSION } from '../core/version.mjs';
import { canonicalStringify } from '../core/canonical.mjs';
import { RANKING_KEYS } from '../core/ranking.mjs';
import { formatMicros } from '../core/render-md.mjs';
import { formatScore } from '../core/scale.mjs';
import { POLICY_ID, formatFraction } from '../core/policy.mjs';
import {
  AssessError, readJsonFile, canonicalDigest, sha256, assertContained, atomicWriteFile, canonicalBytes, samePath,
} from './fsio.mjs';
import { resolveChange, readinessProblems, planningArtifactPaths } from './openspec.mjs';
import { evidenceErrors, pinEvidence, gitToplevel } from './evidence.mjs';
import {
  loadEffectiveConfig, overridesPathFor, defaultsPathFor, PACKAGE_ROOT, LEGACY_DEFAULTS_V1_PATH, LEGACY_DEFAULTS_V2_PATH, BENCHMARKS_PATH,
} from './config.mjs';
import { migrateConfigV1, migrateConfigV2, switchPolicy } from '../core/migrate.mjs';
import { configErrors, assertValid } from '../core/validate.mjs';
import { DEFAULT_TIME_PENALTY } from '../core/schemas.mjs';
import {
  createRun, writeWorkingProfile, profilePath, readLatest, locateRun, replayRun, listRuns,
} from './store.mjs';
import { checkFreshness } from './freshness.mjs';
import { profileTemplate } from './template.mjs';

const USAGE = `openspec-assess <command> [options]

Commands
  template          Profile skeleton (stdout, or --write to create assessment/profile.json) [--stage planning|verification]
  pin-evidence      Fill evidence digests and save assessment/profile.json
  validate-profile  Validate structure, ranges, references and local digests
  assess            Evaluate, store an immutable run and update assessment/latest.json
  check-freshness   Compare the latest (or --run) assessment with current sources and config
  replay            Read-only recomputation of a stored run       [<path>] [--run <id>]
  configure         Start the local configurator on 127.0.0.1     [--port <n>]
  migrate-config    Explicit format migration v1/v2 → v3 under the legacy weighted-utility policy
                    [--from-defaults <old defaults>] [--overrides <old overrides>|--change] --out <file> [--force]
  switch-policy     Explicit switch to minimum-resource-with-time-penalty (rankings may change)
                    --config <file> --out <file> [--grace-minutes 30] [--interval-minutes 30] [--rate-bp 500]
  version           Print package version and version identity digest

Common options
  --change <name>   OpenSpec change (asked for when several are active)
  --store <id>      OpenSpec store; passed to every openspec call
  --profile <file>  Profile to use instead of assessment/profile.json (copied into the change by assess/pin-evidence)
  --overrides <f>   User overrides (default: <changeRoot>/assessment/overrides.json when present)
  --defaults <f>    Base config instead of the shipped defaults (default: <changeRoot>/assessment/config.json when present)
  --as-of <UTC>     Explicit time YYYY-MM-DDTHH:MM:SSZ for quota observations (no clock is read)
  --repo-root <d>   Repository root for repo-relative evidence (default: git top level)
  --json            Machine-readable output

Exit codes: 0 ok · 1 invalid/stale/mismatch · 2 usage · 3 change resolution · 4 incompatible version`;

const FLAGS = new Set(['json', 'help', 'write', 'force']);

export function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (FLAGS.has(key)) opts[key] = true;
      else {
        if (i + 1 >= argv.length) throw new AssessError('usage', `--${key} needs a value`);
        opts[key] = argv[++i];
      }
    } else opts._.push(a);
  }
  return opts;
}

function out_(opts, json, text) {
  out(opts, json, text);
}

function out(opts, json, text) {
  if (opts.json) process.stdout.write(`${canonicalStringify(json, { pretty: true })}`);
  else process.stdout.write(`${text}\n`);
}

function context(opts) {
  const resolved = resolveChange({ change: opts.change || null, store: opts.store || null, cwd: process.cwd() });
  const repoRoot = opts['repo-root'] ? resolve(opts['repo-root']) : (gitToplevel(resolved.changeRoot) || resolved.root);
  return { resolved, ctx: { changeRoot: resolved.changeRoot, repoRoot } };
}

function loadProfile(opts, changeRoot) {
  const p = opts.profile ? resolve(opts.profile) : profilePath(changeRoot);
  if (!existsSync(p)) throw new AssessError('usage', `no profile at ${p}; create one with "openspec-assess template" and fill it per references/rubric.md`);
  return readJsonFile(p, opts.profile ? opts.profile : 'assessment/profile.json');
}

function configFor(opts, changeRoot) {
  const overridesPath = overridesPathFor({ overridesPath: opts.overrides ? resolve(opts.overrides) : null, changeRoot });
  const base = defaultsPathFor({ defaultsPath: opts.defaults ? resolve(opts.defaults) : null, changeRoot });
  return loadEffectiveConfig({ overridesPath, defaultsPath: base.path, defaultsLabel: base.label });
}

function summarize(report, assessmentId, reused) {
  const L = [`Assessment ${assessmentId}${reused ? ' (existing identical run reused)' : ''}`];
  const p = report.properties.indices;
  const idx = (i) => (i ? `${i.lower}–${i.upper}` : 'n/a');
  L.push(`Change ${report.change.name} (${report.change.stage}): volume ${idx(p.volume)}, complexity ${idx(p.complexity)}, risk ${idx(p.risk)}, uncertainty ${idx(p.uncertainty)} bp`);
  for (const key of RANKING_KEYS) {
    const r = report.rankings[key];
    const isNew = r.policy.id === POLICY_ID;
    const isApi = key.endsWith('/api');
    L.push(`\n${key}: ${r.status}. ${r.message}`);
    L.push(`  Quality floor ${formatScore(r.qualityFloorBp) ?? 'unknown'} (0–100).`);
    if (isNew) {
      const t = r.policy.timePenalty;
      L.push(`  Policy ${r.policy.id} v${r.policy.version}: C = upper ${isApi ? 'API cost' : 'subscription load'} forecast; T = typical minutes; S = C × (1 + ${t.rateBp / 10000} × max(0, T − ${t.graceMinutes}) / ${t.intervalMinutes}). S is for comparison, not a price or quota draw.`);
    } else L.push(`  Policy ${r.policy.id} v${r.policy.version} (legacy); utility 0–100.`);
    for (const c of r.candidates.slice(0, 5)) {
      const res = isApi
        ? (c.resource.status === 'known' ? `${formatMicros(c.resource.typicalMicros, c.resource.currency)} typical` : 'cost unknown')
        : (c.resource.status === 'known' ? `load ${c.resource.typicalLoad} typical, capacity ${c.resource.capacity.status}` : 'load unknown');
      let economic;
      if (isNew) {
        const a = c.adjusted;
        const cost = a.cost === null ? 'unknown' : (isApi ? formatMicros(a.cost, c.resource.currency) : `${a.cost} load units`);
        const multiplier = a.multiplier ? `×${formatFraction(a.multiplier, 6)}` : 'unknown';
        let adjusted = `unknown (missing ${a.missing.join(', ')})`;
        if (a.complete) {
          adjusted = isApi
            ? `${c.resource.currency} ${formatFraction({ numerator: a.value.numerator, denominator: (BigInt(a.value.denominator) * 1000000n).toString() }, 6)}`
            : `${formatFraction(a.value, 6)} load units`;
        }
        economic = `C ${cost} (upper) · T ${c.time.typicalMinutes ?? 'unknown'} min (typical) · penalty ${multiplier} · S ${adjusted} (comparison)`;
      } else economic = `utility ${formatScore(c.utilityBp) ?? 'unknown'}`;
      L.push(`  ${c.rank}. ${c.candidateId} @${c.recommendedEffort} [${c.group}] fit ${formatScore(c.suitability.valueBp) ?? 'unknown'} · ${economic} · ${res}`);
    }
    if (r.candidates.length > 5) L.push(`  … ${r.candidates.length - 5} more in report.md`);
    if (r.excluded.length) L.push(`  excluded: ${r.excluded.map((e) => e.candidateId).join(', ')}`);
  }
  L.push('\nHeuristic fit scores, not probabilities. The choice of model stays with you; nothing was switched or started.');
  return L.join('\n');
}

const commands = {
  template(opts) {
    const stage = opts.stage || 'planning';
    if (!['planning', 'verification'].includes(stage)) throw new AssessError('usage', '--stage must be planning or verification');
    if (!opts.write) {
      out({ json: true }, profileTemplate({ change: opts.change || 'my-change', stage }), '');
      return 0;
    }
    const { resolved } = context(opts);
    const target = profilePath(resolved.changeRoot);
    if (existsSync(target)) throw new AssessError('exists', 'assessment/profile.json already exists; edit it instead (the template never overwrites a profile)');
    assertContained(resolved.changeRoot, target, 'assessment/profile.json');
    mkdirSync(join(resolved.changeRoot, 'assessment'), { recursive: true });
    atomicWriteFile(target, canonicalBytes(profileTemplate({ change: resolved.name, stage })));
    out(opts, { profile: 'assessment/profile.json' }, `Created assessment/profile.json for ${resolved.name} (${stage}); every value starts as unknown.`);
    return 0;
  },

  'pin-evidence'(opts) {
    const { resolved, ctx } = context(opts);
    const profile = loadProfile(opts, resolved.changeRoot);
    const r = pinEvidence(profile, ctx);
    if (r.problems.length) throw new ValidationError('profile evidence', r.problems);
    writeWorkingProfile(resolved.changeRoot, r.profile);
    out(opts, { pinned: r.pinned, profile: 'assessment/profile.json' }, `Pinned ${r.pinned.length} evidence digest(s): ${r.pinned.join(', ') || 'none'}. Saved assessment/profile.json.`);
  },

  'validate-profile'(opts) {
    let ctx = null;
    let profile;
    let resolved = null;
    if (opts['change-root'] || (opts.profile && !opts.change && !opts.store)) {
      const changeRoot = opts['change-root'] ? resolve(opts['change-root']) : null;
      profile = readJsonFile(resolve(opts.profile || join(changeRoot, 'assessment', 'profile.json')), 'profile');
      if (changeRoot) ctx = { changeRoot, repoRoot: opts['repo-root'] ? resolve(opts['repo-root']) : gitToplevel(changeRoot) };
    } else {
      ({ resolved, ctx } = context(opts));
      profile = loadProfile(opts, resolved.changeRoot);
    }
    const errors = profileErrors(profile);
    const warnings = [];
    if (!errors.length && ctx) {
      errors.push(...evidenceErrors(profile, ctx).errors);
      if (resolved && profile.change.name !== resolved.name) errors.push({ path: '/change/name', message: `profile is for "${profile.change.name}", resolved change is "${resolved.name}"` });
      if (profile.stage === 'verification' && !profile.previousAssessmentId) {
        const latest = readLatest(ctx.changeRoot);
        if (latest) warnings.push(`verification profile has no previousAssessmentId; the latest run is ${latest.assessmentId} (${latest.stage})`);
      }
    } else if (!ctx) warnings.push('local evidence was not checked (no change root); pass --change or --change-root');
    out(opts, { valid: errors.length === 0, errors, warnings }, errors.length
      ? `Profile is invalid:\n${errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`
      : `Profile is valid.${warnings.length ? `\nWarnings:\n${warnings.map((w) => `  ${w}`).join('\n')}` : ''}`);
    return errors.length ? 1 : 0;
  },

  assess(opts) {
    const { resolved, ctx } = context(opts);
    const problems = readinessProblems(resolved);
    if (problems.length) throw new AssessError('not-ready', `change ${resolved.name} is not ready for assessment: ${problems.join('; ')}`);
    const profile = loadProfile(opts, resolved.changeRoot);
    if (opts.profile) writeWorkingProfile(resolved.changeRoot, profile);
    const configInfo = configFor(opts, resolved.changeRoot);
    const r = createRun({
      resolved, ctx, profile, configInfo, asOf: opts['as-of'] || null, artifactPaths: planningArtifactPaths(resolved),
    });
    out(opts, {
      assessmentId: r.assessmentId, reused: r.reused, run: `assessment/runs/${r.assessmentId}`, report: r.report,
    }, `${summarize(r.report, r.assessmentId, r.reused)}\nSaved assessment/runs/${r.assessmentId}/ (report.md for details).`);
  },

  'check-freshness'(opts) {
    const { resolved, ctx } = context(opts);
    const configInfo = configFor(opts, resolved.changeRoot);
    const r = checkFreshness({ resolved, ctx, configInfo, artifactPaths: planningArtifactPaths(resolved), runId: opts.run || null });
    out(opts, r, r.status === 'fresh'
      ? `Assessment ${r.assessmentId} (${r.stage}) is fresh.`
      : `Assessment ${r.assessmentId} is STALE — do not use its ranking as current:\n${r.reasons.map((x) => `  [${x.kind}] ${x.message}`).join('\n')}\nHistory is kept; review the profile and run assess again.`);
    return r.status === 'fresh' ? 0 : 1;
  },

  replay(opts) {
    let base;
    if (opts._[1]) base = resolve(opts._[1]);
    else base = context(opts).resolved.changeRoot;
    const runDir = locateRun(base, { runId: opts.run || null });
    const r = replayRun(runDir);
    const { report, ...summary } = r;
    out(opts, summary, r.reproduced
      ? `Replay of ${r.assessmentId} (${r.change}, ${r.stage}) reproduced report.json and report.md byte for byte.\n${r.note}`
      : `Replay of ${r.assessmentId} does NOT match the stored outputs: ${r.mismatches.join(', ')}`);
    return r.reproduced ? 0 : 1;
  },

  async configure(opts) {
    const { startServer } = await import('./server.mjs');
    const port = opts.port ? Number(opts.port) : 0;
    const srv = await startServer({ port });
    process.stdout.write(`Configurator: ${srv.url}\nServing package files read-only on loopback; press Ctrl+C to stop.\n`);
    await new Promise((res) => {
      const stop = () => srv.close().then(res);
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
    return 0;
  },

  'migrate-config'(opts) {
    if (!opts.out) throw new AssessError('usage', 'migrate-config needs --out <file> (the result is written for review; nothing is overwritten implicitly)');
    const out = resolve(opts.out);
    let overridesPath = opts.overrides ? resolve(opts.overrides) : null;
    if (!overridesPath && (opts.change || opts.store)) {
      const { resolved } = context(opts);
      const p = join(resolved.changeRoot, 'assessment', 'overrides.json');
      if (existsSync(p)) overridesPath = p;
    }
    const overrides = overridesPath ? readJsonFile(overridesPath, 'old overrides') : null;
    let fromDefaults = opts['from-defaults'] ? resolve(opts['from-defaults']) : null;
    let defaults = fromDefaults ? readJsonFile(fromDefaults, 'old defaults') : null;
    const from = defaults ? defaults.schemaVersion : (overrides ? overrides.schemaVersion : 1);
    if (!defaults) {
      fromDefaults = from === 2 ? LEGACY_DEFAULTS_V2_PATH : LEGACY_DEFAULTS_V1_PATH;
      defaults = readJsonFile(fromDefaults, 'shipped legacy defaults');
    }
    if (![1, 2].includes(from) || (overrides && overrides.schemaVersion !== from)) {
      throw new AssessError('usage', `migrate-config reads schemaVersion 1 or 2 inputs of the same version (defaults ${defaults.schemaVersion}, overrides ${overrides ? overrides.schemaVersion : 'none'})`);
    }
    if ([fromDefaults, overridesPath].some((p) => samePath(p, out))) throw new AssessError('usage', '--out must differ from the input files; inputs are never overwritten');
    if (/[\\/]assessment[\\/]runs[\\/]/.test(out)) throw new AssessError('usage', 'historical runs are immutable; choose an --out outside assessment/runs/');
    if (existsSync(out) && !opts.force) throw new AssessError('exists', `${opts.out} exists; pass --force to replace it`);
    const label = fromDefaults === LEGACY_DEFAULTS_V1_PATH ? 'config/legacy/defaults-v1.json' : (fromDefaults === LEGACY_DEFAULTS_V2_PATH ? 'config/legacy/defaults-v2.json' : 'old defaults');
    const r = from === 1
      ? migrateConfigV1({ defaults, overrides, benchmarks: readJsonFile(BENCHMARKS_PATH, 'config/benchmarks.json'), label })
      : migrateConfigV2({ defaults, overrides, label });
    mkdirSync(dirname(out), { recursive: true });
    atomicWriteFile(out, canonicalBytes(r.config));
    const detail = from === 1
      ? `${r.stats.models} models, ${r.stats.records} quality records (${r.stats.byEffort} direct byEffort, ${r.stats.baseDelta} from base + delta, ${r.stats.composite} composite → heuristic, ${r.stats.clamped} clamped, ${r.stats.unknown} unknown)`
      : `${r.stats.models} models, records unchanged`;
    out_(opts, { out: opts.out, fromSchemaVersion: from, policy: r.config.selection.policy, stats: r.stats }, [
      `Format migration v${from} → v3: ${detail}. Selection policy kept: weighted-utility (legacy), so scores and order stay as before.`,
      `Wrote ${opts.out}. Inputs and assessment history were not changed.`,
      'Review it, then use it as the base config (--defaults <file>, or save it as <changeRoot>/assessment/config.json and remove the old assessment/overrides.json).',
      'To adopt the cheapest-sufficient policy run "openspec-assess switch-policy --config <file> --out <file>" — a separate, deliberate change of the ranking rule.',
    ].join('\n'));
  },

  'switch-policy'(opts) {
    if (!opts.config || !opts.out) throw new AssessError('usage', 'switch-policy needs --config <schema-3 working config> and --out <file>');
    const src = resolve(opts.config);
    const out = resolve(opts.out);
    if (samePath(src, out)) throw new AssessError('usage', '--out must differ from --config; inputs are never overwritten');
    if (/[\\/]assessment[\\/]runs[\\/]/.test(out)) throw new AssessError('usage', 'historical runs are immutable; choose an --out outside assessment/runs/');
    if (existsSync(out) && !opts.force) throw new AssessError('exists', `${opts.out} exists; pass --force to replace it`);
    const config = readJsonFile(src, 'config');
    assertValid('config', configErrors(config));
    const penalty = {
      graceMinutes: opts['grace-minutes'] !== undefined ? Number(opts['grace-minutes']) : DEFAULT_TIME_PENALTY.graceMinutes,
      intervalMinutes: opts['interval-minutes'] !== undefined ? Number(opts['interval-minutes']) : DEFAULT_TIME_PENALTY.intervalMinutes,
      rateBp: opts['rate-bp'] !== undefined ? Number(opts['rate-bp']) : DEFAULT_TIME_PENALTY.rateBp,
    };
    const r = switchPolicy(config, { timePenalty: penalty });
    mkdirSync(dirname(out), { recursive: true });
    atomicWriteFile(out, canonicalBytes(r.config));
    out_(opts, { out: opts.out, changed: r.changed, previous: r.previous, timePenalty: penalty }, r.changed
      ? `Switched selection policy weighted-utility → minimum-resource-with-time-penalty (g = ${penalty.graceMinutes} min, s = ${penalty.intervalMinutes} min, k = ${penalty.rateBp / 100} %). Estimates, resources, constraints and availability are unchanged; the old weights/anchors no longer apply. Rankings may change by design. Wrote ${opts.out}; existing runs were not touched.`
      : `${opts.config} already uses minimum-resource-with-time-penalty; wrote an unchanged copy to ${opts.out}.`);
  },

  version(opts) {
    const v = versionIdentity();
    const skill = join(PACKAGE_ROOT, 'SKILL.md');
    const info = {
      package: PACKAGE_VERSION,
      versionDigest: canonicalDigest(v),
      version: v,
      skillDigest: existsSync(skill) ? sha256(readFileSync(skill)) : null,
    };
    out(opts, info, `openspec-assess-change ${info.package}\nversion identity ${info.versionDigest}\nSKILL.md ${info.skillDigest}\nroot ${PACKAGE_ROOT}`);
  },

  runs(opts) {
    const { resolved } = context(opts);
    const ids = listRuns(join(resolved.changeRoot, 'assessment'));
    out(opts, { runs: ids, latest: readLatest(resolved.changeRoot) }, ids.join('\n') || 'no runs');
  },
};

const EXIT = {
  usage: 2, 'no-root': 3, 'no-change': 3, 'ambiguous-change': 3, 'change-not-found': 3, 'store-unresolved': 3, 'openspec-missing': 3, 'not-ready': 3, incompatible: 4,
};

export async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${e.message}\n${USAGE}\n`);
    return 2;
  }
  const cmd = opts._[0];
  if (!cmd || opts.help || !commands[cmd]) {
    process.stdout.write(`${USAGE}\n`);
    return cmd && !commands[cmd] ? 2 : 0;
  }
  try {
    const code = await commands[cmd](opts);
    return typeof code === 'number' ? code : 0;
  } catch (e) {
    if (e instanceof ValidationError) {
      const errors = e.errors || [];
      if (opts.json) process.stdout.write(canonicalStringify({ error: 'validation', label: e.label || null, errors }, { pretty: true }));
      else process.stderr.write(`${e.message.split('\n')[0]}\n${errors.map((x) => `  ${x.path}: ${x.message}`).join('\n')}\nNothing was written as the latest assessment.\n`);
      return 1;
    }
    if (e instanceof AssessError) {
      if (opts.json) process.stdout.write(canonicalStringify({ error: e.code, message: e.message, details: e.details || {} }, { pretty: true }));
      else process.stderr.write(`${e.message}\n`);
      return EXIT[e.code] || 1;
    }
    process.stderr.write(`${e.stack || e.message}\n`);
    return 1;
  }
}
