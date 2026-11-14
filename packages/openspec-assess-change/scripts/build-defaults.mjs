#!/usr/bin/env node
// Generates config/defaults.json from the compact, documented heuristic tables below.
// Run: node scripts/build-defaults.mjs [--check]
// Config schema 2: every model has an explicit record for each phase × supported effort × factor
// (quality) and for each phase × supported effort (API usage, subscription load, time). There is no
// shared effort delta; the per-model tables below are written out per model. Every number here is a
// documented prior (status "heuristic"); benchmark records that only support the ordering are listed
// under "support", never under "sources". See references/catalog.md for the rationale.
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { canonicalStringify } from '../src/core/canonical.mjs';
import { FACTOR_IDS } from '../src/core/factors.mjs';
import { RESOURCE_UNITS } from '../src/core/schemas.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'config', 'defaults.json');
const CHECKED = '2026-11-14';

// ---------------------------------------------------------------------------- quality priors
// Factor prior: lower tiers lose more on factors that need deep reasoning (applied per model below).
const DEEP = ['architecture', 'logic', 'consequences', 'uncertainty'];
const DEEP_PENALTY = { frontier: 0, strong: 200, balanced: 400, economy: 600 };

// ---------------------------------------------------------------------------- catalog
// Identity data checked on CHECKED against the primary pages in catalog.sources:
// - OpenAI API models + Codex models pages: model IDs, API reasoning efforts, 1.05M context.
//   Codex shows its own level names (Light/Low … Max, Ultra) without a per-model list; the catalog keeps
//   the API-documented values from low to max and leaves out "none" and the Codex-only "ultra".
// - Claude models overview + Claude Code model configuration: IDs, efforts low..max, 1M context.
// - Antigravity models page: efforts (Extra = CLI "xhigh"); client identifiers are not published
//   (the page refers to `agy models`), so clientModelId stays null and identity "unconfirmed".
const OAI_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const OAI_NOTE = 'Model ID and API reasoning efforts confirmed on the OpenAI models page; Codex availability on the Codex models page. "none" and the Codex-only "ultra" level are not included (no per-model Codex list).';
const CLAUDE_NOTE = 'API ID confirmed on the Claude models overview; efforts low..max and 1M context on the Claude Code model configuration page.';
const AG_NOTE = 'Efforts confirmed on the Antigravity models page. The client identifier is not published there (see `agy models`); modelId is a catalog key, not a client ID, and is not synthesized into clientModelId.';
const MODELS = [
  { id: 'codex.astra', family: 'Astra', displayName: 'GPT-6 Astra', modelId: 'gpt-6-astra', harness: 'codex', clientModelId: 'gpt-6-astra', tier: 'frontier', efforts: OAI_EFFORTS, pool: 'codex-plan', src: ['openai-models', 'codex-models'], ctx: 1050000, status: 'confirmed', note: OAI_NOTE },
  { id: 'codex.sol', family: 'Sol', displayName: 'GPT-6.1 Sol', modelId: 'gpt-6.1-sol', harness: 'codex', clientModelId: 'gpt-6.1-sol', tier: 'strong', efforts: OAI_EFFORTS, pool: 'codex-plan', src: ['openai-models', 'codex-models'], ctx: 1050000, status: 'confirmed', note: OAI_NOTE },
  { id: 'codex.terra', family: 'Terra', displayName: 'GPT-6.1 Terra', modelId: 'gpt-6.1-terra', harness: 'codex', clientModelId: 'gpt-6.1-terra', tier: 'balanced', efforts: OAI_EFFORTS, pool: 'codex-plan', src: ['openai-models', 'codex-models'], ctx: 1050000, status: 'confirmed', note: `${OAI_NOTE} Requires Codex CLI 0.159.0 or later; not listed for the IDE extension.` },
  { id: 'codex.luna', family: 'Luna', displayName: 'GPT-6 Luna', modelId: 'gpt-6-luna', harness: 'codex', clientModelId: 'gpt-6-luna', tier: 'economy', efforts: OAI_EFFORTS, pool: 'codex-plan', src: ['openai-models', 'codex-models'], ctx: 1050000, status: 'confirmed', note: `${OAI_NOTE} Enterprise/Edu administrators must enable Luna first.` },
  { id: 'claude-code.opus', family: 'Opus', displayName: 'Claude Opus 5.5', modelId: 'claude-opus-5-5', harness: 'claude-code', clientModelId: 'claude-opus-5-5', tier: 'frontier', efforts: CLAUDE_EFFORTS, pool: 'claude-plan', src: ['claude-models', 'claude-code-models'], ctx: 1000000, status: 'confirmed', note: CLAUDE_NOTE },
  { id: 'claude-code.sonnet', family: 'Sonnet', displayName: 'Claude Sonnet 5.5', modelId: 'claude-sonnet-5-5', harness: 'claude-code', clientModelId: 'claude-sonnet-5-5', tier: 'strong', efforts: CLAUDE_EFFORTS, pool: 'claude-plan', src: ['claude-models', 'claude-code-models'], ctx: 1000000, status: 'confirmed', note: CLAUDE_NOTE },
  { id: 'claude-code.haiku', family: 'Haiku', displayName: 'Claude Haiku 5.5', modelId: 'claude-haiku-5-5', harness: 'claude-code', clientModelId: 'claude-haiku-5-5', tier: 'economy', efforts: CLAUDE_EFFORTS, pool: 'claude-plan', src: ['claude-models', 'claude-code-models'], ctx: 1000000, status: 'confirmed', note: CLAUDE_NOTE },
  { id: 'antigravity.argon', family: 'Argon', displayName: 'Gemini 4 Argon', modelId: 'gemini-4-argon', harness: 'antigravity', clientModelId: null, tier: 'frontier', efforts: ['low', 'medium', 'high'], pool: 'antigravity-gemini', src: ['antigravity-models'], ctx: null, status: 'unconfirmed', note: `${AG_NOTE} Requires a paid Google AI Pro plan or an eligible trial.` },
  { id: 'antigravity.hydrogen', family: 'Hydrogen', displayName: 'Gemini 4 Hydrogen', modelId: 'gemini-4-hydrogen', harness: 'antigravity', clientModelId: null, tier: 'strong', efforts: ['low', 'medium', 'high', 'xhigh'], pool: 'antigravity-gemini', src: ['antigravity-models'], ctx: null, status: 'unconfirmed', note: `${AG_NOTE} "Extra" is "xhigh" in the CLI (example: --model gemini-4-hydrogen-xhigh).` },
  { id: 'antigravity.flash', family: 'Flash', displayName: 'Gemini 3.8 Flash', modelId: 'gemini-3.8-flash', harness: 'antigravity', clientModelId: null, tier: 'economy', efforts: ['low', 'medium', 'high'], pool: 'antigravity-gemini', src: ['antigravity-models'], ctx: null, status: 'unconfirmed', note: AG_NOTE },
];

