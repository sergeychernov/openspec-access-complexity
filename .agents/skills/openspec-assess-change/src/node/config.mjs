// Loading shipped defaults, benchmark snapshot and explicit user overrides.
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from '../core/config-merge.mjs';
import { readJsonFile, canonicalDigest } from './fsio.mjs';

export const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULTS_PATH = join(PACKAGE_ROOT, 'config', 'defaults.json');
export const BENCHMARKS_PATH = join(PACKAGE_ROOT, 'config', 'benchmarks.json');
export const LEGACY_DEFAULTS_V1_PATH = join(PACKAGE_ROOT, 'config', 'legacy', 'defaults-v1.json');
export const LEGACY_DEFAULTS_V2_PATH = join(PACKAGE_ROOT, 'config', 'legacy', 'defaults-v2.json');

// Base config precedence: explicit --defaults file, else <changeRoot>/assessment/config.json (e.g. the
// output of migrate-config), else the shipped config/defaults.json.
export function defaultsPathFor({ defaultsPath = null, changeRoot = null } = {}) {
  if (defaultsPath) return { path: defaultsPath, label: 'custom base config' };
  if (changeRoot) {
    const p = join(changeRoot, 'assessment', 'config.json');
    if (existsSync(p)) return { path: p, label: 'assessment/config.json' };
  }
  return { path: DEFAULTS_PATH, label: 'config/defaults.json' };
}

// Overrides precedence: explicit --overrides file, else <changeRoot>/assessment/overrides.json when present.
export function overridesPathFor({ overridesPath = null, changeRoot = null } = {}) {
  if (overridesPath) return overridesPath;
  if (changeRoot) {
    const p = join(changeRoot, 'assessment', 'overrides.json');
    if (existsSync(p)) return p;
  }
  return null;
}

export function loadEffectiveConfig({
  overridesPath = null, defaultsPath = DEFAULTS_PATH, defaultsLabel = 'config/defaults.json', benchmarksPath = BENCHMARKS_PATH,
} = {}) {
  const defaults = readJsonFile(defaultsPath, defaultsLabel);
  const overrides = overridesPath ? readJsonFile(overridesPath, 'overrides') : null;
  const benchmarks = readJsonFile(benchmarksPath, 'config/benchmarks.json');
  const effective = mergeConfig(defaults, overrides, { defaultsLabel });
  return {
    defaults,
    overrides,
    benchmarks,
    effective,
    digests: {
      defaults: canonicalDigest(defaults),
      overrides: overrides ? canonicalDigest(overrides) : null,
      effective: canonicalDigest(effective),
    },
  };
}
