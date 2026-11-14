#!/usr/bin/env node
// Writes schemas/<type>-<schemaVersion>.schema.json from src/core/schemas.mjs (file names follow
// SCHEMA_VERSIONS and match each schema's $id). --check fails on stale, missing or leftover files.
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  profileSchema, configSchema, overridesSchema, benchmarksSchema, manifestSchema, latestSchema, reportSchema, SCHEMA_VERSIONS,
} from '../src/core/schemas.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'schemas');
const byType = {
  profile: profileSchema,
  config: configSchema,
  overrides: overridesSchema,
  benchmarks: benchmarksSchema,
  manifest: manifestSchema,
  latest: latestSchema,
  report: reportSchema,
};
const files = {};
for (const [type, schema] of Object.entries(byType)) {
  const name = `${type}-${SCHEMA_VERSIONS[type]}.schema.json`;
  if (!schema.$id.endsWith(`/${name}`)) throw new Error(`${type}: $id ${schema.$id} does not match ${name}`);
  files[name] = schema;
}
const check = process.argv.includes('--check');
let stale = 0;
mkdirSync(dir, { recursive: true });
for (const [name, schema] of Object.entries(files)) {
  const text = JSON.stringify(schema, null, 2) + '\n';
  const path = join(dir, name);
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) { console.error(`stale: schemas/${name}`); stale++; }
  } else writeFileSync(path, text);
}
for (const name of readdirSync(dir).filter((n) => n.endsWith('.schema.json') && !(n in files))) {
  if (check) { console.error(`leftover: schemas/${name}`); stale++; } else rmSync(join(dir, name));
}
if (check && stale) process.exit(1);
console.log(check ? 'schemas are up to date' : `wrote ${Object.keys(files).length} schemas to ${dir}`);
