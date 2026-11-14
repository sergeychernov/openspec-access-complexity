// Minimal JSON Schema (2020-12 subset) validator, dependency-free and usable in Node and browsers.
// Supported keywords: type, enum, const, properties, required, additionalProperties, propertyNames,
// items, minItems, maxItems, uniqueItems, minimum, maximum, minLength, maxLength, pattern,
// $ref (local "#/$defs/..."), anyOf, minProperties.
// "integer" means a JS safe integer; all numbers in contracts are integers.

import { canonicalStringify } from './canonical.mjs';

function esc(key) {
  return String(key).replace(/~/g, '~0').replace(/\//g, '~1');
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isSafeInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref ${ref}`);
  let node = root;
  for (const part of ref.slice(2).split('/')) {
    node = node[part.replace(/~1/g, '/').replace(/~0/g, '~')];
    if (node === undefined) throw new Error(`unresolved $ref ${ref}`);
  }
  return node;
}

export function validateSchema(root, value) {
  const errors = [];
  walk(root, root, value, '', errors);
  return errors;
}

function walk(root, schema, value, path, errors) {
  if (schema === true) return;
  if (schema.$ref) {
    walk(root, resolveRef(root, schema.$ref), value, path, errors);
    return;
  }
  if (schema.anyOf) {
    const ok = schema.anyOf.some((s) => {
      const e = [];
      walk(root, s, value, path, e);
      return e.length === 0;
    });
    if (!ok) {
      // report the errors of the branch whose type matches, if any
      let best = null;
      for (const s of schema.anyOf) {
        const e = [];
        walk(root, s, value, path, e);
        if (!best || e.length < best.length) best = e;
      }
      errors.push(...(best || [{ path: path || '/', message: 'does not match any allowed form' }]));
    }
    return;
  }
  const t = typeOf(value);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = types.some((ty) => ty === t || (ty === 'number' && t === 'integer'));
    if (!ok) {
      errors.push({ path: path || '/', message: `expected ${types.join('|')}, got ${t}` });
      return;
    }
  }
  if (schema.const !== undefined && canonicalStringify(schema.const) !== canonicalStringify(value)) {
    errors.push({ path: path || '/', message: `must equal ${JSON.stringify(schema.const)}` });
  }
  if (schema.enum && !schema.enum.some((e) => e === value)) {
    errors.push({ path: path || '/', message: `must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}` });
  }
  if (t === 'integer' || t === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path: path || '/', message: `must be >= ${schema.minimum}` });
    if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path: path || '/', message: `must be <= ${schema.maximum}` });
  }
  if (t === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push({ path: path || '/', message: `must have length >= ${schema.minLength}` });
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push({ path: path || '/', message: `must have length <= ${schema.maxLength}` });
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push({ path: path || '/', message: `must match pattern ${schema.pattern}` });
  }
  if (t === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push({ path: path || '/', message: `must have at least ${schema.minItems} items` });
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push({ path: path || '/', message: `must have at most ${schema.maxItems} items` });
    if (schema.uniqueItems) {
      const seen = new Set();
      value.forEach((item, i) => {
        const k = canonicalStringify(item);
        if (seen.has(k)) errors.push({ path: `${path}/${i}`, message: 'duplicate item' });
        seen.add(k);
      });
    }
    if (schema.items) value.forEach((item, i) => walk(root, schema.items, item, `${path}/${i}`, errors));
  }
  if (t === 'object') {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) errors.push({ path: path || '/', message: `must have at least ${schema.minProperties} properties` });
    for (const req of schema.required || []) {
      if (!(req in value)) errors.push({ path: `${path}/${esc(req)}`, message: 'is required' });
    }
    const props = schema.properties || {};
    for (const key of keys) {
      const p = `${path}/${esc(key)}`;
      if (schema.propertyNames) {
        const e = [];
        walk(root, schema.propertyNames, key, p, e);
        if (e.length) { errors.push({ path: p, message: `unknown or invalid key "${key}"` }); continue; }
      }
      if (key in props) {
        walk(root, props[key], value[key], p, errors);
      } else if (schema.additionalProperties === false) {
        errors.push({ path: p, message: `unknown field "${key}"` });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        walk(root, schema.additionalProperties, value[key], p, errors);
      }
    }
  }
}

export class ValidationError extends Error {
  constructor(label, errors) {
    const lines = errors.map((e) => `  ${e.path}: ${e.message}`).join('\n');
    super(`${label} is invalid:\n${lines}`);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}
