// Markdown renderer (renderer version 3). Pure, locale-independent formatting.
// v3: selection policy section; original forecasts and the adjusted cost S are shown separately.
// Quality estimates, suitability, utility and quality floors are shown on the 0–100 scale (stored bp);
// resources keep their own units; provenance is shown as a letter plus the full status ID.
import { RANKING_KEYS } from './ranking.mjs';
import { FACTOR_IDS, RUBRIC } from './factors.mjs';
import { formatScore, PROVENANCE_LETTERS } from './scale.mjs';
import { formatFraction } from './policy.mjs';

const dash = '—';
const bp = (v) => (v === null || v === undefined ? dash : String(v));
const sc = (v) => (v === null || v === undefined ? dash : formatScore(v));
const prov = (status) => `${PROVENANCE_LETTERS[status].letter} ${status}`;
const pad = (n, w) => String(n).padStart(w, '0');

export function formatMicros(micros, currency) {
  if (micros === null || micros === undefined) return `${currency} unknown`;
  const whole = Math.floor(micros / 1000000);
  const frac = micros % 1000000;
  return `${currency} ${whole}.${pad(Math.floor(frac / 100), 4)}`;
}

function cell(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function idx(i) {
  return i ? `${i.lower}–${i.upper} (ranking ${i.ranking})` : 'not defined';
}

const TITLES = {
  'apply/api': 'Apply · API',
  'verify/api': 'Verify · API',
  'apply/subscription': 'Apply · Subscription',
  'verify/subscription': 'Verify · Subscription',
};

function resourceText(c, mode, currency) {
  if (mode === 'api') {
    const r = c.resource;
    const u = r.usageRecord;
    const usage = `usage ×${u.value === null ? '?' : (u.value / 10000).toFixed(2)} (${PROVENANCE_LETTERS[u.status].letter})`;
    if (r.status !== 'known') return `unknown${r.notes.length ? ` (${r.notes[0]})` : ''}; ${usage}`;
    return `${formatMicros(r.lowMicros, currency)} / ${formatMicros(r.typicalMicros, currency)} / ${formatMicros(r.highMicros, currency)}; ${usage}`;
  }
  const r = c.resource;
  const load = r.status === 'known' ? `${r.lowLoad} / ${r.typicalLoad} / ${r.highLoad} load units` : 'unknown';
  return `${load}; ×${r.loadRecord.value === null ? '?' : (r.loadRecord.value / 10000).toFixed(2)} (${PROVENANCE_LETTERS[r.loadRecord.status].letter}); capacity ${r.capacity.status}`;
}

function policyText(r, mode) {
  if (r.policy.id === 'minimum-resource-with-time-penalty') {
    const t = r.policy.timePenalty;
    return `Policy minimum-resource-with-time-penalty v${r.policy.version}: candidates must pass the quality floor and critical factors; among them the smallest S = C × (1 + ${t.rateBp / 10000} × max(0, T − ${t.graceMinutes}) / ${t.intervalMinutes}) is preferred, where C is the upper ${mode === 'api' ? 'API cost' : 'subscription load'} forecast and T the typical time in minutes. Extra quality only breaks ties (S ↑, C ↑, suitability ↓, IDs). S is a comparison criterion, not a price or quota draw; budget and quota checks use the original forecasts.`;
  }
  const w = r.selectionWeights;
  return `Policy weighted-utility v${r.policy.version} (legacy): quality ${w.quality}, economy ${w.economy}, time ${w.time}.`;
}

function adjustedText(a, currency) {
  if (!a) return dash;
  if (!a.complete) return `unknown (missing ${a.missing.join(', ')})`;
  const mult = formatFraction(a.multiplier, 6);
  if (a.costUnit === 'micros') {
    const usd = formatFraction({ numerator: a.value.numerator, denominator: (BigInt(a.value.denominator) * 1000000n).toString() }, 6);
    return `${currency} ${usd} (C × ${mult}; exact ${a.value.numerator}/${a.value.denominator} micros)`;
  }
  return `${formatFraction(a.value, 6)} load units (C × ${mult}; exact ${a.value.numerator}/${a.value.denominator})`;
}

export function renderMarkdown(report) {
  const L = [];
  const p = report.properties;
  L.push(`# Assessment: ${report.change.name} (${report.change.stage})`);
  L.push('');
  L.push(`Evaluator ${report.version.evaluator}, renderer ${report.version.renderer}, package ${report.version.package}. As-of: ${report.asOf ?? 'not set'}.`);
  if (report.change.previousAssessmentId) L.push(`Previous assessment: \`${report.change.previousAssessmentId}\`.`);
  L.push(`Scope: ${report.change.scope.mode === 'all-tasks' ? 'all tasks' : report.change.scope.taskIds.join(', ')}.`);
  L.push('');
  for (const d of report.disclaimers) L.push(`> ${d}`);
  L.push('');
  L.push('## Change properties (model-independent)');
  L.push('');
  L.push('| Index | Basis points 0–10000 |');
  L.push('| --- | --- |');
  for (const g of ['volume', 'complexity', 'risk', 'uncertainty']) L.push(`| ${g} | ${idx(p.indices[g])} |`);
  L.push('');
  L.push(`Workload category: low ${p.workload.low}, typical ${p.workload.typical}, high ${p.workload.high}. Quality demand: ${p.demandBp} bp.`);
  L.push('');
  L.push('| Factor | State | Kind | Level (lower–upper) | Ranking level |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const f of FACTOR_IDS) {
    const v = p.factors[f];
    const range = v.lower === null ? dash : `${v.lower}–${v.upper}`;
    L.push(`| ${RUBRIC[f].title} (\`${f}\`) | ${v.state} | ${v.kind ?? dash} | ${range} | ${v.rankingLevel ?? dash} |`);
  }
  L.push('');
  const md = report.missingData;
  L.push(`Missing data: unknown factors ${md.unknownFactors.length ? md.unknownFactors.join(', ') : 'none'}; unknown quantities ${md.unknownQuantities.length ? md.unknownQuantities.join(', ') : 'none'}; unknown share ${md.unknownShareBp} bp. ${md.unknownPolicy}.`);
  L.push('');

  for (const key of RANKING_KEYS) {
    const r = report.rankings[key];
    const [, mode] = key.split('/');
    L.push(`## ${TITLES[key]}`);
    L.push('');
    L.push(`Status: **${r.status}**. ${r.message}`);
    L.push(`Quality floor: ${sc(r.qualityFloorBp)} on the 0–100 model score scale (demand ${r.demandBp} bp).`);
    L.push(policyText(r, mode));
    if (r.recommended) L.push(`Top of list for manual choice: \`${r.recommended.candidateId}\` at effort \`${r.recommended.effort}\`.`);
    L.push('');
    if (r.candidates.length) {
      const resHeader = mode === 'api' ? 'API cost low / typical / high' : 'Relative load low / typical / high';
      const isNew = r.policy.id === 'minimum-resource-with-time-penalty';
      const econHeader = isNew ? 'Typical / high time, min | S for comparison (not a price)' : 'Utility 0–100';
      L.push(`| # | Candidate | Group | Effort | Suitability 0–100 (heuristic) | Coverage | ${resHeader} | ${econHeader} | Notes |`);
      L.push(`| --- | --- | --- | --- | --- | --- | --- | --- |${isNew ? ' --- |' : ''} --- |`);
      for (const c of r.candidates) {
        const cur = c.resource.currency || '';
        L.push(`| ${c.rank} | ${cell(c.displayName)} \`${cell(c.candidateId)}\` | ${c.group} | ${c.recommendedEffort} | ${sc(c.suitability.valueBp)} | ${sc(c.suitability.coverageBp)}% | ${cell(resourceText(c, mode, cur))} | ${isNew ? `${c.time.typicalMinutes ?? '?'} / ${c.time.highMinutes ?? '?'} | ${cell(adjustedText(c.adjusted, cur))}` : sc(c.utilityBp)} | ${cell([...c.reasons, ...(c.economicComplete ? [] : c.missingEconomic.map((m) => `missing ${m}`))].join('; ') || dash)} |`);
      }
      L.push('');
    }
    if (r.excluded.length) {
      L.push('Excluded:');
      for (const e of r.excluded) L.push(`- \`${e.candidateId}\`: ${e.reasons.join('; ')}`);
      L.push('');
    }
    if (r.pools.length) {
      L.push('Quota pools:');
      for (const pool of r.pools) L.push(`- \`${pool.poolId}\` (${pool.label}): ${pool.candidates.join(', ')} — ${pool.status}; ${pool.note}`);
      L.push('');
    }
    const top = r.candidates[0];
    if (top) {
      L.push(`<details><summary>Factor contributions for ${top.candidateId} @ ${top.recommendedEffort}</summary>`);
      L.push('');
      L.push('| Factor | Level | Relevance | Estimate record | Score 0–100 | Provenance | Contribution |');
      L.push('| --- | --- | --- | --- | --- | --- | --- |');
      for (const k of top.suitability.contributions) {
        const extra = [
          k.inheritedFrom ? `inherited from ${k.inheritedFrom.harness}/${k.inheritedFrom.modelId} (${k.inheritedFrom.status})` : null,
          k.sources.length ? `sources [${k.sources.join(', ')}]` : null,
          k.support.length ? `support [${k.support.join(', ')}]` : null,
          k.origin ? `replaces ${sc(k.origin.value)} ${k.origin.status}` : null,
          k.migrated ? `migrated from v1 (${k.migrated})` : null,
        ].filter(Boolean).join('; ');
        L.push(`| ${k.factor} | ${k.level}${k.levelState === 'unknown' ? ' (unknown)' : ''} | ${k.relevance} | ${k.record.phase}/${k.record.effort}/${k.record.factor} | ${sc(k.coefficientBp)} | ${cell(prov(k.coefficientStatus) + (extra ? ` — ${extra}` : ''))} | ${sc(k.contributionBp)} |`);
      }
      L.push('');
      L.push('Provenance letters: m measured · p proxy · h heuristic · o user-override · u unknown.');
      L.push('');
      L.push('</details>');
      L.push('');
    }
  }
  if (report.benchmarks.length) {
    L.push('## Benchmark sources');
    L.push('');
    for (const b of report.benchmarks) L.push(`- \`${b.id}\`: ${b.benchmark}, ${b.metric}, ${b.model} — ${b.publisher} (${b.sourceKind}) ${b.url}`);
    L.push('');
  } else {
    L.push('## Benchmark sources');
    L.push('');
    L.push('No benchmark record is referenced by the effective configuration; all coefficients are proxy, heuristic, unknown or user overrides.');
    L.push('');
  }
  return L.join('\n');
}
