// Browser UI for the configurator. All calculation goes through configurator/model.mjs → src/core.
import {
  effectiveFrom, exportOverrides, preview, matrix, allLevels, setEstimate, setEstimateFromText, setResource, resetEstimate, resetResource,
  setPath, setModelField, resetToDefaults, compareReports, parseIntOrNull, reportBytes, provenanceCard, defaultViewEffort,
  parseMultiplier, configDigestText, WEIGHT_LABEL, WEIGHT_HELP, WEIGHT_RELEVANCE_HELP, SCORE_HELP,
  CLEAR_HELP, POLICY_HELP, PENALTY_FIELDS, setResourceFromText, parseRequiredInt, parsePercentBp, setTimePenalty, economicsView,
} from './model.mjs';
import {
  parseJsonStrict, canonicalStringify, RANKING_KEYS, formatMicros, RUBRIC, formatScore, SCORE_LABEL, PROVENANCE_LETTERS,
} from '../src/core/index.mjs';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'text') n.textContent = v;
    else if (k === 'style') n.style.cssText = v; // CSSOM: allowed under the strict style-src CSP
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};

const state = {
  defaults: null, benchmarks: null, profile: null, start: null, edited: null, phase: 'apply',
  asOf: null, baseline: null, last: null, inputErrors: [], startLabel: 'shipped defaults',
  view: {}, // model id → effort shown in its column (view only; never part of the config)
  levels: null, // model id whose "Все уровни" table is open
  card: null, // { kind: 'quality'|'resource', modelId, phase, effort, factor|resourceKind }
};
let tipSeq = 0;

async function fetchJson(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return parseJsonStrict(await r.text(), path);
}

function setStatus(text, kind = 'ok') {
  const s = $('status');
  s.textContent = text;
  s.className = `status ${kind}`;
}

function showErrors(errors) {
  const list = $('errors');
  list.replaceChildren(...errors.map((e) => el('li', { text: `${e.path}: ${e.message}` })));
  $('errors-panel').hidden = errors.length === 0;
}

// ------------------------------------------------------------------ editing helpers
function update(next) {
  state.edited = next;
  recompute();
  render();
}

// Integer input. Required fields (weights, thresholds, penalty minutes) reject empty input; nullable
// fields (rates, optional constraints) store an empty value as null ("none"/unknown).
function intInput({ value, onChange, label, width = null, placeholder = 'unknown', required = false, min = 0, max = Number.MAX_SAFE_INTEGER }) {
  const input = el('input', {
    type: 'text', inputmode: 'numeric', value: value === null || value === undefined ? '' : String(value), placeholder: required ? 'обязательно' : placeholder, 'aria-label': label, 'aria-required': required ? 'true' : null, style: width ? `width:${width}px` : null,
  });
  const reject = (message) => {
    state.inputErrors = [{ path: label, message }];
    showErrors(state.inputErrors);
    setStatus('Ввод отклонён: значение не изменено', 'err');
    input.setAttribute('aria-invalid', 'true');
  };
  input.addEventListener('change', () => {
    let v;
    if (required) {
      const r = parseRequiredInt(input.value, { min, max });
      if (!r.ok) return reject(r.error);
      v = r.value;
    } else {
      v = parseIntOrNull(input.value);
      if (Number.isNaN(v)) return reject(`"${input.value}" — не целое число`);
    }
    input.removeAttribute('aria-invalid');
    state.inputErrors = [];
    onChange(v);
  });
  return input;
}

// Provenance circle: a real button (keyboard focus + Enter/Space), full accessible name, tooltip on
// hover and focus, card on activation. The letter carries the meaning without colour.
function provCircle(cell, where, describe) {
  const full = PROVENANCE_LETTERS[cell.status];
  const id = `tip-${tipSeq += 1}`;
  const short = cell.basis.length > 140 ? `${cell.basis.slice(0, 140)}…` : cell.basis;
  const btn = el('button', {
    type: 'button', class: `prov prov-${full.letter}`, 'aria-label': `Происхождение: ${full.label} — ${full.ru}. ${describe}. Открыть подробности`, 'aria-describedby': id,
    'data-status': cell.status,
    onclick: () => openCard(where),
  }, full.letter);
  const tip = el('span', { role: 'tooltip', id, class: 'tip' }, el('strong', { text: `${full.label} — ${full.ru}` }), el('br'), short);
  return [btn, tip];
}

