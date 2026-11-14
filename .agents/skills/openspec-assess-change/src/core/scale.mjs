// Display scale for model quality estimates and the thresholds compared with them.
// Stored: integer basis points 0–10000. Shown: 0–100 with at most two decimals, no trailing zeros,
// no percent sign (8200 → "82", 8201 → "82.01"). The profile's complexity levels (0–4) are a
// different scale and are never converted. Ranking always uses the stored integers.

export const SCORE_LABEL = 'Оценка модели · 0–100';

export function formatScore(bp) {
  if (bp === null || bp === undefined) return null;
  if (!Number.isSafeInteger(bp) || bp < 0 || bp > 10000) throw new RangeError(`score must be an integer 0..10000 bp, got ${bp}`);
  const whole = Math.floor(bp / 100);
  const frac = bp % 100;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

// Exact parser: "82" → 8200, "82.01" → 8201, "82.1" → 8210. Rejects more than two decimals, values
// outside 0–100, signs, exponents, separators other than ".", empty input and leading zeros.
export function parseScore(text) {
  const t = String(text).trim();
  if (t === '') return { ok: false, error: 'empty: use "Нет данных" for an unknown estimate' };
  const m = /^(0|[1-9][0-9]{0,2})(?:\.([0-9]{1,2}))?$/.exec(t);
  if (!m) {
    if (/^-?[0-9]+(\.[0-9]+)?$/.test(t) && /\.[0-9]{3,}$/.test(t)) return { ok: false, error: `"${t}" has more than two decimals; it is not rounded` };
    return { ok: false, error: `"${t}" is not a number from 0 to 100 with at most two decimals` };
  }
  const bp = Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0);
  if (bp > 10000) return { ok: false, error: `"${t}" is above 100` };
  return { ok: true, bp };
}

export const PROVENANCE_LETTERS = {
  proxy: { letter: 'p', label: 'proxy', ru: 'Оценка через косвенные данные с явным mapping' },
  heuristic: { letter: 'h', label: 'heuristic', ru: 'Эвристическая оценка' },
  'user-override': { letter: 'o', label: 'user-override', ru: 'Пользовательское значение' },
  unknown: { letter: 'u', label: 'unknown', ru: 'Нет данных' },
  measured: { letter: 'm', label: 'measured', ru: 'Сопоставимое измерение' },
};