// Per-model quality priors on the 0–100 scale for non-deep factors, per phase and effort (deep factors
// subtract the tier's DEEP_PENALTY). Written per model; equal values across efforts are intended where
// no gain is assumed (economy models plateau above xhigh). Verify sits below apply because no
// comparable independent verify measurement exists.
const QUALITY = {
  'codex.astra': { apply: { low: 74, medium: 82, high: 85, xhigh: 87, max: 88 }, verify: { low: 72, medium: 80, high: 83, xhigh: 85, max: 86 } },
  'codex.sol': { apply: { low: 68, medium: 76, high: 79, xhigh: 81, max: 82 }, verify: { low: 64, medium: 72, high: 75, xhigh: 77, max: 78 } },
  'codex.terra': { apply: { low: 60, medium: 68, high: 71, xhigh: 73, max: 74 }, verify: { low: 56, medium: 64, high: 67, xhigh: 69, max: 70 } },
  'codex.luna': { apply: { low: 50, medium: 58, high: 61, xhigh: 63, max: 63 }, verify: { low: 46, medium: 54, high: 57, xhigh: 59, max: 59 } },
  'claude-code.opus': { apply: { low: 74, medium: 82, high: 85, xhigh: 87, max: 88 }, verify: { low: 72, medium: 80, high: 83, xhigh: 85, max: 86 } },
  'claude-code.sonnet': { apply: { low: 68, medium: 76, high: 79, xhigh: 81, max: 82 }, verify: { low: 64, medium: 72, high: 75, xhigh: 77, max: 78 } },
  'claude-code.haiku': { apply: { low: 50, medium: 58, high: 61, xhigh: 63, max: 63 }, verify: { low: 46, medium: 54, high: 57, xhigh: 59, max: 59 } },
  'antigravity.argon': { apply: { low: 74, medium: 82, high: 85 }, verify: { low: 72, medium: 80, high: 83 } },
  'antigravity.hydrogen': { apply: { low: 68, medium: 76, high: 79, xhigh: 81 }, verify: { low: 64, medium: 72, high: 75, xhigh: 77 } },
  'antigravity.flash': { apply: { low: 50, medium: 58, high: 61 }, verify: { low: 46, medium: 54, high: 57 } },
};