function scoreCell({ modelId, phase, effort, factor, cell, changed }) {
  const m = state.edited.models.find((x) => x.id === modelId);
  const describe = `${m.displayName} · ${phase === 'apply' ? 'реализация' : 'проверка'} · ${RUBRIC[factor].title} · effort ${effort}`;
  const input = el('input', {
    type: 'text', inputmode: 'decimal', value: cell.value === null ? '' : cell.display, placeholder: 'Нет данных',
    'aria-label': `${SCORE_LABEL} — ${describe}`, 'aria-description': CLEAR_HELP, title: SCORE_HELP, style: 'width:58px', 'data-cell': `${modelId}|${phase}|${effort}|${factor}`,
  });
  const err = el('span', { class: 'err-inline', role: 'alert' });
  input.addEventListener('change', () => {
    const r = setEstimateFromText(state.edited, modelId, phase, effort, factor, input.value);
    if (!r.ok) {
      err.textContent = r.error;
      state.inputErrors = [{ path: `${modelId} ${phase}/${effort}/${factor}`, message: r.error }];
      showErrors(state.inputErrors);
      setStatus('Ввод отклонён: значение не изменено', 'err');
      return;
    }
    state.inputErrors = [];
    update(r.config);
  });
  const where = { kind: 'quality', modelId, phase, effort, factor };
  return el('td', { class: [changed ? 'edited' : null, cell.value === null ? 'unknown' : null].filter(Boolean).join(' ') || null },
    el('span', { class: 'cellwrap' }, input, ...provCircle(cell, where, describe)), err);
}

function infoButton(label, text) {
  const id = `tip-${tipSeq += 1}`;
  return el('span', { class: 'cellwrap' },
    el('button', { type: 'button', class: 'info', 'aria-label': `${label}: пояснение`, 'aria-describedby': id }, 'i'),
    el('span', { role: 'tooltip', id, class: 'tip', text }));
}

// ------------------------------------------------------------------ matrix
function renderMatrix() {
  const cfg = state.edited;
  const phase = state.phase;
  const rows = matrix(cfg, phase, state.view);
  const startRows = matrix(state.start, phase, state.view);
  const head = el('tr', {},
    el('th', { text: 'Параметр' }),
    el('th', {}, WEIGHT_LABEL[phase], ' ', infoButton(WEIGHT_LABEL[phase], `${WEIGHT_HELP} ${WEIGHT_RELEVANCE_HELP}`)),
    ...cfg.models.map((m) => {
      const supported = m.supportedEfforts;
      const active = new Set(m.efforts || supported);
      const viewEffort = state.view[m.id] && supported.includes(state.view[m.id]) ? state.view[m.id] : defaultViewEffort(m);
      return el('th', { class: 'model', scope: 'col' },
        el('div', { text: m.displayName }),
        el('div', { class: 'muted', text: `${m.harness} · identity ${m.identity.status}` }),
        el('label', {}, 'Показать effort (только просмотр)', (() => {
          const sel = el('select', { 'aria-label': `${m.displayName}: показать effort` }, ...supported.map((e) => el('option', { value: e, selected: e === viewEffort, text: e })));
          sel.addEventListener('change', () => { state.view[m.id] = sel.value; render(); });
          return sel;
        })()),
        el('button', { type: 'button', onclick: () => { state.levels = m.id; render(); $('levels-panel').scrollIntoView({ block: 'nearest' }); }, text: 'Все уровни', 'aria-label': `${m.displayName}: все уровни effort` }),
        el('label', {}, 'modelId', (() => {
          const i = el('input', { type: 'text', value: m.modelId, 'aria-label': `${m.id} modelId`, style: 'width:120px' });
          i.addEventListener('change', () => update(setModelField(state.edited, m.id, 'modelId', i.value.trim())));
          return i;
        })()),
        el('label', { style: 'flex-direction:row;gap:4px;align-items:center' }, (() => {
          const c = el('input', { type: 'checkbox', checked: m.enabled, 'aria-label': `${m.id} enabled` });
          c.addEventListener('change', () => update(setModelField(state.edited, m.id, 'enabled', c.checked)));
          return c;
        })(), 'enabled'),
        (() => {
          const sel = el('select', { 'aria-label': `${m.id} доступность для аккаунта` }, ...['available', 'unknown', 'unavailable'].map((a) => el('option', { value: a, selected: m.availability === a, text: `доступность: ${a}` })));
          sel.addEventListener('change', () => update(setModelField(state.edited, m.id, 'availability', sel.value)));
          return sel;
        })(),
        el('div', { class: 'efforts muted small' }, 'Разрешены для рекомендаций:', el('br'), ...supported.map((e) => {
          const c = el('input', { type: 'checkbox', checked: active.has(e), 'aria-label': `${m.id}: effort ${e} разрешён для рекомендаций` });
          c.addEventListener('change', () => {
            const cur = new Set(state.edited.models.find((x) => x.id === m.id).efforts || supported);
            if (c.checked) cur.add(e); else cur.delete(e);
            const list = supported.filter((x) => cur.has(x));
            update(setModelField(state.edited, m.id, 'efforts', list.length === supported.length ? [] : list));
          });
          return el('label', {}, c, e);
        })),
        el('button', { type: 'button', class: 'small', onclick: () => update(resetToDefaults(state.edited, state.defaults, { models: [m.id] })), text: 'reset модели' }));
    }));
  const body = rows.map((row, ri) => el('tr', {},
    el('th', { scope: 'row', title: RUBRIC[row.factor].anchors.map((a, i) => `${i}: ${a}`).join('\n'), text: `${RUBRIC[row.factor].title} (${row.factor})` }),
    el('td', {}, intInput({
      value: row.weight, label: `${WEIGHT_LABEL[phase]}: ${row.factor}`, width: 44, required: true,
      onChange: (v) => update(setPath(state.edited, `/phases/${phase}/relevanceWeights/${row.factor}`, v)),
    })),
    ...row.cells.map((c, ci) => scoreCell({
      modelId: c.modelId, phase, effort: c.effort, factor: row.factor, cell: c, changed: startRows[ri].cells[ci].value !== c.value || startRows[ri].cells[ci].status !== c.status,
    }))));
  $('matrix').replaceChildren(el('thead', {}, head), el('tbody', {}, ...body));
}

