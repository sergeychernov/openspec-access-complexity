// Change properties computed only from the profile and complexityRules (never from models,
// prices, availability or quotas).
import { FACTOR_IDS, JUDGMENT_FACTORS, VOLUME_QUANTITIES, QUANTITY_IDS, LEVEL_MAX, levelOf } from './factors.mjs';
import { mulDiv, sumBig, floorDiv, BP_MAX } from './intmath.mjs';

const KIND_ORDER = ['measured', 'declared', 'estimated'];
const weakestKind = (kinds) => kinds.reduce((a, k) => (KIND_ORDER.indexOf(k) > KIND_ORDER.indexOf(a) ? k : a), 'measured');

function deriveVolume(profile, rules) {
  const parts = [];
  let any = false;
  let allKnown = true;
  const kinds = [];
  let lower = 0;
  let upper = 0;
  for (const q of VOLUME_QUANTITIES) {
    const v = profile.quantities[q];
    if (v.state === 'not-applicable') continue;
    any = true;
    const thr = rules.volumeThresholds[q];
    if (v.state === 'known') {
      const lo = levelOf(v.min, thr);
      const hi = levelOf(v.max, thr);
      parts.push({ quantity: q, state: 'known', kind: v.kind, min: v.min, max: v.max, lowerLevel: lo, upperLevel: hi });
      kinds.push(v.kind);
      lower = Math.max(lower, lo);
      upper = Math.max(upper, hi);
    } else {
      allKnown = false;
      parts.push({ quantity: q, state: 'unknown', lowerLevel: 0, upperLevel: LEVEL_MAX });
      upper = LEVEL_MAX;
    }
  }
  if (!any) {
    return { state: 'not-applicable', kind: null, lower: null, upper: null, rankingLevel: null, derivedFrom: parts };
  }
  const state = allKnown ? 'known' : 'unknown';
  const rankingLevel = allKnown ? upper : Math.max(lower, rules.unknownRankingLevel);
  return { state, kind: kinds.length ? weakestKind(kinds) : null, lower, upper, rankingLevel, derivedFrom: parts };
}

export function factorLevels(profile, rules) {
  const out = { volume: deriveVolume(profile, rules) };
  for (const f of JUDGMENT_FACTORS) {
    const v = profile.factors[f];
    if (v.state === 'known') {
      out[f] = { state: 'known', kind: v.kind, lower: v.level, upper: v.level, rankingLevel: v.level };
    } else if (v.state === 'unknown') {
      out[f] = { state: 'unknown', kind: null, lower: 0, upper: LEVEL_MAX, rankingLevel: rules.unknownRankingLevel };
    } else {
      out[f] = { state: 'not-applicable', kind: null, lower: null, upper: null, rankingLevel: null };
    }
  }
  return out;
}

function groupIndex(levels, weights) {
  const active = FACTOR_IDS.filter((f) => (weights[f] || 0) > 0 && levels[f].state !== 'not-applicable');
  const den = sumBig(active.map((f) => weights[f]));
  if (den === 0n) return null;
  const idx = (key) => floorDiv(sumBig(active.map((f) => weights[f] * levels[f][key])) * BigInt(BP_MAX), den * BigInt(LEVEL_MAX));
  return {
    lower: idx('lower'),
    ranking: idx('rankingLevel'),
    upper: idx('upper'),
    factors: active,
  };
}

function categoryFor(bp, categories) {
  for (const c of categories) if (bp <= c.upToBp) return c.id;
  return categories[categories.length - 1].id;
}

export function computeChange(profile, rules) {
  const levels = factorLevels(profile, rules);
  const indices = {};
  for (const g of ['volume', 'complexity', 'risk', 'uncertainty']) indices[g] = groupIndex(levels, rules.groups[g]);

  const considered = FACTOR_IDS.filter((f) => levels[f].state !== 'not-applicable');
  const unknownFactors = considered.filter((f) => levels[f].state === 'unknown');
  const notApplicableFactors = FACTOR_IDS.filter((f) => levels[f].state === 'not-applicable');
  const unknownShareBp = considered.length ? mulDiv(BP_MAX, unknownFactors.length, considered.length) : BP_MAX;

  const sizeBp = (key) => {
    const vals = [indices.volume, indices.complexity].filter(Boolean).map((i) => i[key]);
    return vals.length ? Math.max(...vals) : BP_MAX;
  };
  const workload = {
    low: categoryFor(sizeBp('lower'), rules.workloadCategories),
    typical: categoryFor(sizeBp('ranking'), rules.workloadCategories),
    high: categoryFor(sizeBp('upper'), rules.workloadCategories),
  };
  const demandParts = [indices.complexity, indices.risk].filter(Boolean).map((i) => i.upper);
  const demandBp = demandParts.length ? Math.max(...demandParts) : BP_MAX;

  const quantities = {};
  for (const q of QUANTITY_IDS) {
    const v = profile.quantities[q];
    quantities[q] = v.state === 'known'
      ? { state: 'known', kind: v.kind, min: v.min, max: v.max }
      : { state: v.state };
  }

  return {
    stage: profile.stage,
    factors: levels,
    indices,
    unknownFactors,
    notApplicableFactors,
    unknownShareBp,
    quantities,
    workload,
    demandBp,
  };
}
