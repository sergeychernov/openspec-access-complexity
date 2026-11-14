// Configurator model: pure functions shared by the browser UI and the Node tests. It never writes
// files; the UI only offers the result for download (export). View state (which effort a column
// shows, which model's "all levels" table is open) is never part of the configuration.
import {
  mergeConfig, diffToOverrides, evaluate, canonicalStringify, clone, FACTOR_IDS, RANKING_KEYS, ValidationError,
  formatScore, parseScore, PROVENANCE_LETTERS, formatFraction,
} from '../src/core/index.mjs';

export const PHASES = ['apply', 'verify'];
export const RESOURCE_KINDS = {
  usage: { path: ['api', 'usage'], label: 'API: множитель токенов', unit: '× нагрузки категории (токены)' },
  load: { path: ['subscription', 'load'], label: 'Подписка: множитель нагрузки', unit: '× относительной нагрузки' },
  minutes: { path: ['time', 'minutes'], label: 'Время: множитель', unit: '× минут категории' },
};

export const WEIGHT_LABEL = { apply: 'Важность параметра для реализации', verify: 'Важность параметра для проверки' };
export const WEIGHT_HELP = 'Относительный вес параметра при сравнении моделей. При одинаковой сложности вес 2 даёт вдвое больший вклад, чем вес 1. Ноль исключает параметр из взвешенной оценки, но не отменяет обязательные ограничения.';
export const WEIGHT_RELEVANCE_HELP = 'Вклад параметра = важность × max(1, уровень сложности из профиля 0–4). Важность задаёте вы; уровень сложности берётся из профиля change; оценка модели (0–100) — отдельное третье число.';
export const SCORE_HELP = 'Пригодность выбранной модели для этой фазы, параметра и effort по шкале 0–100. Это эвристическая оценка соответствия, а не вероятность успеха. Хранится как целое 0–10000 bp. Очистите поле, если данных нет: запись станет «Нет данных» (u), прежнее значение сохранится в подробностях.';
export const CLEAR_HELP = 'Очистите поле, если данных нет: запись станет «Нет данных» (u), прежнее значение и основание сохранятся в подробностях. 0 — это число, а не отсутствие данных.';
export const POLICY_HELP = 'Сначала отсекаются варианты ниже порога качества и с нарушенными критическими параметрами. Среди оставшихся выбирается наименьший S = C × (1 + k × max(0, T − g) / s): C — верхний прогноз стоимости API или нагрузки подписки, T — типичное время в минутах. Избыточное качество учитывается только при равенстве S и C. S — критерий сравнения, а не цена: бюджет и квота проверяются по исходному прогнозу. При g = 30, s = 30, k = 5 %: 45 мин → ×1.025, 60 мин → ×1.05, 90 мин → ×1.10; k = 0 отключает учёт времени.';
export const PENALTY_FIELDS = [
  { key: 'graceMinutes', label: 'Время без штрафа g, мин', help: 'Типичное время до этой границы (включительно) не увеличивает S и не участвует в сравнении.', kind: 'int', min: 0 },
  { key: 'intervalMinutes', label: 'Интервал начисления s, мин', help: 'Длина интервала, за который начисляется надбавка k; больше 0. Надбавка линейная и непрерывная.', kind: 'int', min: 1 },
  { key: 'rateBp', label: 'Надбавка за интервал k, %', help: 'Относительная надбавка к C за каждый интервал s сверх g; 0 % отключает учёт времени. До двух знаков после точки.', kind: 'percent', min: 0 },
];

// Effective config for the editor: defaults ← imported overrides.
export function effectiveFrom(defaults, overrides) {
  return mergeConfig(defaults, overrides || null);
}

// The editor works on a full config copy; export turns it back into minimal overrides.
export function exportOverrides(defaults, edited, note = 'exported from the local configurator') {
  const strip = clone(edited);
  delete strip.provenance;
  return diffToOverrides(defaults, strip, note);
}

// Recompute exactly as the CLI does: defaults ← overrides (from the edited state) → evaluate.
export function preview({ defaults, edited, profile, benchmarks, asOf = null }) {
  try {
    const overrides = exportOverrides(defaults, edited);
    const config = mergeConfig(defaults, overrides);
    const report = evaluate({ profile, config, benchmarks, asOf });
    return { ok: true, overrides, config, report, errors: [] };
  } catch (e) {
    if (e instanceof ValidationError || (e && Array.isArray(e.errors))) return { ok: false, errors: e.errors, message: e.message.split('\n')[0] };
    return { ok: false, errors: [{ path: '/', message: e.message }], message: e.message };
  }
}