// ------------------------------------------------------------------ "Все уровни" (one model, current phase)
function renderLevels() {
  const panel = $('levels-panel');
  if (!state.levels) { panel.hidden = true; return; }
  panel.hidden = false;
  const m = state.edited.models.find((x) => x.id === state.levels);
  const phase = state.phase;
  const t = allLevels(state.edited, m.id, phase);
  $('levels-info').textContent = `${m.displayName} (${m.harness}) · ${phase === 'apply' ? 'реализация' : 'проверка'}: каждая ячейка — отдельная запись со своим происхождением. Разрешены для рекомендаций: ${t.allowed.join(', ')}. Ресурсы — в своих единицах, не в шкале 0–100.`;
  const head = el('tr', {}, el('th', { text: 'Параметр / ресурс' }), ...t.efforts.map((e) => el('th', { text: `effort ${e}` })));
  const quality = t.quality.map((row) => el('tr', {},
    el('th', { scope: 'row', text: `${RUBRIC[row.factor].title} · ${SCORE_LABEL}` }),
    ...row.cells.map((c) => scoreCell({ modelId: m.id, phase, effort: c.effort, factor: row.factor, cell: c, changed: c.status === 'user-override' || c.hasOrigin }))));
  const resources = t.resources.map((row) => el('tr', {},
    el('th', { scope: 'row', text: `${row.label} (${row.unit})` }),
    ...row.cells.map((c) => {
      const describe = `${m.displayName} · ${phase} · ${row.label} · effort ${c.effort}`;
      const input = el('input', { type: 'text', value: c.value === null ? '' : c.display, placeholder: 'Нет данных', 'aria-label': `${row.label} (${row.unit}) — ${describe}`, 'aria-description': CLEAR_HELP, title: CLEAR_HELP, style: 'width:70px' });
      const err = el('span', { class: 'err-inline', role: 'alert' });
      input.addEventListener('change', () => {
        const r = setResourceFromText(state.edited, m.id, row.kind, phase, c.effort, input.value);
        if (!r.ok) { err.textContent = r.error; setStatus('Ввод отклонён: значение не изменено', 'err'); return; }
        update(r.config);
      });
      const where = { kind: 'resource', modelId: m.id, phase, effort: c.effort, resourceKind: row.kind };
      return el('td', { class: c.value === null ? 'unknown' : null }, el('span', { class: 'cellwrap' }, input, ...provCircle(c, where, describe)), err);
    })));
  $('levels').replaceChildren(el('thead', {}, head), el('tbody', {}, ...quality, ...resources));
}