// Per-model resource priors, 10000 = 1.0× of the category workload (tokens, relative plan load,
// minutes); the same table is used for apply and verify (the workloads differ by phase).
// No per-model usage measurements are available, so models of one tier carry the same prior.
const RES = {
  frontier: { usage: { low: 6000, medium: 10000, high: 15000, xhigh: 22000, max: 30000 }, load: { low: 12000, medium: 20000, high: 30000, xhigh: 44000, max: 60000 }, minutes: { low: 7800, medium: 13000, high: 19500, xhigh: 28600, max: 39000 } },
  strong: { usage: { low: 6000, medium: 10000, high: 15000, xhigh: 22000, max: 30000 }, load: { low: 6000, medium: 10000, high: 15000, xhigh: 22000, max: 30000 }, minutes: { low: 6000, medium: 10000, high: 15000, xhigh: 22000, max: 30000 } },
  balanced: { usage: { low: 6000, medium: 10000, high: 15000, xhigh: 22000, max: 30000 }, load: { low: 4200, medium: 7000, high: 10500, xhigh: 15400, max: 21000 }, minutes: { low: 4200, medium: 7000, high: 10500, xhigh: 15400, max: 21000 } },
  economy: { usage: { low: 6000, medium: 10000, high: 15000, xhigh: 22000, max: 30000 }, load: { low: 2400, medium: 4000, high: 6000, xhigh: 8800, max: 12000 }, minutes: { low: 3000, medium: 5000, high: 7500, xhigh: 11000, max: 15000 } },
};
const RESOURCES = Object.fromEntries(MODELS.map((m) => {
  const t = RES[m.tier];
  const pick = (k) => Object.fromEntries(m.efforts.map((e) => [e, t[k][e]]));
  return [m.id, { usage: pick('usage'), load: pick('load'), minutes: pick('minutes') }];
}));

// API prices in micros of USD per 1M tokens, checked on CHECKED. Cache write = shortest-lived write
// (OpenAI 30m, Anthropic 5m). Reasoning/thinking tokens are billed as output tokens (vendor convention;
// the pricing pages checked do not list a separate reasoning rate).
const usd = (x) => Math.round(x * 1000000);
const OAI_SRC = { url: 'https://developers.openai.com/api/docs/pricing', checkedAt: CHECKED };
const CLAUDE_SRC = { url: 'https://platform.claude.com/docs/en/about-claude/pricing', checkedAt: CHECKED };
const r = (i, cr, cw, o) => ({ uncachedInput: usd(i), cacheRead: usd(cr), cacheWrite: usd(cw), output: usd(o), reasoning: null });
const PRICES = {
  'codex.astra': { source: OAI_SRC, rates: r(10, 1, 12.5, 50), longContext: { thresholdTokens: 272000, rates: r(20, 2, 25, 75) } },
  'codex.sol': { source: OAI_SRC, rates: r(2, 0.1, 2.5, 10), longContext: { thresholdTokens: 272000, rates: r(4, 0.2, 5, 15) } },
  'codex.terra': { source: OAI_SRC, rates: r(1, 0.05, 1.25, 5), longContext: { thresholdTokens: 272000, rates: r(2, 0.1, 2.5, 7.5) } },
  'codex.luna': { source: OAI_SRC, rates: r(0.1, 0.01, 0.125, 0.5), longContext: { thresholdTokens: 272000, rates: r(0.2, 0.02, 0.25, 0.75) } },
  'claude-code.opus': { source: CLAUDE_SRC, rates: r(4, 0.2, 5, 20), longContext: null },
  'claude-code.sonnet': { source: CLAUDE_SRC, rates: r(2, 0.1, 2.5, 10), longContext: null },
  'claude-code.haiku': { source: CLAUDE_SRC, rates: r(0.1, 0.01, 0.125, 0.5), longContext: { thresholdTokens: 100000, rates: r(0.5, 0.05, 0.625, 2.5) } },
};