export function reportBytes(report) {
  return canonicalStringify(report, { pretty: true });
}

export function configDigestText(config) {
  const c = clone(config);
  delete c.provenance;
  return canonicalStringify(c);
}

// Default effort shown in a model column: medium when supported, otherwise the first allowed effort.
export function defaultViewEffort(model) {
  const allowed = model.efforts || model.supportedEfforts;
  return allowed.includes('medium') ? 'medium' : allowed[0];
}

// Matrix rows for one phase. `view` maps model id → effort to display (view state only).
export function matrix(config, phase, view = {}) {
  return FACTOR_IDS.map((factor) => ({
    factor,
    weight: config.phases[phase].relevanceWeights[factor],
    cells: config.models.map((m) => {
      const effort = view[m.id] && m.supportedEfforts.includes(view[m.id]) ? view[m.id] : defaultViewEffort(m);
      const r = m.quality[phase][effort][factor];
      return { modelId: m.id, effort, ...cellView(r) };
    }),
  }));
}

export function cellView(r) {
  return {
    value: r.value,
    display: r.value === null ? 'Нет данных' : formatScore(r.value),
    status: r.status,
    letter: PROVENANCE_LETTERS[r.status].letter,
    statusLabel: PROVENANCE_LETTERS[r.status].ru,
    basis: r.basis,
    sources: r.sources || [],
    support: r.support || [],
    inheritedFrom: r.inheritedFrom || null,
    hasOrigin: Boolean(r.origin),
  };
}

// "Все уровни": factor × supported effort of one model in the current phase, plus resource rows.
export function allLevels(config, modelId, phase) {
  const m = config.models.find((x) => x.id === modelId);
  return {
    efforts: [...m.supportedEfforts],
    allowed: [...(m.efforts || m.supportedEfforts)],
    quality: FACTOR_IDS.map((factor) => ({ factor, cells: m.supportedEfforts.map((e) => ({ effort: e, ...cellView(m.quality[phase][e][factor]) })) })),
    resources: Object.entries(RESOURCE_KINDS).map(([kind, k]) => {
      const t = m.resources[k.path[0]][k.path[1]];
      return {
        kind, label: k.label, unit: k.unit, storedUnit: t.unit,
        cells: m.supportedEfforts.map((e) => {
          const r = t[phase][e];
          return { effort: e, value: r.value, display: r.value === null ? 'Нет данных' : `×${formatMultiplier(r.value)}`, status: r.status, letter: PROVENANCE_LETTERS[r.status].letter, basis: r.basis, hasOrigin: Boolean(r.origin) };
        }),
      };
    }),
  };
}

