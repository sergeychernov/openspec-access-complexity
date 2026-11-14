// Browser UI for the configurator. All calculation goes through configurator/model.mjs → src/core.
import {
  effectiveFrom, exportOverrides, preview, matrix, allLevels, setEstimate, setEstimateFromText, setResource, resetEstimate, resetResource,
  setPath, setModelField, resetToDefaults, compareReports, parseIntOrNull, reportBytes, provenanceCard, defaultViewEffort,
  parseMultiplier, configDigestText, WEIGHT_LABEL, WEIGHT_HELP, WEIGHT_RELEVANCE_HELP, SCORE_HELP,
  CLEAR_HELP, POLICY_HELP, PENALTY_FIELDS, setResourceFromText, parseRequiredInt, parsePercentBp, setTimePenalty, economicsView,
  WEIGHT_HEADER, weightHelp, allowedSummary, allowedEfforts, toggleAllowedEffort, isMultiplierDraft, nextFieldText, formatMultiplier,
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
  openMenu: null, // model id whose "allowed efforts" multiselect is open (view state)
  menuFocus: null, // effort checkbox to refocus after a re-render
  menuMessage: '',
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

// Floating layers live at <body> level with position: fixed, so neither the table's scroll area nor a
// narrow column can clip or squeeze them; they are re-positioned on scroll/resize and kept on screen.
function placeFloating(panel, anchor, preferredWidth = 300) {
  const margin = 8;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const width = Math.max(160, Math.min(preferredWidth, vw - 2 * margin));
  panel.style.width = `${width}px`;
  const r = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(margin, r.left), vw - width - margin);
  panel.style.left = `${left}px`;
  panel.style.top = '0px';
  const h = panel.offsetHeight;
  let top = r.bottom + 6;
  if (top + h > vh - margin) top = Math.max(margin, r.top - h - 6);
  panel.style.top = `${Math.min(top, Math.max(margin, vh - h - margin))}px`;
}

const tipLayer = { panel: null, anchor: null, pinned: false };

function hideTip() {
  if (tipLayer.panel) tipLayer.panel.hidden = true;
  if (tipLayer.anchor) tipLayer.anchor.setAttribute('aria-expanded', 'false');
  tipLayer.anchor = null;
  tipLayer.pinned = false;
}

function showTip(anchor, text, pinned = false) {
  if (!tipLayer.panel) {
    tipLayer.panel = el('div', { class: 'float-panel float-tip', role: 'tooltip', id: 'float-tip' });
    document.body.append(tipLayer.panel);
  }
  if (tipLayer.anchor && tipLayer.anchor !== anchor) tipLayer.anchor.setAttribute('aria-expanded', 'false');
  tipLayer.panel.textContent = text;
  tipLayer.panel.hidden = false;
  tipLayer.anchor = anchor;
  tipLayer.pinned = pinned;
  anchor.setAttribute('aria-expanded', 'true');
  placeFloating(tipLayer.panel, anchor, 300);
}

// "ⓘ" button: tooltip on hover and keyboard focus, pinned by click/Enter, closed by Escape.
function infoButton(label, text) {
  const id = `tip-${tipSeq += 1}`;
  const btn = el('button', { type: 'button', class: 'info', 'aria-label': `${label}: пояснение`, 'aria-describedby': id, 'aria-expanded': 'false' }, 'ⓘ');
  btn.addEventListener('mouseenter', () => { if (!tipLayer.pinned) showTip(btn, text); });
  btn.addEventListener('mouseleave', () => { if (!tipLayer.pinned && tipLayer.anchor === btn) hideTip(); });
  btn.addEventListener('focus', () => showTip(btn, text, tipLayer.pinned && tipLayer.anchor === btn));
  btn.addEventListener('blur', () => { if (tipLayer.anchor === btn) hideTip(); });
  btn.addEventListener('click', () => {
    if (tipLayer.anchor === btn && tipLayer.pinned) hideTip(); else showTip(btn, text, true);
  });
  return el('span', { class: 'cellwrap' }, btn, el('span', { id, class: 'sr-only', text }));
}

