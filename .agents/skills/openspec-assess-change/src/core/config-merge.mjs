// Effective configuration = shipped defaults ← explicit user overrides (config/overrides schema 2).
// Rules: objects merge by known schema keys; arrays of entries with "id" merge by id
// (new ids are appended); other arrays and scalars replace. Absent keys inherit; explicit
// 0, false and null are values. Unknown keys are errors, never ignored.
// Estimate records (quality[phase][effort][factor], resource tables) are merged per record: a partial
// override of one record inherits only that same defaults record — never another effort or phase.
import { configSchema } from './schemas.mjs';
import { clone, canonicalStringify } from './canonical.mjs';
import { structuralErrors, configErrors, assertValid } from './validate.mjs';
import { ValidationError } from './jsonschema.mjs';

function deref(node) {
  let refName = null;
  while (node && node.$ref) {
    refName = node.$ref;
    node = node.$ref.slice(2).split('/').reduce((n, p) => n[p], configSchema);
  }
  return { node, refName };
}

function objectBranch(node) {
  if (node.type === 'object') return node;
  if (node.anyOf) {
    for (const b of node.anyOf) {
      const { node: n } = deref(b);
      if (n.type === 'object') return n;
    }
  }
  return null;
}

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esc = (k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');

function mergeNode(schemaNode, base, over, path, ctx) {
  const { node, refName } = deref(schemaNode);
  if (isPlain(over)) {
    const obj = objectBranch(node);
    if (!obj) {
      ctx.errors.push({ path: path || '/', message: 'object given where a scalar or array is expected' });
      return base;
    }
    if (RECORD_REFS.has(refName)) return mergeRecord(obj, base, over, path, ctx);
    const result = isPlain(base) ? { ...base } : {};
    for (const key of Object.keys(over)) {
      const p = `${path}/${esc(key)}`;
      if (key === 'id' && isPlain(base) && base.id === over.id) continue;
      let child;
      if (obj.propertyNames && obj.propertyNames.enum && !obj.propertyNames.enum.includes(key)) {
        ctx.errors.push({ path: p, message: `unknown key "${key}"` });
        continue;
      }
      if (obj.properties && key in obj.properties) child = obj.properties[key];
      else if (obj.additionalProperties && typeof obj.additionalProperties === 'object') child = obj.additionalProperties;
      else { ctx.errors.push({ path: p, message: `unknown key "${key}"` }); continue; }
      result[key] = mergeNode(child, isPlain(base) ? base[key] : undefined, over[key], p, ctx);
    }
    return result;
  }
  if (Array.isArray(over) && Array.isArray(base) && node.type === 'array' && node.items) {
    const { node: itemNode } = deref(node.items);
    if (itemNode.type === 'object' && itemNode.properties && itemNode.properties.id) {
      const result = base.map((x) => x);
      for (const [i, item] of over.entries()) {
        if (!isPlain(item) || typeof item.id !== 'string') {
          ctx.errors.push({ path: `${path}/${i}/id`, message: 'override entries in this list are matched by "id"' });
          continue;
        }
        const idx = result.findIndex((x) => x.id === item.id);
        if (idx >= 0) result[idx] = mergeNode(node.items, result[idx], item, `${path}/${idx}`, ctx);
        else {
          result.push(clone(item));
          ctx.paths.push(`${path}/${result.length - 1}`);
        }
      }
      return result;
    }
  }
  ctx.paths.push(path || '/');
  return clone(over);
}

const RECORD_REFS = new Set(['#/$defs/qualityRecord', '#/$defs/resourceRecord']);
const PROVENANCE_KEYS = ['sources', 'support', 'inheritedFrom', 'migratedFrom'];

// The record that a user change replaces: without its own origin (the earliest original is kept).
function originOf(base) {
  if (!isPlain(base)) return undefined;
  if (base.origin) return clone(base.origin);
  const o = clone(base);
  delete o.origin;
  return o;
}

// A record override either replaces the record completely (it states "status": e.g. an exported
// record) or sets a value: { value: n } → user-override, { value: null } → explicit unknown. In both
// value-only cases the previous record is kept separately as `origin` with its identity and sources.
function mergeRecord(obj, base, over, path, ctx) {
  for (const key of Object.keys(over)) {
    if (!(key in obj.properties)) ctx.errors.push({ path: `${path}/${esc(key)}`, message: `unknown key "${key}"` });
  }
  let result;
  if ('status' in over) {
    result = clone(over);
  } else if ('value' in over) {
    const origin = originOf(base);
    result = {
      value: over.value,
      status: over.value === null ? 'unknown' : 'user-override',
      basis: over.basis || (over.value === null ? 'set to unknown by the user (no data)' : 'user override'),
    };
    if (origin) result.origin = origin;
    for (const k of PROVENANCE_KEYS) if (k in over) result[k] = clone(over[k]);
  } else {
    result = isPlain(base) ? { ...base } : {};
    for (const key of Object.keys(over)) if (key in obj.properties) result[key] = clone(over[key]);
  }
  ctx.paths.push(path);
  ctx.touchedRecords.add(path);
  return result;
}

// When an override changes modelId or harness of a catalog entry, records carried over from the
// previous candidate keep their original identity in `inheritedFrom`. A heuristic stays heuristic;
// proxy stays proxy (its mapping is unchanged); a measurement of the old version becomes proxy — it is
// never attributed to the new version as measured. User-touched records are left as the user set them.
function markInherited(effective, defaults, ctx) {
  effective.models.forEach((m, i) => {
    const orig = defaults.models.find((d) => d.id === m.id);
    if (!orig || (orig.modelId === m.modelId && orig.harness === m.harness)) return;
    const mark = (rec, p) => {
      if (!rec || ctx.touchedRecords.has(p) || rec.status === 'user-override' || rec.status === 'unknown') return rec;
      const inheritedFrom = rec.inheritedFrom || { modelId: orig.modelId, harness: orig.harness, status: rec.status };
      const status = rec.status === 'measured' ? 'proxy' : rec.status;
      const basis = rec.status === 'measured' ? `${rec.basis} (measured for ${orig.harness}/${orig.modelId}; carried to ${m.harness}/${m.modelId} as proxy)` : rec.basis;
      return { ...rec, status, basis, inheritedFrom };
    };
    for (const phase of ['apply', 'verify']) {
      for (const [effort, row] of Object.entries(m.quality[phase] || {})) {
        for (const f of Object.keys(row)) row[f] = mark(row[f], `/models/${i}/quality/${phase}/${effort}/${f}`);
      }
      for (const [name, table] of [['api/usage', m.resources.api.usage], ['subscription/load', m.resources.subscription.load], ['time/minutes', m.resources.time.minutes]]) {
        for (const e of Object.keys(table[phase] || {})) table[phase][e] = mark(table[phase][e], `/models/${i}/resources/${name}/${phase}/${e}`);
      }
    }
    if (!ctx.paths.some((p) => p.startsWith(`/models/${i}/identity`))) {
      m.identity = { ...m.identity, status: 'unconfirmed', note: `modelId/harness changed from ${orig.harness}/${orig.modelId}; identity not re-verified` };
    }
    if (!ctx.paths.some((p) => p.startsWith(`/models/${i}/clientModelId`)) && orig.modelId !== m.modelId) {
      m.clientModelId = null;
    }
  });
}

export function mergeConfig(defaults, overrides = null, { defaultsLabel = 'config/defaults.json' } = {}) {
  assertValid('defaults', configErrors(defaults));
  const effective = clone(defaults);
  delete effective.provenance;
  const ctx = { errors: [], paths: [], touchedRecords: new Set() };
  let merged = effective;
  if (overrides !== null) {
    assertValid('overrides', structuralErrors('overrides', overrides));
    const set = overrides.set;
    for (const k of ['kind', 'schemaVersion', 'provenance']) {
      if (k in set) ctx.errors.push({ path: `/${k}`, message: `"${k}" cannot be overridden` });
    }
    const filtered = Object.fromEntries(Object.entries(set).filter(([k]) => !['kind', 'schemaVersion', 'provenance'].includes(k)));
    merged = mergeNode(configSchema, effective, filtered, '', ctx);
    if (ctx.errors.length) throw new ValidationError('overrides', ctx.errors.map((e) => ({ path: `/set${e.path}`, message: e.message })));
    markInherited(merged, defaults, ctx);
  }
  merged.provenance = { defaults: defaultsLabel, overridePaths: [...new Set(ctx.paths)].sort() };
  assertValid('effective config', configErrors(merged));
  return merged;
}

// Builds an overrides document that turns `defaults` into `edited` (used by the configurator export).
export function diffToOverrides(defaults, edited, note) {
  const set = diffNode(configSchema, defaults, edited);
  return { kind: 'openspec-assess.overrides', schemaVersion: 3, ...(note ? { note } : {}), set: set || {} };
}

function diffNode(schemaNode, a, b) {
  if (canonicalStringify(a === undefined ? null : a) === canonicalStringify(b === undefined ? null : b) && a !== undefined) return undefined;
  const { node, refName } = deref(schemaNode);
  if (isPlain(a) && isPlain(b) && !RECORD_REFS.has(refName)) {
    const obj = objectBranch(node);
    if (obj) {
      const out = {};
      for (const key of Object.keys(b)) {
        if (key === 'provenance') continue;
        const child = (obj.properties && obj.properties[key]) || (typeof obj.additionalProperties === 'object' ? obj.additionalProperties : true);
        const d = child === true ? (canonicalStringify(a[key] ?? null) === canonicalStringify(b[key]) && key in a ? undefined : b[key]) : diffNode(child, a[key], b[key]);
        if (d !== undefined) out[key] = d;
      }
      return Object.keys(out).length ? out : undefined;
    }
  }
  if (Array.isArray(a) && Array.isArray(b) && node.type === 'array' && node.items) {
    const { node: itemNode } = deref(node.items);
    if (itemNode.type === 'object' && itemNode.properties && itemNode.properties.id) {
      const out = [];
      for (const item of b) {
        const prev = a.find((x) => x.id === item.id);
        if (!prev) { out.push(item); continue; }
        const d = diffNode(node.items, prev, item);
        if (d !== undefined) out.push({ id: item.id, ...d });
      }
      return out.length ? out : undefined;
    }
  }
  if (RECORD_REFS.has(refName) && isPlain(a) && isPlain(b)) {
    return canonicalStringify(a) === canonicalStringify(b) ? undefined : clone(b);
  }
  return clone(b);
}
