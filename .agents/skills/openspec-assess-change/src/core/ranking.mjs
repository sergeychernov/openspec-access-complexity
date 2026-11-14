// Candidate expansion, constraints, phase suitability, utility and stable ordering.
import { FACTOR_IDS } from './factors.mjs';
import { clamp, mulDiv, sumBig, floorDiv, normalize, BP_MAX } from './intmath.mjs';
import { compareCodeUnits } from './canonical.mjs';
import { apiForecast, subscriptionForecast, timeForecast } from './resources.mjs';
import { adjustedCost, compareFraction, POLICY_ID } from './policy.mjs';

export const PHASES = ['apply', 'verify'];
export const MODES = ['api', 'subscription'];
export const RANKING_KEYS = ['apply/api', 'verify/api', 'apply/subscription', 'verify/subscription'];
const GROUP_ORDER = { eligible: 0, provisional: 1, 'below-threshold': 2 };

export function candidateId(model) {
  return `${model.harness}/${model.modelId}`;
}

// The exact quality record for (phase, effort, factor). There is no base + delta fallback, no
// interpolation and no borrowing from another effort: a missing record is a configuration error.
export function effectiveCoefficient(model, phase, effort, factor) {
  const row = model.quality[phase][effort];
  if (!row || !row[factor]) throw new RangeError(`no quality record for ${model.harness}/${model.modelId} ${phase}/${effort}/${factor}`);
  const r = row[factor];
  return {
    value: r.value,
    status: r.status,
    basis: r.basis,
    sources: r.sources || [],
    support: r.support || [],
    inheritedFrom: r.inheritedFrom || null,
    origin: r.origin ? { value: r.origin.value, status: r.origin.status, basis: r.origin.basis, sources: r.origin.sources || [] } : null,
    migrated: r.migratedFrom ? r.migratedFrom.rule : null,
    record: { phase, effort, factor },
  };
}

export function phaseRelevance(change, phaseCfg) {
  const rows = [];
  for (const f of FACTOR_IDS) {
    const lv = change.factors[f];
    if (lv.state === 'not-applicable') continue;
    const w = phaseCfg.relevanceWeights[f];
    const relevance = w * Math.max(1, lv.rankingLevel);
    rows.push({ factor: f, weight: w, level: lv.rankingLevel, levelState: lv.state, relevance });
  }
  return rows;
}

export function qualityFloor(phaseCfg, demandBp) {
  let floor = phaseCfg.qualityFloors[0].floorBp;
  for (const q of phaseCfg.qualityFloors) if (q.fromDemandBp <= demandBp) floor = q.floorBp;
  return floor;
}

function suitability(model, phase, effort, relevance) {
  const active = relevance.filter((r) => r.relevance > 0);
  const den = sumBig(active.map((r) => r.relevance));
  const contributions = [];
  let knownRel = 0n;
  let complete = true;
  const coefficients = {};
  for (const r of active) {
    const c = effectiveCoefficient(model, phase, effort, r.factor);
    coefficients[r.factor] = c.value;
    if (c.value === null) complete = false;
    else knownRel += BigInt(r.relevance);
    contributions.push({
      factor: r.factor,
      level: r.level,
      levelState: r.levelState,
      weight: r.weight,
      relevance: r.relevance,
      record: c.record,
      coefficientBp: c.value,
      coefficientStatus: c.status,
      basis: c.basis,
      sources: c.sources,
      support: c.support,
      inheritedFrom: c.inheritedFrom,
      origin: c.origin,
      migrated: c.migrated,
      contributionBp: c.value === null ? null : floorDiv(BigInt(r.relevance) * BigInt(c.value), den),
    });
  }
  const coverageBp = floorDiv(knownRel * BigInt(BP_MAX), den);
  const value = complete
    ? floorDiv(sumBig(active.map((r) => r.relevance * coefficients[r.factor])), den)
    : null;
  return { value, complete, coverageBp, contributions, coefficients };
}

function modelLevelChecks(model, constraints) {
  const excluded = [];
  const provisional = [];
  if (!model.enabled) excluded.push('disabled in configuration');
  if (model.availability === 'unavailable') excluded.push('marked unavailable for this account');
  if (model.availability === 'unknown') provisional.push('account availability is unknown');
  if (constraints.minContextTokens !== null) {
    if (model.contextWindowTokens === null) provisional.push(`context window unknown (required ${constraints.minContextTokens} tokens)`);
    else if (model.contextWindowTokens < constraints.minContextTokens) excluded.push(`context window ${model.contextWindowTokens} < required ${constraints.minContextTokens} tokens`);
  }
  if (constraints.requiredCapabilities.length) {
    if (model.capabilities === null) provisional.push(`capabilities unknown (required: ${constraints.requiredCapabilities.join(', ')})`);
    else {
      const missing = constraints.requiredCapabilities.filter((c) => !model.capabilities.includes(c));
      if (missing.length) excluded.push(`missing required capabilities: ${missing.join(', ')}`);
    }
  }
  return { excluded, provisional };
}