// Independent index records (config/benchmarks.json): they agree with the tier ordering inside each
// harness, but no number below is derived from them, so they are "support", not "sources".
const INDEX_RECORD = {
  'claude-code.opus': ['aa-cai-2.1.claude-code.opus-5-5.max', 'max', 58],
  'claude-code.sonnet': ['aa-cai-2.1.claude-code.sonnet-5-5.max', 'max', 56],
  'codex.astra': ['aa-cai-2.1.codex.astra.max', 'max', 53],
  'codex.sol': ['aa-cai-2.1.codex.sol.max', 'max', 52],
  'codex.terra': ['aa-cai-2.1.codex.terra.max', 'max', 49],
  'antigravity.argon': ['aa-cai-2.1.antigravity.argon.high', 'high', 45],
};
const SUPPORTED_APPLY_FACTORS = ['volume', 'domains', 'layers', 'architecture', 'logic'];

function qualityTable(m, phase) {
  const out = {};
  const rec = phase === 'apply' ? INDEX_RECORD[m.id] : undefined;
  for (const e of m.efforts) {
    const score = QUALITY[m.id][phase][e];
    out[e] = {};
    for (const f of FACTOR_IDS) {
      const pen = DEEP.includes(f) ? DEEP_PENALTY[m.tier] : 0;
      const entry = {
        value: score * 100 - pen,
        status: 'heuristic',
        basis: `prior for ${m.displayName} ${phase} at effort ${e}: ${score}/100 from the per-model table (tier "${m.tier}")${pen ? `, −${pen / 100} for deep-reasoning factor` : ''}; no comparable independent ${phase} measurement of this factor and effort`,
      };
      if (rec && SUPPORTED_APPLY_FACTORS.includes(f)) {
        entry.support = [rec[0]];
        entry.basis += `; supporting evidence: AA Coding Agent Index v2.1 = ${rec[2]} at effort ${rec[1]} agrees with the tier order inside the harness but does not derive this number`;
      }
      out[e][f] = entry;
    }
  }
  return out;
}

function resourceTable(m, kind, what) {
  const unit = RESOURCE_UNITS[kind];
  const side = Object.fromEntries(m.efforts.map((e) => [e, {
    value: RESOURCES[m.id][kind][e],
    status: 'heuristic',
    basis: `${what} prior for ${m.displayName} at effort ${e}: ×${(RESOURCES[m.id][kind][e] / 10000).toFixed(2)} of the category workload (tier "${m.tier}" table; no per-model ${what} measurement; edit per model)`,
  }]));
  return { unit, apply: side, verify: JSON.parse(JSON.stringify(side)) };
}

const models = MODELS.map((m) => ({
  id: m.id,
  family: m.family,
  displayName: m.displayName,
  modelId: m.modelId,
  harness: m.harness,
  clientModelId: m.clientModelId,
  enabled: true,
  availability: 'unknown',
  supportedEfforts: m.efforts,
  contextWindowTokens: m.ctx,
  capabilities: null,
  identity: { status: m.status, checkedAt: CHECKED, sources: m.src, note: m.note },
  quality: { apply: qualityTable(m, 'apply'), verify: qualityTable(m, 'verify') },
  resources: {
    api: { pricingId: `${m.id}.standard`, usage: resourceTable(m, 'usage', 'API token usage') },
    subscription: { poolId: m.pool, load: resourceTable(m, 'load', 'relative subscription load') },
    time: { minutes: resourceTable(m, 'minutes', 'wall time') },
  },
}));