export function formatMultiplier(bp) {
  const whole = Math.floor(bp / 10000);
  const frac = String(bp % 10000).padStart(4, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}

// "1.5" → 15000; up to four decimals, exact.
export function parseMultiplier(text) {
  const t = String(text).trim().replace(/^×/, '');
  const m = /^(0|[1-9][0-9]{0,2})(?:\.([0-9]{1,4}))?$/.exec(t);
  if (!m) return { ok: false, error: `"${text}" is not a multiplier like 1.5 (up to four decimals)` };
  const bp = Number(m[1]) * 10000 + (m[2] ? Number(m[2].padEnd(4, '0')) : 0);
  if (bp > 1000000) return { ok: false, error: `"${text}" is above ×100` };
  return { ok: true, bp };
}

function originOf(prev) {
  if (prev.origin) return clone(prev.origin);
  const o = clone(prev);
  delete o.origin;
  return o;
}

// A user value (or explicit "no data") for one record. The replaced record is kept as `origin`.
function userRecord(prev, value, basis) {
  return value === null
    ? { value: null, status: 'unknown', basis: basis || 'set to unknown by the user (no data)', origin: originOf(prev) }
    : { value, status: 'user-override', basis: basis || 'user override in the configurator', origin: originOf(prev) };
}

export function setEstimate(config, modelId, phase, effort, factor, value, basis = null) {
  const next = clone(config);
  const m = next.models.find((x) => x.id === modelId);
  if (!m.supportedEfforts.includes(effort)) throw new RangeError(`effort ${effort} is not supported by ${modelId}`);
  m.quality[phase][effort][factor] = userRecord(m.quality[phase][effort][factor], value, basis);
  return next;
}

// Nullable estimate fields: empty or whitespace-only input means "no data" (explicit unknown with the
// previous record kept as origin). "0" is the number 0. Any other invalid input is an error.
export function setEstimateFromText(config, modelId, phase, effort, factor, text) {
  if (String(text).trim() === '') return { ok: true, config: setEstimate(config, modelId, phase, effort, factor, null), cleared: true };
  const p = parseScore(text);
  if (!p.ok) return { ok: false, error: p.error };
  return { ok: true, config: setEstimate(config, modelId, phase, effort, factor, p.bp) };
}

export function setResourceFromText(config, modelId, kind, phase, effort, text) {
  if (String(text).trim() === '') return { ok: true, config: setResource(config, modelId, kind, phase, effort, null), cleared: true };
  const p = parseMultiplier(text);
  if (!p.ok) return { ok: false, error: p.error };
  return { ok: true, config: setResource(config, modelId, kind, phase, effort, p.bp) };
}

// Required integer settings (weights, penalty minutes, thresholds): empty input is an error, never 0
// and never unknown.
export function parseRequiredInt(text, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const t = String(text).trim();
  if (t === '') return { ok: false, error: 'обязательное поле: введите число' };
  if (!/^(0|[1-9][0-9]*)$/.test(t)) return { ok: false, error: `"${t}" — не целое неотрицательное число` };
  const v = Number(t);
  if (v < min || v > max) return { ok: false, error: `значение должно быть от ${min} до ${max}` };
  return { ok: true, value: v };
}

// Penalty rate shown in percent (5 = 5 % = 500 bp), exact to two decimals.
export function parsePercentBp(text) {
  const t = String(text).trim();
  if (t === '') return { ok: false, error: 'обязательное поле: введите процент (0 отключает учёт времени)' };
  const p = parseScore(t);
  return p.ok ? { ok: true, value: p.bp } : { ok: false, error: p.error.replace('from 0 to 100', 'from 0 to 100 %') };
}

export function setTimePenalty(config, mode, key, value) {
  const next = clone(config);
  next.selection[mode].timePenalty[key] = value;
  return next;
}

export function setResource(config, modelId, kind, phase, effort, value, basis = null) {
  const next = clone(config);
  const m = next.models.find((x) => x.id === modelId);
  const k = RESOURCE_KINDS[kind];
  const t = m.resources[k.path[0]][k.path[1]];
  t[phase][effort] = userRecord(t[phase][effort], value, basis);
  return next;
}

// Reset of exactly one record to the defaults record (with its provenance).
export function resetEstimate(config, defaults, modelId, phase, effort, factor) {
  const next = clone(config);
  const d = defaults.models.find((x) => x.id === modelId);
  next.models.find((x) => x.id === modelId).quality[phase][effort][factor] = clone(d.quality[phase][effort][factor]);
  return next;
}

export function resetResource(config, defaults, modelId, kind, phase, effort) {
  const next = clone(config);
  const k = RESOURCE_KINDS[kind];
  const d = defaults.models.find((x) => x.id === modelId);
  next.models.find((x) => x.id === modelId).resources[k.path[0]][k.path[1]][phase][effort] = clone(d.resources[k.path[0]][k.path[1]][phase][effort]);
  return next;
}

export function setPath(config, path, value) {
  const next = clone(config);
  const keys = path.split('/').filter(Boolean);
  let node = next;
  for (const k of keys.slice(0, -1)) node = Array.isArray(node) ? node[Number(k)] : node[k];
  const last = keys[keys.length - 1];
  if (Array.isArray(node)) node[Number(last)] = value; else node[last] = value;
  return next;
}

export function setModelField(config, modelId, field, value) {
  const next = clone(config);
  const m = next.models.find((x) => x.id === modelId);
  m[field] = value;
  if (field === 'efforts' && Array.isArray(value) && value.length === 0) delete m.efforts;
  return next;
}

// Reset selected parts to the shipped defaults.
export function resetToDefaults(config, defaults, { models = [], groups = [] } = {}) {
  const next = clone(config);
  for (const id of models) {
    const i = next.models.findIndex((m) => m.id === id);
    const d = defaults.models.find((m) => m.id === id);
    if (i >= 0 && d) next.models[i] = clone(d);
    const pi = next.pricing.findIndex((p) => p.id === `${id}.standard`);
    const dp = defaults.pricing.find((p) => p.id === `${id}.standard`);
    if (pi >= 0 && dp) next.pricing[pi] = clone(dp);
  }
  for (const g of groups) next[g] = clone(defaults[g]);
  return next;
}

// Details for the provenance card of one record: the number's own sources (with the mapping used),
// supporting evidence, the replaced original, inheritance and migration.
export function provenanceCard(record, benchmarks, { phase = null, factor = null } = {}) {
  const byId = new Map(benchmarks.records.map((r) => [r.id, r]));
  const describe = (id) => {
    const r = byId.get(id);
    if (!r) return { id, missing: true };
    const mapping = phase && factor ? benchmarks.mappings.find((m) => m.benchmark.name === r.benchmark.name && m.benchmark.version === r.benchmark.version && m.metric === r.metric && m.phase === phase && m.factor === factor) : null;
    return {
      id,
      url: r.source.url,
      publisher: r.source.publisher,
      retrievedAt: r.source.retrievedAt,
      sourceKind: r.source.kind,
      benchmark: `${r.benchmark.name} ${r.benchmark.version}`,
      model: `${r.model.harness}/${r.model.modelId}`,
      effort: r.model.effort,
      metric: r.metric,
      result: r.unit === 'bp' ? `${formatScore(Math.max(0, Math.min(10000, r.score)))} (0–100)` : `${r.score} ${r.unit}`,
      conditions: r.conditions || null,
      mapping: mapping ? { id: mapping.id, relation: mapping.relation, rationale: mapping.rationale } : null,
    };
  };
  return {
    status: record.status,
    letter: PROVENANCE_LETTERS[record.status].letter,
    statusLabel: PROVENANCE_LETTERS[record.status].ru,
    value: record.value,
    basis: record.basis,
    sources: (record.sources || []).map(describe),
    support: (record.support || []).map(describe),
    inheritedFrom: record.inheritedFrom || null,
    migratedFrom: record.migratedFrom ? { rule: record.migratedFrom.rule, note: record.migratedFrom.note } : null,
    origin: record.origin ? {
      value: record.origin.value, status: record.origin.status, basis: record.origin.basis,
      sources: (record.origin.sources || []).map(describe), support: (record.origin.support || []).map(describe),
    } : null,
  };
}

// Rank comparison between two reports (for the "what changed" column).
export function compareReports(prev, next) {
  const out = {};
  for (const key of RANKING_KEYS) {
    const before = new Map((prev ? prev.rankings[key].candidates : []).map((c) => [c.candidateId, c]));
    out[key] = next.rankings[key].candidates.map((c) => {
      const b = before.get(c.candidateId);
      return {
        candidateId: c.candidateId,
        rank: c.rank,
        previousRank: b ? b.rank : null,
        delta: b ? b.rank - c.rank : null,
        groupChanged: b ? b.group !== c.group : false,
        utilityDelta: b && b.utilityBp !== null && c.utilityBp !== null ? c.utilityBp - b.utilityBp : null,
      };
    });
    out[`${key}#status`] = { before: prev ? prev.rankings[key].status : null, after: next.rankings[key].status };
    out[`${key}#floor`] = { before: prev ? prev.rankings[key].qualityFloorBp : null, after: next.rankings[key].qualityFloorBp };
  }
  return out;
}

export function parseIntOrNull(text) {
  const t = String(text).trim();
  if (t === '' || t.toLowerCase() === 'unknown') return null;
  if (!/^-?[0-9]+$/.test(t)) return Number.NaN;
  return Number(t);
}

// Readable economics of one candidate for the preview: original forecast vs the comparison value S.
export function economicsView(c, mode) {
  const a = c.adjusted;
  if (!a) return { policy: 'weighted-utility', text: c.utilityBp === null ? '—' : `utility ${formatScore(c.utilityBp)}` };
  const money = (micros) => `${formatFraction({ numerator: String(micros), denominator: '1000000' }, 4)}`;
  const forecast = mode === 'api'
    ? (a.cost === null ? 'нет данных' : `${c.resource.currency} ${money(a.cost)}`)
    : (a.cost === null ? 'нет данных' : `${a.cost} ед. нагрузки`);
  const mult = a.multiplier ? formatFraction(a.multiplier, 4) : '—';
  let sText = 'не определён';
  if (a.value) {
    sText = mode === 'api'
      ? `${c.resource.currency} ${formatFraction({ numerator: a.value.numerator, denominator: (BigInt(a.value.denominator) * 1000000n).toString() }, 4)}`
      : `${formatFraction(a.value, 4)} ед.`;
  }
  return {
    policy: a.policy,
    forecast,
    typical: a.typicalMinutes === null ? 'нет данных' : `${a.typicalMinutes} мин`,
    multiplier: `×${mult}`,
    s: sText,
    missing: a.missing,
  };
}
