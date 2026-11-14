---
name: openspec-assess-change
description: Assess an OpenSpec change (volume, complexity, risk, uncertainty) from an evidence profile and rank models for apply and verify, separately for API and subscription use. Use after propose (planning artifacts ready) and again before verify, or when the user asks which model or effort to use for a change, or says "assess change" or "opsx assess". Produces a stored, replayable report; never switches models or starts apply/verify.
license: UNLICENSED
compatibility: Requires Node.js 22+, Git and the OpenSpec CLI 2.x. No SDKs, network or model calls.
metadata:
  version: "0.3.0"
---

# Assess an OpenSpec change

You prepare an evidence-based **profile** of the change; the bundled Node.js CLI validates it and computes four deterministic rankings: **apply/API, verify/API, apply/subscription, verify/subscription**. The owner chooses the model. You never switch models, start apply/verify, tick tasks or archive because of this report.

`<skill>` below is the directory that contains this file. Run the CLI as:

```bash
node <skill>/bin/openspec-assess.mjs <command> --change <name> [--store <id>]
```

Keep `--store <id>` on every command once a store is selected. If there is no OpenSpec root, stop and ask the user (the CLI never runs `openspec init`). If several changes are active and the user did not name one, ask which one.

## When

- **After propose** (proposal, specs, tasks done; design optional) → stage `planning`.
- **Before verify**, once the implementation exists → new profile with stage `verification`, bound to the actual diff.
- **Any time** to check whether a stored assessment is still current: `check-freshness`.

Running automatically right after propose needs the project's own workflow setup; this skill does not patch the generated OpenSpec skills.

## Steps (planning)

1. Resolve the change: `openspec status --change <name> --json` (with `--store`). Read `proposal.md`, `design.md` (if any), every `specs/**/spec.md`, `tasks.md`, and the repository files the tasks touch.
2. Start a profile if `assessment/profile.json` does not exist:
   `node <skill>/bin/openspec-assess.mjs template --change <name> --write` (every value starts as `unknown`).
3. Fill it using [references/rubric.md](references/rubric.md):
   - each factor: `level` 0–4 by the anchors, `kind` (`declared` for your judgement, `estimated` for forecasts, `measured` only with measurement evidence), a one-line `rationale` naming the anchor, and `evidence` IDs;
   - `unknown` when you cannot tell (never guess 0); `not-applicable` with a rationale when the factor is absent;
   - quantities as ranges (`min`/`max`) with `kind: estimated` before implementation; files that do not exist yet are `planned: true` evidence with `derivedFrom` the task/requirement;
   - evidence entries point at artifacts, requirements (`locator` = requirement name), tasks (`locator` = task id) or repository files. Do not write digests by hand.
4. `pin-evidence` (fills digests and saves `assessment/profile.json`), then `validate-profile`. Fix every reported path.
5. `assess`. Optional: `--as-of <UTC>` when quota observations exist; `--overrides <file>` or `<changeRoot>/assessment/overrides.json` for the user's settings (availability, prices, weights).
6. Report to the user: the four top entries with recommended effort, the original cost/load and time forecasts, status (`ok`, `economics-undefined`, `provisional-only`, `no-suitable`, `undefined`), the main reasons and missing data. The default policy picks the cheapest sufficient variant: candidates must pass the quality floor and critical factors, then the smallest adjusted cost S = C × (1 + 0.05 × max(0, T − 30)/30) wins. S is a comparison value, not a price — quote the original forecast for cost. Say that fit scores are heuristic, not probabilities, and that the choice is theirs. Point to `assessment/runs/<id>/report.md`.

## Steps (before verify)

1. Copy the planning profile, set `"stage": "verification"`, `"previousAssessmentId": "<planning run id from assessment/latest.json>"`.
2. Add `{ "id": "diff", "kind": "diff", "revision": "<base commit>", "note": "…" }` and re-derive quantities from the real diff (`measured`, `min == max`, evidence `diff`). Remove digests of changed sources and re-judge factors that the implementation revealed.
3. `pin-evidence`, `validate-profile`, `assess`. The planning run stays in `assessment/runs/` unchanged.

## Other commands

- `check-freshness` — stale when planning artifacts, evidence sources, task scope, the working profile, config or evaluator changed. Never present a stale ranking as current.
- `replay [<path>]` — read-only recomputation of a stored run (also from `openspec/changes/archive/...`). It does not re-check historical evidence; that is what freshness is for.
- `configure` — local configurator (loopback only) for the parameter × model matrix; export overrides as JSON.
- `migrate-config` — explicit format migration when the CLI reports a schemaVersion 1 or 2 config/overrides; keeps the legacy weighted-utility policy and the old numbers. `switch-policy` — separate, deliberate switch to the cheapest-sufficient policy (rankings may change). Run either only when the user asks; they write separate files and never touch existing runs.

## Rules

- The CLI is the only calculator. Do not compute or reorder rankings yourself, and do not edit files under `assessment/runs/`.
- Present `provisional` candidates as needing clarification (e.g. unknown account availability), not as recommendations.
- Do not copy benchmark texts or datasets into the profile; cite sources by URL as the catalog does.
- References: [rubric](references/rubric.md) · [formula](references/formula.md) · [catalog and coefficients](references/catalog.md) · [benchmarks](references/benchmarks.md) · [cost and quotas](references/cost.md) · [storage, freshness, replay](references/layout.md) · [client setup](references/clients.md) · [configurator](references/configurator.md) · [migration and policy switch](references/migration.md)