// ------------------------------------------------------------------ provenance card
function recordAt(where, cfg = state.edited) {
  const m = cfg.models.find((x) => x.id === where.modelId);
  if (where.kind === 'quality') return m.quality[where.phase][where.effort][where.factor];
  const path = { usage: ['api', 'usage'], load: ['subscription', 'load'], minutes: ['time', 'minutes'] }[where.resourceKind];
  return m.resources[path[0]][path[1]][where.phase][where.effort];
}

function sourceList(title, list, deriving = true) {
  if (!list.length) return [];
  return [el('h3', { text: title }), el('ul', {}, ...list.map((s) => el('li', {}, s.missing ? `${s.id}: запись не найдена` : [
    el('strong', { text: s.id }), ` — ${s.benchmark}, ${s.metric} = ${s.result}; ${s.model} @ ${s.effort}; ${s.publisher} (${s.sourceKind}), ${s.retrievedAt}`,
    s.conditions ? el('div', { class: 'small muted', text: s.conditions }) : null,
    deriving
      ? (s.mapping ? el('div', { class: 'small', text: `Правило преобразования — mapping ${s.mapping.id} (${s.mapping.relation}): ${s.mapping.rationale}` }) : el('div', { class: 'small err-inline', text: 'Нет mapping к этой фазе и параметру.' }))
      : el('div', { class: 'small muted', text: 'Подтверждает общее предположение (например, порядок моделей), но не вычисляет это число.' }),
    el('div', { class: 'small', text: s.url }),
  ])))];
}

function openCard(where) {
  state.card = where;
  const rec = recordAt(where);
  const card = provenanceCard(rec, state.benchmarks, where.kind === 'quality' ? { phase: where.phase, factor: where.factor } : {});
  const m = state.edited.models.find((x) => x.id === where.modelId);
  const valueText = rec.value === null ? 'Нет данных' : (where.kind === 'quality' ? `${formatScore(rec.value)} (0–100; ${rec.value} bp)` : `×${rec.value / 10000} (${rec.value} bp)`);
  $('prov-title').textContent = `Происхождение: ${m.displayName} · ${where.phase} · effort ${where.effort} · ${where.kind === 'quality' ? where.factor : where.resourceKind}`;
  $('prov-body').replaceChildren(
    el('dl', {},
      el('dt', { text: 'Статус' }), el('dd', {}, el('span', { class: `prov prov-${card.letter}`, 'aria-hidden': 'true' }, card.letter), ` ${card.status} — ${card.statusLabel}`),
      el('dt', { text: 'Значение' }), el('dd', { text: valueText }),
      el('dt', { text: card.status === 'user-override' || (card.status === 'unknown' && card.origin) ? 'Объяснение пользователя' : 'Основание' }), el('dd', { text: card.basis }),
      card.inheritedFrom ? el('dt', { text: 'Унаследовано' }) : null,
      card.inheritedFrom ? el('dd', { text: `от ${card.inheritedFrom.harness}/${card.inheritedFrom.modelId} (исходный статус ${card.inheritedFrom.status})` }) : null,
      card.migratedFrom ? el('dt', { text: 'Миграция' }) : null,
      card.migratedFrom ? el('dd', { text: `${card.migratedFrom.rule}: ${card.migratedFrom.note}` }) : null),
    ...sourceList('Источники числа', card.sources),
    ...sourceList('Подтверждающие свидетельства', card.support, false),
    ...(card.origin ? [el('h3', { text: 'Исходная запись (до изменения пользователем)' }), el('p', { text: `${card.origin.value === null ? 'Нет данных' : (where.kind === 'quality' ? formatScore(card.origin.value) : `×${card.origin.value / 10000}`)} — ${card.origin.status}: ${card.origin.basis}` }),
      ...sourceList('Источники исходной записи', card.origin.sources), ...sourceList('Подтверждающие свидетельства исходной записи', card.origin.support, false)] : []),
  );
  const dlg = $('prov-dialog');
  if (!dlg.open) dlg.showModal();
}

