#!/usr/bin/env node
// Writes schemas/*.schema.json from src/core/schemas.mjs. --check fails if files are stale.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  profileSchema, configSchema, overridesSchema, benchmarksSchema, manifestSchema, latestSchema, reportSchema,
} from '../src/core/schemas.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'schemas');
const files = {
  'profile-1.schema.json': profileSchema,
  'config-1.schema.json': configSchema,
  'overrides-1.schema.json': overridesSchema,
  'benchmarks-1.schema.json': benchmarksSchema,
  'manifest-1.schema.json': manifestSchema,
  'latest-1.schema.json': latestSchema,
  'report-1.schema.json': reportSchema,
};
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
if (check && stale) process.exit(1);
console.log(check ? 'schemas are up to date' : `wrote ${Object.keys(files).length} schemas to ${dir}`);
