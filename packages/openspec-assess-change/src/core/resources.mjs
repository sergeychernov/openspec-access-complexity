// Resource forecasts: API cost (micros of the configured currency), subscription relative load,
// optional time. These are scenario forecasts (low/typical/high), not measurements.
import { mulDiv } from './intmath.mjs';

export const SCENARIOS = ['low', 'typical', 'high'];
const TOKEN_CATEGORIES = [
  ['uncachedInputTokens', 'uncachedInput'],
  ['cacheReadTokens', 'cacheRead'],
  ['cacheWriteTokens', 'cacheWrite'],
  ['outputTokens', 'output'],
];

function scaleUsage(u, multBp) {
  const tools = {};
  for (const [k, v] of Object.entries(u.toolCalls || {})) tools[k] = mulDiv(v, multBp, 10000);
  return {
    uncachedInputTokens: mulDiv(u.uncachedInputTokens, multBp, 10000),
    cacheReadTokens: mulDiv(u.cacheReadTokens, multBp, 10000),
    cacheWriteTokens: mulDiv(u.cacheWriteTokens, multBp, 10000),
    outputTokens: mulDiv(u.outputTokens, multBp, 10000),
    reasoningTokens: mulDiv(u.reasoningTokens, multBp, 10000),
    peakContextTokens: u.peakContextTokens,
    toolCalls: tools,
  };
}

// Cost of one usage vector. Billable categories are disjoint: uncached input, cache read,
// cache write, visible output, reasoning (billed either as output or at its own rate — never both),
// tool calls. Rounding: floor per category in micros.
export function priceUsage(usage, pricing) {
  const long = pricing.longContext && usage.peakContextTokens > pricing.longContext.thresholdTokens;
  const rates = long ? pricing.longContext.rates : pricing.rates;
  const lines = [];
  const missing = [];
  for (const [tokKey, rateKey] of TOKEN_CATEGORIES) {
    const tokens = usage[tokKey];
    if (tokens === 0) { lines.push({ category: rateKey, tokens, micros: 0 }); continue; }
    const rate = rates[rateKey];
    if (rate === null) { missing.push(`rate.${rateKey}`); lines.push({ category: rateKey, tokens, micros: null }); continue; }
    lines.push({ category: rateKey, tokens, micros: mulDiv(tokens, rate, 1000000) });
  }
  {
    const tokens = usage.reasoningTokens;
    const rateKey = pricing.reasoningBilling === 'as-output' ? 'output' : 'reasoning';
    const rate = rates[rateKey];
    if (tokens === 0) lines.push({ category: 'reasoning', billedAs: rateKey, tokens, micros: 0 });
    else if (rate === null) { missing.push(`rate.${rateKey} (reasoning)`); lines.push({ category: 'reasoning', billedAs: rateKey, tokens, micros: null }); }
    else lines.push({ category: 'reasoning', billedAs: rateKey, tokens, micros: mulDiv(tokens, rate, 1000000) });
  }
  for (const tool of Object.keys(usage.toolCalls || {}).sort()) {
    const calls = usage.toolCalls[tool];
    if (calls === 0) { lines.push({ category: `tool:${tool}`, calls, micros: 0 }); continue; }
    const charge = pricing.toolCharges[tool];
    if (charge === undefined || charge === null) { missing.push(`toolCharges.${tool}`); lines.push({ category: `tool:${tool}`, calls, micros: null }); continue; }
    lines.push({ category: `tool:${tool}`, calls, micros: calls * charge });
  }
  const total = missing.length ? null : lines.reduce((s, l) => s + l.micros, 0);
  return { longContext: Boolean(long), lines, missing, totalMicros: total };
}

function recordView(rec, unit) {
  if (!rec) return { value: null, unit, status: 'unknown', basis: 'no record' };
  return { value: rec.value, unit, status: rec.status, basis: rec.basis };
}

export function apiForecast({ model, pricingById, workloads, phase, effort, workload, currency }) {
  const notes = [];
  const table = model.resources.api.usage;
  const rec = table[phase][effort];
  const mult = rec ? rec.value : null;
  if (mult === null) notes.push(`API usage for ${phase}/${effort} is unknown`);
  const pricingId = model.resources.api.pricingId;
  const pricing = pricingId === null ? null : pricingById.get(pricingId);
  if (!pricing) notes.push('pricing is unknown');
  else if (pricing.status === 'unknown') notes.push(`pricing "${pricing.id}" is marked unknown`);
  else if (pricing.currency !== currency) notes.push(`pricing currency ${pricing.currency} differs from ${currency}; no conversion is applied`);
  const usable = notes.length === 0;
  const scenarios = {};
  for (const s of SCENARIOS) {
    if (!usable) { scenarios[s] = null; continue; }
    const usage = scaleUsage(workloads.api[phase][workload[s]][s], mult);
    const priced = priceUsage(usage, pricing);
    scenarios[s] = { category: workload[s], usage, ...priced };
    if (priced.missing.length) notes.push(`${s}: missing ${priced.missing.join(', ')}`);
  }
  const totals = {};
  for (const s of SCENARIOS) totals[s] = scenarios[s] ? scenarios[s].totalMicros : null;
  return {
    kind: 'scenario-forecast',
    currency,
    pricingId: pricing ? pricing.id : null,
    pricingStatus: pricing ? pricing.status : 'unknown',
    usageRecord: recordView(rec, table.unit),
    lowMicros: totals.low,
    typicalMicros: totals.typical,
    highMicros: totals.high,
    status: totals.high === null ? 'unknown' : 'known',
    notes,
    scenarios,
  };
}

