# Historical v1 fixtures (openspec-assess-change 0.1.0)

Produced on 2026-11-14 by package **0.1.0** (evaluator 1, renderer 1, config/overrides schema 1)
*before* the explicit per-effort contract (config schema 2) was introduced. They are real outputs of
the old code, not reconstructions, and must not be regenerated with a newer release.

- `openspec-assess-change-0.1.0.tgz` — `npm pack` of the 0.1.0 package: the compatible release used to
  replay v1 snapshots and to recompute the old evaluator's numbers.
- `archived-change/` — the public example change after `openspec archive` with OpenSpec CLI 2.0.0:
  `assessment/latest.json`, the working `profile.json`, v1 `overrides.json` and one immutable v1 run.
- `../../../config/legacy/defaults-v1.json` — the shipped v1 defaults, needed to rebuild a v1 effective
  config before migration.

Tests use them to check that migration keeps the old numbers and order, that a new evaluator refuses
to replay v1 runs (naming the release to install), and that history is never rewritten.