// ------------------------------------------------------------------ resources and selection
function policyInputs(mode) {
  const sel = state.edited.selection;
  if (sel.policy !== 'minimum-resource-with-time-penalty') {
    const w = sel[mode].weights;
    return el('div', { class: 'muted small' }, `Политика weighted-utility (legacy): веса q${w.quality}/e${w.economy}/t${w.time}. Переход на минимизацию расхода — явной командой openspec-assess switch-policy.`);
  }
  const t = sel[mode].timePenalty;
  return el('div', {},
    el('p', { class: 'small' }, 'Политика: minimum-resource-with-time-penalty v1 — дешевейший достаточный вариант ', infoButton('Политика выбора', POLICY_HELP)),
    el('div', { class: 'kv' }, ...PENALTY_FIELDS.map((f) => {
      const shown = f.kind === 'percent' ? formatScore(t[f.key]) : String(t[f.key]);
      const input = el('input', { type: 'text', inputmode: 'decimal', value: shown, 'aria-label': `${f.label} (${mode === 'api' ? 'API' : 'подписка'})`, 'aria-required': 'true', title: f.help, style: 'width:70px' });
      input.addEventListener('change', () => {
        const r = f.kind === 'percent' ? parsePercentBp(input.value) : parseRequiredInt(input.value, { min: f.min, max: 100000 });
        if (!r.ok) {
          state.inputErrors = [{ path: `/selection/${mode}/timePenalty/${f.key}`, message: r.error }];
          showErrors(state.inputErrors);
          setStatus('Ввод отклонён: значение не изменено', 'err');
          input.setAttribute('aria-invalid', 'true');
          return;
        }
        state.inputErrors = [];
        update(setTimePenalty(state.edited, mode, f.key, r.value));
      });
      return el('label', {}, f.label, el('span', { class: 'cellwrap' }, input, infoButton(f.label, f.help)));
    })));
}