// Parses "YYYY-MM-DDTHH:MM:SSZ" into seconds since epoch without locale or host timezone.
export function parseUtcSeconds(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(s);
  if (!m) throw new RangeError(`invalid UTC timestamp ${s}`);
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  return Math.floor(Date.UTC(y, mo - 1, d, h, mi, se) / 1000);
}

export function poolStatus(pool, asOf) {
  if (!pool) return { status: 'no-pool', usable: false, reason: 'no quota pool configured' };
  const obs = pool.observation;
  if (!obs) return { status: 'unknown', usable: false, reason: 'no quota observation; remaining capacity is unknown' };
  if (asOf === null) return { status: 'unknown', usable: false, reason: 'observation present but no explicit as-of time was given; it is not used' };
  const now = parseUtcSeconds(asOf);
  const observed = parseUtcSeconds(obs.observedAt);
  if (now < observed) return { status: 'unknown', usable: false, reason: 'as-of time precedes the observation' };
  if (now - observed > obs.maxAgeHours * 3600) return { status: 'expired', usable: false, reason: `observation older than ${obs.maxAgeHours}h at as-of` };
  if (obs.resetAt !== null && now >= parseUtcSeconds(obs.resetAt)) return { status: 'expired', usable: false, reason: 'quota reset happened after the observation' };
  return { status: 'fresh', usable: true, reason: 'observation is fresh at as-of', remaining: obs.remaining, unit: obs.unit };
}

export function subscriptionForecast({ model, poolById, workloads, phase, effort, workload, asOf }) {
  const notes = [];
  const table = model.resources.subscription.load;
  const rec = table[phase][effort];
  const mult = rec ? rec.value : null;
  const poolId = model.resources.subscription.poolId;
  const pool = poolId === null ? null : poolById.get(poolId);
  const loads = { low: null, typical: null, high: null };
  if (mult === null) notes.push(`relative load for ${phase}/${effort} is unknown`);
  else {
    for (const s of SCENARIOS) loads[s] = mulDiv(workloads.subscription[phase][workload[s]][s], mult, 10000);
  }
  const ps = poolStatus(pool, asOf);
  let capacity = { status: 'unknown', reason: ps.reason };
  if (ps.usable && loads.high !== null) {
    if (!pool.conversion) {
      capacity = { status: 'unknown', reason: 'no confirmed conversion from relative load to quota units; percentages are not invented' };
    } else {
      const need = {};
      for (const s of SCENARIOS) need[s] = mulDiv(loads[s], pool.conversion.quotaUnitsPer1000Load, 1000);
      let status = 'fits';
      if (need.low > ps.remaining) status = 'insufficient';
      else if (need.high > ps.remaining) status = 'at-risk';
      capacity = { status, remaining: ps.remaining, unit: ps.unit, needLow: need.low, needTypical: need.typical, needHigh: need.high, reason: `conversion: ${pool.conversion.source}` };
    }
  }
  return {
    kind: 'relative-load-forecast',
    poolId: pool ? pool.id : null,
    loadRecord: recordView(rec, table.unit),
    lowLoad: loads.low,
    typicalLoad: loads.typical,
    highLoad: loads.high,
    status: loads.high === null ? 'unknown' : 'known',
    pool: { status: ps.status, reason: ps.reason },
    capacity,
    notes,
  };
}

export function timeForecast({ model, workloads, phase, effort, workload }) {
  const table = model.resources.time.minutes;
  const rec = table[phase][effort];
  const mult = rec ? rec.value : null;
  const timeRecord = recordView(rec, table.unit);
  if (mult === null) return { status: 'unknown', timeRecord, lowMinutes: null, typicalMinutes: null, highMinutes: null };
  const v = {};
  for (const s of SCENARIOS) v[s] = mulDiv(workloads.timeMinutes[phase][workload[s]][s], mult, 10000);
  return { status: 'known', timeRecord, lowMinutes: v.low, typicalMinutes: v.typical, highMinutes: v.high };
}