const unknownRates = { uncachedInput: null, cacheRead: null, cacheWrite: null, output: null, reasoning: null };
const pricing = MODELS.map((m) => {
  const p = PRICES[m.id];
  if (!p) {
    return {
      id: `${m.id}.standard`, status: 'unknown', currency: 'USD', tier: 'standard', rates: unknownRates,
      reasoningBilling: 'as-output', longContext: null, toolCharges: {},
      note: 'No public per-token API price for this model in this harness was found on a primary page; the cost stays unknown (never zero). Fill rates via overrides with a source.',
    };
  }
  return {
    id: `${m.id}.standard`, status: 'confirmed', currency: 'USD', tier: 'standard', source: p.source, rates: p.rates,
    reasoningBilling: 'as-output', longContext: p.longContext, toolCharges: {},
    note: `Standard tier list price, micros per 1M tokens. Cache write = ${m.harness === 'codex' ? '30-minute' : '5-minute'} write rate. Batch, fast mode, regional and priority surcharges are not modelled.${p.longContext ? ` Prompts above ${p.longContext.thresholdTokens} input tokens use the long-context rates.` : ''}`,
  };
});

// ---------------------------------------------------------------------------- workloads
const CATS = [['xs', 2000, 1, 40000], ['s', 4000, 3, 80000], ['m', 6000, 8, 150000], ['l', 8000, 20, 250000], ['xl', 10000, 50, 400000]];
const XS_APPLY = { uncachedInputTokens: 30000, cacheReadTokens: 120000, cacheWriteTokens: 20000, outputTokens: 6000, reasoningTokens: 8000 };
const SCEN = { low: 5000, typical: 10000, high: 25000 };
const PHASE_SCALE = { apply: 10000, verify: 6000 };
const scale = (v, ...bps) => bps.reduce((x, b) => Math.floor(x * b / 10000), v);

function apiWorkload(phase) {
  const out = {};
  for (const [id, , mult, peak] of CATS) {
    out[id] = {};
    for (const [s, sb] of Object.entries(SCEN)) {
      const u = {};
      for (const [k, v] of Object.entries(XS_APPLY)) u[k] = scale(v * mult, sb, PHASE_SCALE[phase]);
      u.peakContextTokens = s === 'high' ? Math.floor(peak * 3 / 2) : peak;
      u.toolCalls = {};
      out[id][s] = u;
    }
  }
  return out;
}
function scalarWorkload(phase, xs) {
  const out = {};
  for (const [id, , mult] of CATS) {
    out[id] = {};
    for (const [s, sb] of Object.entries(SCEN)) out[id][s] = scale(xs * mult, sb, PHASE_SCALE[phase]);
  }
  return out;
}