function renderResources() {
  const cfg = state.edited;
  const api = cfg.selection.api;
  const currency = el('input', { type: 'text', value: api.currency, 'aria-label': '/selection/api/currency', style: 'width:60px' });
  currency.addEventListener('change', () => update(setPath(state.edited, '/selection/api/currency', currency.value.trim().toUpperCase())));
  $('api-settings').replaceChildren(
    el('div', { class: 'kv' }, el('label', {}, 'currency', currency)),
    policyInputs('api'),
  );
  const rateKeys = ['uncachedInput', 'cacheRead', 'cacheWrite', 'output', 'reasoning'];
  $('pricing').replaceChildren(
    el('thead', {}, el('tr', {}, el('th', { text: 'Pricing (micros / 1M tokens)' }), el('th', { text: 'status' }), ...rateKeys.map((k) => el('th', { text: k })), el('th', { text: 'reasoning billed' }), el('th', { text: 'long context' }))),
    el('tbody', {}, ...cfg.pricing.map((p, i) => el('tr', {},
      el('td', { title: p.note || '', text: p.id }),
      el('td', {}, (() => {
        const s = el('select', { 'aria-label': `/pricing/${i}/status` }, ...['confirmed', 'example', 'unknown'].map((x) => el('option', { value: x, selected: p.status === x, text: x })));
        s.addEventListener('change', () => update(setPath(state.edited, `/pricing/${i}/status`, s.value)));
        return s;
      })()),
      ...rateKeys.map((k) => el('td', {}, intInput({ value: p.rates[k], label: `/pricing/${i}/rates/${k}`, width: 80, onChange: (v) => update(setPath(state.edited, `/pricing/${i}/rates/${k}`, v)) }))),
      el('td', {}, (() => {
        const s = el('select', { 'aria-label': `/pricing/${i}/reasoningBilling` }, ...['as-output', 'separate'].map((x) => el('option', { value: x, selected: p.reasoningBilling === x, text: x })));
        s.addEventListener('change', () => update(setPath(state.edited, `/pricing/${i}/reasoningBilling`, s.value)));
        return s;
      })()),
      el('td', { text: p.longContext ? `> ${p.longContext.thresholdTokens}` : '—' })))),
  );
  $('sub-settings').replaceChildren(policyInputs('subscription'));
  $('pools').replaceChildren(
    el('thead', {}, el('tr', {}, el('th', { text: 'Quota pool' }), el('th', { text: 'members' }), el('th', { text: 'remaining' }), el('th', { text: 'unit' }), el('th', { text: 'observedAt (UTC)' }), el('th', { text: 'max age h' }), el('th', { text: 'units / 1000 load' }), el('th', { text: '' }))),
    el('tbody', {}, ...cfg.quotaPools.map((pool, i) => {
      const o = pool.observation;
      const members = cfg.models.filter((m) => m.resources.subscription.poolId === pool.id).map((m) => m.family).join(', ');
      const text = (field, value, w = 80) => {
        const t = el('input', { type: 'text', value: value ?? '', 'aria-label': `/quotaPools/${i}/observation/${field}`, style: `width:${w}px` });
        t.addEventListener('change', () => update(setPath(state.edited, `/quotaPools/${i}/observation/${field}`, t.value.trim())));
        return t;
      };
      return el('tr', {},
        el('td', { title: pool.note || '', text: pool.label }),
        el('td', { text: members }),
        o ? el('td', {}, intInput({ value: o.remaining, label: `/quotaPools/${i}/observation/remaining`, width: 70, required: true, onChange: (v) => update(setPath(state.edited, `/quotaPools/${i}/observation/remaining`, v)) })) : el('td', { class: 'muted', text: 'no observation' }),
        el('td', {}, o ? text('unit', o.unit, 70) : ''),
        el('td', {}, o ? text('observedAt', o.observedAt, 150) : ''),
        el('td', {}, o ? intInput({ value: o.maxAgeHours, label: `/quotaPools/${i}/observation/maxAgeHours`, width: 40, required: true, min: 1, onChange: (v) => update(setPath(state.edited, `/quotaPools/${i}/observation/maxAgeHours`, v)) }) : ''),
        el('td', {}, intInput({
          value: pool.conversion ? pool.conversion.quotaUnitsPer1000Load : null, label: `/quotaPools/${i}/conversion/quotaUnitsPer1000Load`, width: 60, placeholder: 'none',
          onChange: (v) => update(setPath(state.edited, `/quotaPools/${i}/conversion`, v === null ? null : { quotaUnitsPer1000Load: v, unit: o ? o.unit : 'units', source: 'entered in the configurator' })),
        })),
        el('td', {}, el('button', {
          type: 'button',
          onclick: () => update(setPath(state.edited, `/quotaPools/${i}/observation`, o ? null : { observedAt: state.asOf || '2026-01-01T00:00:00Z', maxAgeHours: 24, remaining: 0, unit: 'percent', resetAt: null, source: 'entered in the configurator' })),
          text: o ? 'clear observation' : 'add observation',
        })));
    })),
  );
  const c = cfg.constraints;
  const caps = el('input', { type: 'text', value: c.requiredCapabilities.join(', '), 'aria-label': '/constraints/requiredCapabilities', style: 'width:200px' });
  caps.addEventListener('change', () => update(setPath(state.edited, '/constraints/requiredCapabilities', caps.value.split(',').map((x) => x.trim()).filter(Boolean))));
  const floors = (phase) => {
    const t = el('input', { type: 'text', value: cfg.phases[phase].qualityFloors.map((f) => `${f.fromDemandBp}:${f.floorBp}`).join(' '), 'aria-label': `/phases/${phase}/qualityFloors`, style: 'width:320px' });
    t.addEventListener('change', () => {
      const list = t.value.trim().split(/\s+/).filter(Boolean).map((pair) => pair.split(':').map(Number)).map(([a, b]) => ({ fromDemandBp: a, floorBp: b }));
      update(setPath(state.edited, `/phases/${phase}/qualityFloors`, list));
    });
    return el('label', {}, `${phase} floors (demand:floor bp)`, t);
  };
  $('constraints').replaceChildren(el('div', { class: 'kv' },
    el('label', {}, 'min context tokens', intInput({ value: c.minContextTokens, label: '/constraints/minContextTokens', placeholder: 'none', onChange: (v) => update(setPath(state.edited, '/constraints/minContextTokens', v)) })),
    el('label', {}, 'max API cost (micros)', intInput({ value: c.api.maxCostMicros, label: '/constraints/api/maxCostMicros', placeholder: 'none', onChange: (v) => update(setPath(state.edited, '/constraints/api/maxCostMicros', v)) })),
    el('label', {}, 'required capabilities', caps),
    floors('apply'), floors('verify')));
}

// ------------------------------------------------------------------ preview
function recompute() {
  if (!state.profile) {
    state.last = null;
    $('preview-info').textContent = 'Load a profile to see the four rankings.';
    showErrors(state.inputErrors);
    return;
  }
  const r = preview({ defaults: state.defaults, edited: state.edited, profile: state.profile, benchmarks: state.benchmarks, asOf: state.asOf });
  if (!r.ok) {
    showErrors(r.errors);
    setStatus(`Invalid: ${r.message}`, 'err');
    state.last = null;
    return;
  }
  showErrors(state.inputErrors);
  state.last = r;
  setStatus(`Preview up to date · ${r.overrides.set && Object.keys(r.overrides.set).length ? 'overrides active' : 'defaults only'}`, 'ok');
}