// Multiselect of efforts allowed for recommendations (one per model column).
function effortsMultiselect(m) {
  const summary = allowedSummary(m);
  const open = state.openMenu === m.id;
  const btn = el('button', {
    type: 'button', class: 'ms-button', 'data-ms': m.id, 'aria-haspopup': 'true', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': 'ms-menu',
    'aria-label': `${m.displayName}: разрешены для рекомендаций — ${summary}`, title: summary,
  }, el('span', { class: 'ms-text', text: summary }), el('span', { class: 'ms-caret', 'aria-hidden': 'true', text: '▾' }));
  btn.addEventListener('click', () => {
    if (state.openMenu === m.id) closeMenu(true); else openMenu(m.id);
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.openMenu === m.id) { e.preventDefault(); closeMenu(true); }
    if (e.key === 'ArrowDown' && state.openMenu !== m.id) { e.preventDefault(); openMenu(m.id); }
  });
  btn.addEventListener('focus', () => { btn.title = allowedSummary(state.edited.models.find((x) => x.id === m.id)); });
  return el('div', { class: 'ms' }, el('div', { class: 'muted small', text: 'Разрешены для рекомендаций' }), btn);
}

function openMenu(modelId) {
  state.openMenu = modelId;
  state.menuMessage = '';
  const m = state.edited.models.find((x) => x.id === modelId);
  state.menuFocus = allowedEfforts(m)[0];
  renderMenu();
}

function closeMenu(focusButton) {
  const id = state.openMenu;
  state.openMenu = null;
  state.menuMessage = '';
  renderMenu();
  if (focusButton && id) {
    const btn = document.querySelector(`button.ms-button[data-ms="${id}"]`);
    if (btn) btn.focus();
  }
}

function renderMenu() {
  let panel = $('ms-menu');
  document.querySelectorAll('button.ms-button').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.ms === state.openMenu)));
  if (!state.openMenu) { if (panel) panel.hidden = true; return; }
  if (!panel) {
    panel = el('div', { id: 'ms-menu', class: 'float-panel ms-menu', role: 'group' });
    panel.addEventListener('keydown', (e) => {
      const boxes = [...panel.querySelectorAll('input[type="checkbox"]')];
      const i = boxes.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); } else if (e.key === 'ArrowDown' && boxes.length) { e.preventDefault(); boxes[(i + 1) % boxes.length].focus(); } else if (e.key === 'ArrowUp' && boxes.length) { e.preventDefault(); boxes[(i - 1 + boxes.length) % boxes.length].focus(); }
    });
    document.body.append(panel);
  }
  const m = state.edited.models.find((x) => x.id === state.openMenu);
  const allowed = new Set(allowedEfforts(m));
  panel.setAttribute('aria-label', `${m.displayName}: efforts, разрешённые для рекомендаций`);
  const alert = el('div', { class: 'err-inline ms-alert', role: 'alert', text: state.menuMessage });
  panel.replaceChildren(
    ...m.supportedEfforts.map((e) => {
      const c = el('input', { type: 'checkbox', checked: allowed.has(e), 'data-effort': e, 'aria-label': `${m.displayName}: effort ${e} разрешён для рекомендаций` });
      c.addEventListener('change', () => {
        const r = toggleAllowedEffort(state.edited, m.id, e, c.checked);
        state.menuFocus = e;
        if (!r.ok) {
          c.checked = true;
          state.menuMessage = r.error;
          alert.textContent = r.error;
          setStatus(r.error, 'err');
          return;
        }
        state.menuMessage = '';
        update(r.config);
      });
      return el('label', { class: 'ms-option' }, c, ` ${e}`);
    }),
    alert,
  );
  panel.hidden = false;
  const anchor = document.querySelector(`button.ms-button[data-ms="${m.id}"]`);
  if (anchor) placeFloating(panel, anchor, 190);
  const focusBox = panel.querySelector(`input[data-effort="${state.menuFocus}"]`) || panel.querySelector('input');
  if (focusBox) focusBox.focus();
}

function repositionFloating() {
  if (tipLayer.anchor && tipLayer.panel && !tipLayer.panel.hidden) {
    if (document.body.contains(tipLayer.anchor)) placeFloating(tipLayer.panel, tipLayer.anchor, 300); else hideTip();
  }
  const panel = $('ms-menu');
  if (state.openMenu && panel && !panel.hidden) {
    const anchor = document.querySelector(`button.ms-button[data-ms="${state.openMenu}"]`);
    if (anchor) placeFloating(panel, anchor, 190);
  }
}