const defaults = {
  kind: 'openspec-assess.config',
  schemaVersion: 3,
  catalog: {
    verifiedAt: CHECKED,
    note: 'Ten pinned families as named by the owner, checked on the primary pages below. Versions are fixed; there is no automatic "latest". Public availability does not mean the account has the model or quota: account availability is configured separately (availability field). Antigravity client IDs are unpublished and stay unconfirmed.',
    sources: [
      { id: 'openai-models', url: 'https://developers.openai.com/api/docs/models', title: 'OpenAI models' },
      { id: 'codex-models', url: 'https://learn.chatgpt.com/docs/models', title: 'Codex models' },
      { id: 'claude-models', url: 'https://platform.claude.com/docs/en/about-claude/models/overview', title: 'Claude models overview' },
      { id: 'claude-code-models', url: 'https://code.claude.com/docs/en/model-config', title: 'Claude Code model configuration' },
      { id: 'antigravity-models', url: 'https://antigravity.google/docs/models', title: 'Antigravity models' },
    ],
  },
  complexityRules: {
    volumeThresholds: { tasks: [1, 4, 10, 25], files: [1, 4, 12, 40], diffLines: [50, 300, 1200, 5000] },
    groups: {
      volume: { volume: 1 },
      complexity: { domains: 2, layers: 1, architecture: 3, logic: 3, compatibility: 1 },
      risk: { consequences: 3, compatibility: 2, testability: 2 },
      uncertainty: { uncertainty: 1 },
    },
    unknownRankingLevel: 3,
    workloadCategories: CATS.map(([id, upToBp]) => ({ id, upToBp })),
    basis: 'Volume thresholds follow the rubric anchors; group weights emphasise architecture and logic for complexity and consequences for risk. Unknown levels rank as 3 (conservative) and keep 0..4 bounds.',
  },
  phases: {
    apply: {
      relevanceWeights: { volume: 2, domains: 2, layers: 2, architecture: 3, logic: 3, compatibility: 2, testability: 1, consequences: 2, uncertainty: 2 },
      qualityFloors: [{ fromDemandBp: 0, floorBp: 5000 }, { fromDemandBp: 3000, floorBp: 6000 }, { fromDemandBp: 5000, floorBp: 6800 }, { fromDemandBp: 7000, floorBp: 7600 }, { fromDemandBp: 8500, floorBp: 8000 }],
      criticalFactors: [{ factor: 'consequences', whenLevelAtLeast: 3, minCoefficientBp: 7500 }, { factor: 'architecture', whenLevelAtLeast: 4, minCoefficientBp: 7500 }],
      basis: 'Apply weights favour architecture and logic; floors rise with the upper bound of complexity/risk. Policy values, not benchmark facts.',
    },
    verify: {
      relevanceWeights: { volume: 1, domains: 2, layers: 1, architecture: 2, logic: 2, compatibility: 2, testability: 3, consequences: 3, uncertainty: 2 },
      qualityFloors: [{ fromDemandBp: 0, floorBp: 5000 }, { fromDemandBp: 3000, floorBp: 6000 }, { fromDemandBp: 5000, floorBp: 6600 }, { fromDemandBp: 7000, floorBp: 7400 }, { fromDemandBp: 8500, floorBp: 7800 }],
      criticalFactors: [{ factor: 'consequences', whenLevelAtLeast: 3, minCoefficientBp: 7500 }, { factor: 'testability', whenLevelAtLeast: 3, minCoefficientBp: 7000 }],
      basis: 'Verify weights favour testability and consequences. Policy values, not benchmark facts.',
    },
  },
  workloads: {
    basis: 'Scenario workloads per category (xs..xl) and phase; high includes possible rework. Uncalibrated heuristics until local completed changes are measured.',
    api: { apply: apiWorkload('apply'), verify: apiWorkload('verify') },
    subscription: { apply: scalarWorkload('apply', 10), verify: scalarWorkload('verify', 10) },
    timeMinutes: { apply: scalarWorkload('apply', 10), verify: scalarWorkload('verify', 10) },
  },
  harnesses: [
    { id: 'codex', name: 'Codex', docs: 'https://developers.openai.com/codex' },
    { id: 'claude-code', name: 'Claude Code', docs: 'https://code.claude.com/docs' },
    { id: 'antigravity', name: 'Antigravity IDE', docs: 'https://antigravity.google/docs' },
  ],
  models,
  pricing,
  quotaPools: [
    { id: 'codex-plan', harness: 'codex', label: 'Codex subscription plan', observation: null, conversion: null, note: 'Modelled as one plan-level pool; the Codex models page does not state how limits are split across models. Split it with overrides if your plan shows per-model limits.' },
    { id: 'claude-plan', harness: 'claude-code', label: 'Claude subscription plan', observation: null, conversion: null, note: 'Modelled as one plan-level pool for Claude Code; confirm against the usage view of your plan.' },
    { id: 'antigravity-gemini', harness: 'antigravity', label: 'Antigravity plan: Gemini models', observation: null, conversion: null, note: 'Antigravity tracks Gemini models and Claude/GPT models in separate limits (weekly and five-hour); all three catalog models are Gemini and share this pool.' },
  ],
  constraints: { minContextTokens: null, requiredCapabilities: [], api: { maxCostMicros: null } },
  selection: {
    policy: 'minimum-resource-with-time-penalty',
    policyVersion: 1,
    api: { currency: 'USD', timePenalty: { graceMinutes: 30, intervalMinutes: 30, rateBp: 500 } },
    subscription: { timePenalty: { graceMinutes: 30, intervalMinutes: 30, rateBp: 500 } },
    basis: 'Cheapest sufficient variant: candidates must pass the quality floor and critical factors; among them the smallest S = C × (1 + 0.05 × max(0, T − 30 min) / 30 min) wins, where C is the upper cost/load forecast and T the typical time. Extra quality only breaks ties. No anchors or saturation. Published policy, not a benchmark fact.',
  },
};

const text = canonicalStringify(defaults, { pretty: true });
if (process.argv.includes('--check')) {
  const current = readFileSync(out, 'utf8');
  if (current !== text) { console.error('config/defaults.json is out of date; run node scripts/build-defaults.mjs'); process.exit(1); }
  console.log('config/defaults.json is up to date');
} else {
  writeFileSync(out, text);
  console.log(`wrote ${out}`);
}