function renderPreview() {
  const box = $('preview');
  if (!state.last) { box.replaceChildren(); return; }
  const { report } = state.last;
  const cmp = compareReports(state.baseline, report);
  $('preview-info').textContent = `Change ${report.change.name} (${report.change.stage}) · demand ${report.properties.demandBp} bp · baseline: ${state.baseline ? 'set' : 'none'}. Δ = rank change against the baseline.`;
  box.replaceChildren(...RANKING_KEYS.map((key) => {
    const r = report.rankings[key];
    const mode = key.split('/')[1];
    const st = cmp[`${key}#status`];
    const fl = cmp[`${key}#floor`];
    const isNew = r.policy.id === 'minimum-resource-with-time-penalty';
    const tp = r.policy.timePenalty;
    const policyLine = isNew
      ? `политика: дешевейший достаточный вариант · g ${tp.graceMinutes} мин, s ${tp.intervalMinutes} мин, k ${formatScore(tp.rateBp)} %`
      : `политика weighted-utility (legacy) · weights q${r.selectionWeights.quality}/e${r.selectionWeights.economy}/t${r.selectionWeights.time}`;
    const heads = isNew
      ? ['#', 'Δ', 'candidate', 'effort', 'group', 'fit 0–100', mode === 'api' ? 'C: верхний прогноз стоимости' : 'C: верхний прогноз нагрузки', 'T: типичное время', 'штраф времени', 'S для сравнения (не цена)']
      : ['#', 'Δ', 'candidate', 'effort', 'group', 'fit 0–100', 'utility 0–100', mode === 'api' ? 'typical cost' : 'typical load (units)'];
    return el('section', {},
      el('h3', { text: `${key} — ${r.status}` }),
      el('p', { class: 'small', text: r.message }),
      el('p', { class: 'small muted', text: `порог качества ${formatScore(r.qualityFloorBp)} (0–100)${state.baseline && fl.before !== fl.after ? ` (было ${formatScore(fl.before)})` : ''}${state.baseline && st.before !== st.after ? ` · status was ${st.before}` : ''} · ${policyLine}` }),
      el('table', {},
        el('thead', {}, el('tr', {}, ...heads.map((h) => el('th', { text: h })))),
        el('tbody', {}, ...r.candidates.map((c, i) => {
          const d = cmp[key][i];
          const lead = [
            el('td', { text: c.rank }),
            el('td', { class: d.delta > 0 ? 'up' : (d.delta < 0 ? 'down' : null), text: d.delta === null ? (state.baseline ? 'new' : '') : (d.delta > 0 ? `+${d.delta}` : d.delta === 0 ? '·' : String(d.delta)) }),
            el('td', { text: c.candidateId }),
            el('td', { text: c.recommendedEffort }),
            el('td', { class: `g-${c.group}`, text: c.group }),
            el('td', { text: c.suitability.valueBp === null ? '—' : formatScore(c.suitability.valueBp) }),
          ];
          if (isNew) {
            const e = economicsView(c, mode);
            const why = c.economicComplete ? '' : `нет данных: ${e.missing.join(', ')}`;
            return el('tr', { title: [...c.reasons, why].filter(Boolean).join('\n') }, ...lead,
              el('td', { text: e.forecast }),
              el('td', { text: e.typical }),
              el('td', { text: e.multiplier }),
              el('td', { class: c.economicComplete ? null : 'unknown', text: e.s }));
          }
          const res = mode === 'api'
            ? (c.resource.status === 'known' ? formatMicros(c.resource.typicalMicros, c.resource.currency) : 'unknown')
            : (c.resource.status === 'known' ? `${c.resource.typicalLoad} (${c.resource.capacity.status})` : 'unknown');
          return el('tr', { title: c.reasons.join('\n') }, ...lead,
            el('td', { text: c.utilityBp === null ? '—' : formatScore(c.utilityBp) }),
            el('td', { text: res }));
        }))),
      r.excluded.length ? el('p', { class: 'small', text: `Excluded: ${r.excluded.map((e) => `${e.candidateId} (${e.reasons.join('; ')})`).join(', ')}` }) : null);
  }));
}