// Resource multiplier field: plain number, "." or "," as one decimal separator. Invalid characters
// are blocked while typing; an invalid paste is rejected as a whole (no character is dropped).
function multiplierInput({ value, label, onCommit }) {
  const input = el('input', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off', value: value === null ? '' : formatMultiplier(value), placeholder: 'Нет данных',
    'aria-label': label, 'aria-description': `${CLEAR_HELP} Число от 0 до 100, до четырёх знаков после точки или запятой.`, title: CLEAR_HELP, style: 'width:64px',
  });
  const err = el('span', { class: 'err-inline', role: 'alert' });
  const reject = (msg) => { err.textContent = msg; };
  input.addEventListener('beforeinput', (e) => {
    if (!e.inputType || !e.inputType.startsWith('insert')) return;
    const data = e.data ?? (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
    if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') return; // handled by paste/drop below
    const next = nextFieldText(input.value, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, data);
    if (!isMultiplierDraft(next)) { e.preventDefault(); reject(`«${data}» нельзя ввести: только цифры и один разделитель (точка или запятая)`); } else err.textContent = '';
  });
  let pendingCommit = false; // set when text was inserted programmatically (no native "change")
  input.addEventListener('paste', (e) => {
    const raw = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    const data = raw.trim();
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = nextFieldText(input.value, start, end, data);
    if (!isMultiplierDraft(next)) { e.preventDefault(); reject(`Вставка «${raw}» отклонена целиком: только цифры и один разделитель`); return; }
    err.textContent = '';
    if (data === raw) return; // a valid paste is inserted by the browser as usual
    e.preventDefault(); // surrounding whitespace is trimmed: insert the cleaned text ourselves
    input.setRangeText(data, start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    pendingCommit = true;
  });
  input.addEventListener('drop', (e) => {
    const data = (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '').trim();
    if (!isMultiplierDraft(nextFieldText(input.value, input.selectionStart ?? 0, input.selectionEnd ?? 0, data))) { e.preventDefault(); reject('Перетаскивание отклонено: только цифры и один разделитель'); }
  });
  const commit = () => {
    pendingCommit = false;
    const r = onCommit(input.value);
    if (!r.ok) { reject(r.error); setStatus('Ввод отклонён: значение не изменено', 'err'); input.setAttribute('aria-invalid', 'true'); }
  };
  input.addEventListener('change', commit);
  input.addEventListener('blur', () => { if (pendingCommit) commit(); });
  return { input, err };
}

// ------------------------------------------------------------------ matrix
function renderMatrix() {
  const cfg = state.edited;
  const phase = state.phase;
  const rows = matrix(cfg, phase, state.view);
  const startRows = matrix(state.start, phase, state.view);
  const head = el('tr', {},
    el('th', { text: 'Параметр' }),
    el('th', { class: 'weight-col', scope: 'col' }, WEIGHT_HEADER, ' ', infoButton(WEIGHT_LABEL[phase], weightHelp(phase))),
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
        effortsMultiselect(m),
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
      const { input, err } = multiplierInput({
        value: c.value,
        label: `${row.label} (${row.unit}) — ${describe}`,
        onCommit: (text) => {
          const r = setResourceFromText(state.edited, m.id, row.kind, phase, c.effort, text);
          if (r.ok) update(r.config);
          return r;
        },
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
  const valueText = rec.value === null ? 'Нет данных' : (where.kind === 'quality' ? `${formatScore(rec.value)} (0–100; ${rec.value} bp)` : `множитель ${formatMultiplier(rec.value)} (${rec.value} bp)`);
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
    ...(card.origin ? [el('h3', { text: 'Исходная запись (до изменения пользователем)' }), el('p', { text: `${card.origin.value === null ? 'Нет данных' : (where.kind === 'quality' ? formatScore(card.origin.value) : `множитель ${formatMultiplier(card.origin.value)}`)} — ${card.origin.status}: ${card.origin.basis}` }),
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
  hideTip();
  renderMatrix();
  renderLevels();
  renderResources();
  renderPreview();
  renderMenu();
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
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tipLayer.anchor) hideTip(); });
  document.addEventListener('pointerdown', (e) => {
    const t = e.target;
    if (tipLayer.pinned && tipLayer.anchor && !tipLayer.anchor.contains(t) && !(tipLayer.panel && tipLayer.panel.contains(t))) hideTip();
    if (state.openMenu && !t.closest('#ms-menu') && !(t.closest('button.ms-button') && t.closest('button.ms-button').dataset.ms === state.openMenu)) closeMenu(false);
  }, true);
  window.addEventListener('resize', repositionFloating);
  document.addEventListener('scroll', repositionFloating, true);
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