// One comparator for the efforts of a model and for the models themselves.
// Policy minimum-resource-with-time-penalty, eligible with known S: S ↑, C ↑, F ↓, IDs.
// Legacy weighted-utility, eligible with known utility: utility ↓, F ↓, resource high ↑, IDs.
// Eligible without economics come after (F ↓, IDs); provisional/below-threshold: known F first, F ↓, IDs.
function compareVariants(a, b) {
  const ga = GROUP_ORDER[a.group];
  const gb = GROUP_ORDER[b.group];
  if (ga !== gb) return ga - gb;
  const desc = (x, y) => (x === y ? 0 : (x > y ? -1 : 1));
  const asc = (x, y) => (x === y ? 0 : (x < y ? -1 : 1));
  const knownFirst = (x, y) => (x === null) - (y === null);
  let r = 0;
  if (a.group === 'eligible') {
    r = (b.economicComplete ? 1 : 0) - (a.economicComplete ? 1 : 0);
    if (r) return r;
    if (a.economicComplete && a.adjusted) {
      r = compareFraction(a.adjusted.value, b.adjusted.value) || asc(a.resourceHigh, b.resourceHigh) || desc(a.suitability.value, b.suitability.value);
      if (r) return r;
    } else if (a.economicComplete) {
      r = desc(a.utilityBp, b.utilityBp) || desc(a.suitability.value, b.suitability.value) || asc(a.resourceHigh, b.resourceHigh);
      if (r) return r;
    } else {
      r = desc(a.suitability.value, b.suitability.value);
      if (r) return r;
    }
  } else {
    r = knownFirst(a.suitability.value, b.suitability.value);
    if (r) return r;
    if (a.suitability.value !== null) {
      r = desc(a.suitability.value, b.suitability.value);
      if (r) return r;
    }
  }
  return compareCodeUnits(a.candidateId, b.candidateId) || compareCodeUnits(a.effort, b.effort);
}

