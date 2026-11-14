// Canonical JSON serialization.
// Rules (normalization rules v1):
// - Only plain objects, arrays, strings, booleans, null and safe integers are allowed.
//   Non-integer numbers, NaN, Infinity, -0, undefined, functions, symbols and BigInt are rejected.
// - Object keys are sorted by UTF-16 code units (Array.prototype.sort default), never localeCompare.
// - Compact form has no whitespace; pretty form uses two-space indentation and "\n" line endings.
// - Output never depends on host locale, insertion order of keys or platform.

export class CanonicalError extends Error {
  constructor(path, message) {
    super(`${path || '/'}: ${message}`);
    this.name = 'CanonicalError';
    this.path = path || '/';
  }
}

export function compareCodeUnits(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function pointerEscape(key) {
  return String(key).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function canonicalize(value, path = '') {
  if (value === null) return null;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new CanonicalError(path, 'non-finite number is not allowed');
    if (!Number.isSafeInteger(value)) throw new CanonicalError(path, 'only safe integers are allowed');
    if (Object.is(value, -0)) return 0;
    return value;
  }
  if (Array.isArray(value)) return value.map((v, i) => canonicalize(v, `${path}/${i}`));
  if (t === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new CanonicalError(path, 'only plain objects are allowed');
    }
    const out = {};
    for (const key of Object.keys(value).sort(compareCodeUnits)) {
      const v = value[key];
      if (v === undefined) throw new CanonicalError(`${path}/${pointerEscape(key)}`, 'undefined is not allowed');
      out[key] = canonicalize(v, `${path}/${pointerEscape(key)}`);
    }
    return out;
  }
  throw new CanonicalError(path, `unsupported value type ${t}`);
}

export function canonicalStringify(value, { pretty = false } = {}) {
  const c = canonicalize(value);
  if (!pretty) return JSON.stringify(c);
  return JSON.stringify(c, null, 2) + '\n';
}

// Parse JSON text and canonicalize; rejects duplicate keys which JSON.parse silently drops.
export function parseJsonStrict(text, label = 'input') {
  detectDuplicateKeys(text, label);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new CanonicalError('/', `${label}: invalid JSON (${e.message})`);
  }
  return canonicalize(parsed);
}

// Minimal JSON tokenizer used only to detect duplicate object keys.
function detectDuplicateKeys(text, label) {
  let i = 0;
  const n = text.length;
  const stack = [];
  const ws = () => { while (i < n && (text[i] === ' ' || text[i] === '\n' || text[i] === '\r' || text[i] === '\t')) i++; };
  const readString = () => {
    let s = '';
    i++; // opening quote
    while (i < n && text[i] !== '"') {
      if (text[i] === '\\') { s += text[i] + text[i + 1]; i += 2; } else { s += text[i]; i++; }
    }
    i++;
    return s;
  };
  while (i < n) {
    ws();
    const ch = text[i];
    if (ch === '{') { stack.push({ type: 'o', keys: new Set(), expectKey: true }); i++; continue; }
    if (ch === '[') { stack.push({ type: 'a' }); i++; continue; }
    if (ch === '}' || ch === ']') { stack.pop(); i++; continue; }
    if (ch === ',') {
      const top = stack[stack.length - 1];
      if (top && top.type === 'o') top.expectKey = true;
      i++; continue;
    }
    if (ch === ':') { i++; continue; }
    if (ch === '"') {
      const top = stack[stack.length - 1];
      const s = readString();
      if (top && top.type === 'o' && top.expectKey) {
        if (top.keys.has(s)) throw new CanonicalError('/', `${label}: duplicate object key "${s}"`);
        top.keys.add(s);
        top.expectKey = false;
      }
      continue;
    }
    i++;
  }
}

export function deepEqual(a, b) {
  return canonicalStringify(a) === canonicalStringify(b);
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