function render() {
  renderMatrix();
  renderLevels();
  renderResources();
  renderPreview();
  document.querySelectorAll('[data-phase]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.phase === state.phase)));
}

// ------------------------------------------------------------------ inputs, export, reset
async function readFileJson(input) {
  const f = input.files && input.files[0];
  if (!f) return null;
  return parseJsonStrict(await f.text(), f.name);
}

function startFrom(overrides, label) {
  try {
    state.start = effectiveFrom(state.defaults, overrides);
    state.edited = state.start;
    state.startLabel = label;
    state.baseline = null;
    recompute();
    if (state.last) state.baseline = state.last.report;
    render();
    $('adv').value = canonicalStringify(exportOverrides(state.defaults, state.edited), { pretty: true });
    $('inputs-info').textContent = `Started from ${label}${state.profile ? ` · profile ${state.profile.change.name} (${state.profile.stage})` : ''}. The baseline for Δ is this starting point.`;
  } catch (e) {
    showErrors(e.errors || [{ path: '/', message: e.message }]);
    setStatus('Overrides rejected', 'err');
  }
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wire() {
  $('prov-close').addEventListener('click', () => $('prov-dialog').close());
  $('prov-reset').addEventListener('click', () => {
    const w = state.card;
    if (!w) return;
    $('prov-dialog').close();
    update(w.kind === 'quality'
      ? resetEstimate(state.edited, state.defaults, w.modelId, w.phase, w.effort, w.factor)
      : resetResource(state.edited, state.defaults, w.modelId, w.resourceKind, w.phase, w.effort));
  });
  $('btn-levels-close').addEventListener('click', () => { state.levels = null; render(); });
  document.querySelectorAll('[data-phase]').forEach((b) => b.addEventListener('click', () => { state.phase = b.dataset.phase; render(); }));
  $('in-profile').addEventListener('change', async (ev) => {
    try {
      state.profile = await readFileJson(ev.target);
      recompute();
      if (!state.baseline && state.last) state.baseline = state.last.report;
      render();
    } catch (e) { showErrors([{ path: '/', message: e.message }]); setStatus('Profile rejected', 'err'); }
  });
  $('in-overrides').addEventListener('change', async (ev) => {
    try { startFrom(await readFileJson(ev.target), ev.target.files[0].name); } catch (e) { showErrors([{ path: '/', message: e.message }]); setStatus('Overrides rejected', 'err'); }
  });
  $('in-asof').addEventListener('change', () => {
    const v = $('in-asof').value.trim();
    state.asOf = v === '' ? null : v;
    recompute();
    render();
  });
  $('btn-example').addEventListener('click', async () => {
    state.profile = await fetchJson('../examples/golden/profile.json');
    $('in-asof').value = '2026-11-14T12:00:00Z';
    state.asOf = '2026-11-14T12:00:00Z';
    startFrom(await fetchJson('../examples/golden/overrides.json'), 'example overrides (examples/golden/overrides.json)');
  });
  $('btn-baseline').addEventListener('click', () => { if (state.last) { state.baseline = state.last.report; render(); } });
  $('btn-reset-all').addEventListener('click', () => update(resetToDefaults(state.edited, state.defaults, { models: state.defaults.models.map((m) => m.id), groups: ['phases', 'selection', 'constraints', 'quotaPools', 'complexityRules', 'workloads'] })));
  $('btn-export').addEventListener('click', () => {
    try {
      download('overrides.json', canonicalStringify(exportOverrides(state.defaults, state.edited), { pretty: true }));
    } catch (e) { showErrors(e.errors || [{ path: '/', message: e.message }]); }
  });
  $('btn-adv-refresh').addEventListener('click', () => { $('adv').value = canonicalStringify(exportOverrides(state.defaults, state.edited), { pretty: true }); });
  $('btn-adv-apply').addEventListener('click', () => {
    try {
      const ov = parseJsonStrict($('adv').value, 'overrides JSON');
      state.edited = effectiveFrom(state.defaults, ov);
      recompute();
      render();
    } catch (e) {
      showErrors(e.errors || [{ path: '/', message: e.message }]);
      setStatus('Overrides JSON rejected', 'err');
    }
  });
}

async function boot() {
  try {
    [state.defaults, state.benchmarks] = await Promise.all([fetchJson('../config/defaults.json'), fetchJson('../config/benchmarks.json')]);
    wire();
    startFrom(null, 'shipped defaults');
    setStatus(state.profile ? 'Ready' : 'Ready — load a profile for the preview', 'ok');
  } catch (e) {
    setStatus(`Failed to load package files: ${e.message}`, 'err');
  }
}

// Exposed for inspection and for the CLI/UI parity check.
window.__configurator = { state, preview, reportBytes, exportOverrides, configDigestText };
boot();