export function rankPhaseMode({ change, config, phase, mode, asOf, pricingById, poolById }) {
  const phaseCfg = config.phases[phase];
  const relevance = phaseRelevance(change, phaseCfg);
  const relSum = relevance.reduce((s, r) => s + r.relevance, 0);
  const floorBp = qualityFloor(phaseCfg, change.demandBp);
  const selection = config.selection[mode];
  const policy = config.selection.policy;
  const isNew = policy === POLICY_ID;
  const base = {
    phase, mode, qualityFloorBp: floorBp, demandBp: change.demandBp, relevance,
    policy: { id: policy, version: config.selection.policyVersion, timePenalty: isNew ? selection.timePenalty : null },
    selectionWeights: isNew ? null : selection.weights,
  };
  if (relSum === 0) {
    return {
      ranking: { ...base, status: 'undefined', message: 'Rating is not defined by this configuration: all applicable relevance weights are zero.', recommended: null, candidates: [], excluded: [], pools: [] },
      trace: [],
    };
  }

  const trace = [];
  const perCandidate = [];
  const excludedOut = [];
  const models = [...config.models].sort((a, b) => compareCodeUnits(candidateId(a), candidateId(b)));
  for (const model of models) {
    const cid = candidateId(model);
    const checks = modelLevelChecks(model, config.constraints);
    if (checks.excluded.length) {
      excludedOut.push({ candidateId: cid, catalogId: model.id, displayName: model.displayName, reasons: checks.excluded });
      trace.push({ candidateId: cid, effort: null, group: 'excluded', reasons: checks.excluded });
      continue;
    }
    const efforts = model.efforts || model.supportedEfforts;
    const variants = [];
    for (const effort of efforts) {
      const suit = suitability(model, phase, effort, relevance);
      const reasons = [...checks.provisional];
      const excl = [];
      let below = false;
      const critical = [];
      for (const rule of phaseCfg.criticalFactors) {
        const lv = change.factors[rule.factor];
        if (lv.state === 'not-applicable' || lv.upper < rule.whenLevelAtLeast) continue;
        const c = effectiveCoefficient(model, phase, effort, rule.factor).value;
        let status = 'pass';
        if (c === null) { status = 'unknown'; reasons.push(`critical factor ${rule.factor}: coefficient unknown (requires ${rule.minCoefficientBp})`); }
        else if (c < rule.minCoefficientBp) { status = 'fail'; below = true; reasons.push(`critical factor ${rule.factor}: coefficient ${c} < required ${rule.minCoefficientBp}`); }
        critical.push({ factor: rule.factor, levelUpper: lv.upper, whenLevelAtLeast: rule.whenLevelAtLeast, minCoefficientBp: rule.minCoefficientBp, coefficientBp: c, status });
      }
      if (!suit.complete) reasons.push(`suitability incomplete: coverage ${suit.coverageBp} bp of relevance`);
      if (suit.value !== null && suit.value < floorBp) { below = true; reasons.push(`suitability ${suit.value} < quality floor ${floorBp}`); }

      let resource;
      let resourceHigh = null;
      let economyKnown = false;
      if (mode === 'api') {
        resource = apiForecast({ model, pricingById, workloads: config.workloads, phase, effort, workload: change.workload, currency: selection.currency });
        resourceHigh = resource.highMicros;
        economyKnown = resource.highMicros !== null;
        const max = config.constraints.api.maxCostMicros;
        if (max !== null) {
          if (resource.lowMicros !== null && resource.lowMicros > max) excl.push(`API budget: low estimate ${resource.lowMicros} > max ${max} micros`);
          else if (resource.highMicros === null) reasons.push('API budget set but cost is unknown');
          else if (resource.highMicros > max) reasons.push(`API budget: high estimate ${resource.highMicros} may exceed max ${max} micros`);
        }
      } else {
        resource = subscriptionForecast({ model, poolById, workloads: config.workloads, phase, effort, workload: change.workload, asOf });
        resourceHigh = resource.highLoad;
        economyKnown = resource.highLoad !== null;
        if (resource.capacity.status === 'insufficient') excl.push(`known quota shortfall in pool ${resource.poolId}: need ≥ ${resource.capacity.needLow} ${resource.capacity.unit}, remaining ${resource.capacity.remaining}`);
        if (resource.capacity.status === 'at-risk') reasons.push(`quota pool ${resource.poolId} may be insufficient for the high scenario`);
      }
      const time = timeForecast({ model, workloads: config.workloads, phase, effort, workload: change.workload });

      let group;
      if (excl.length) group = 'excluded';
      else if (below) group = 'below-threshold';
      else if (reasons.length) group = 'provisional';
      else group = 'eligible';

      // Economic comparison. New policy: exact adjusted cost S (no anchors, no saturation). Legacy:
      // weighted utility with fixed anchors. Both are independent of the candidate set.
      let utilityBp = null;
      let economicComplete = false;
      let adjusted = null;
      const missingEconomic = [];
      if (isNew) {
        adjusted = adjustedCost({ cost: resourceHigh, typicalMinutes: time.typicalMinutes, penalty: selection.timePenalty, costUnit: mode === 'api' ? 'micros' : 'load-units' });
        economicComplete = adjusted.complete;
        missingEconomic.push(...adjusted.missing);
      } else if (suit.value !== null) {
        const w = selection.weights;
        const parts = [[w.quality, suit.value]];
        if (w.economy > 0) {
          if (economyKnown) parts.push([w.economy, BP_MAX - normalize(resourceHigh, mode === 'api' ? selection.anchors.costMicros : selection.anchors.load)]);
          else missingEconomic.push(mode === 'api' ? 'API cost' : 'subscription load');
        }
        if (w.time > 0) {
          if (time.status === 'known') parts.push([w.time, BP_MAX - normalize(time.highMinutes, selection.anchors.timeMinutes)]);
          else missingEconomic.push('time');
        }
        economicComplete = missingEconomic.length === 0;
        if (economicComplete) {
          const den = sumBig(parts.map(([wt]) => wt));
          utilityBp = den === 0n ? null : floorDiv(sumBig(parts.map(([wt, v]) => wt * v)), den);
          if (utilityBp === null) economicComplete = false;
        }
      }
      const variant = {
        candidateId: cid, effort, group, suitability: suit, critical, reasons, exclusions: excl, resource, time,
        resourceHigh, utilityBp, adjusted, economicComplete, missingEconomic,
      };
      variants.push(variant);
      trace.push({
        candidateId: cid,
        effort,
        group,
        suitabilityBp: suit.value,
        coverageBp: suit.coverageBp,
        coefficients: suit.coefficients,
        qualityFloorBp: floorBp,
        critical,
        resourceHigh,
        timeTypicalMinutes: time.typicalMinutes,
        timeHighMinutes: time.highMinutes,
        utilityBp,
        adjusted,
        economicComplete,
        missingEconomic,
        reasons: [...excl, ...reasons],
      });
    }
    const usable = variants.filter((v) => v.group !== 'excluded');
    if (!usable.length) {
      const reasons = [...new Set(variants.flatMap((v) => v.exclusions))];
      excludedOut.push({ candidateId: cid, catalogId: model.id, displayName: model.displayName, reasons });
      continue;
    }
    usable.sort(compareVariants);
    perCandidate.push({ model, best: usable[0], others: variants.filter((v) => v !== usable[0]) });
  }

  perCandidate.sort((a, b) => compareVariants(a.best, b.best));
  const effortIndex = (m, e) => (m.efforts || m.supportedEfforts).indexOf(e);
  const candidates = perCandidate.map(({ model, best, others }, i) => ({
    rank: i + 1,
    candidateId: best.candidateId,
    catalogId: model.id,
    displayName: model.displayName,
    family: model.family,
    modelId: model.modelId,
    harness: model.harness,
    clientModelId: model.clientModelId,
    identityStatus: model.identity.status,
    group: best.group,
    recommendedEffort: best.effort,
    suitability: {
      valueBp: best.suitability.value,
      complete: best.suitability.complete,
      coverageBp: best.suitability.coverageBp,
      kind: 'heuristic-fit-score',
      contributions: best.suitability.contributions,
    },
    critical: best.critical,
    resource: best.resource,
    time: best.time,
    utilityBp: best.utilityBp,
    adjusted: best.adjusted,
    economicComplete: best.economicComplete,
    missingEconomic: best.missingEconomic,
    reasons: best.reasons,
    otherEfforts: others
      .sort((a, b) => effortIndex(model, a.effort) - effortIndex(model, b.effort))
      .map((v) => ({
        effort: v.effort,
        group: v.group,
        suitabilityBp: v.suitability.value,
        utilityBp: v.utilityBp,
        adjustedValue: v.adjusted ? v.adjusted.value : null,
        resourceHigh: v.resourceHigh,
        reasons: [...v.exclusions, ...v.reasons],
      })),
  }));
  excludedOut.sort((a, b) => compareCodeUnits(a.candidateId, b.candidateId));

  let pools = [];
  if (mode === 'subscription') {
    const byPool = new Map();
    for (const c of candidates) {
      const pid = c.resource.poolId;
      if (pid === null) continue;
      if (!byPool.has(pid)) byPool.set(pid, []);
      byPool.get(pid).push(c.candidateId);
    }
    pools = [...byPool.keys()].sort(compareCodeUnits).map((pid) => {
      const pool = poolById.get(pid);
      const first = candidates.find((c) => c.resource.poolId === pid);
      return {
        poolId: pid,
        label: pool.label,
        harness: pool.harness,
        candidates: byPool.get(pid),
        shared: byPool.get(pid).length > 1,
        status: first.resource.pool.status,
        reason: first.resource.pool.reason,
        note: byPool.get(pid).length > 1 ? 'One shared quota: switching between these models does not create a new independent limit.' : 'Single candidate in this pool.',
      };
    });
  }

  const eligible = candidates.filter((c) => c.group === 'eligible');
  const provisional = candidates.filter((c) => c.group === 'provisional');
  // New policy: a recommendation needs an eligible variant with a known S. Legacy keeps its old rule.
  const recommendable = isNew ? eligible.filter((c) => c.economicComplete) : eligible;
  let status;
  let message;
  if (recommendable.length) {
    status = 'ok';
    message = isNew
      ? 'Cheapest sufficient variant first: among candidates that pass the quality floor and critical factors, the smallest adjusted cost S (upper cost or load × time penalty on the typical time) wins; extra quality only breaks ties. Suitability is a heuristic fit score, not a probability of success.'
      : 'Ordered for manual choice. Suitability is a heuristic fit score, not a probability of success.';
  } else if (eligible.length) {
    status = 'economics-undefined';
    message = 'Candidates pass the quality requirements, but cost/load or the typical time needed for S is unknown for all of them; the economic choice is not defined by the available data and nothing is recommended as economically optimal.';
  } else if (provisional.length) {
    // Nothing failed, but nothing is confirmed either (e.g. account availability unknown): no recommendation.
    status = 'provisional-only';
    message = 'No candidate is confirmed: every remaining candidate needs clarification (see reasons, e.g. unknown account availability or coefficients). None is recommended until the open values are set.';
  } else {
    status = 'no-suitable';
    message = 'No available candidate passes the constraints and the quality floor; none is recommended.';
  }
  return {
    ranking: {
      ...base,
      status,
      message,
      recommended: recommendable.length ? { candidateId: recommendable[0].candidateId, effort: recommendable[0].recommendedEffort } : null,
      candidates,
      excluded: excludedOut,
      pools,
    },
    trace,
  };
}
