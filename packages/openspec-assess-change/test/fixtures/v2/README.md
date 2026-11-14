# Historical v2 fixtures (openspec-assess-change 0.2.0)

Produced on 2026-11-14 by package **0.2.0** (evaluator 2, renderer 2, config/overrides schema 2,
selection by the weighted utility — now called the legacy policy `weighted-utility`) *before* the
`minimum-resource-with-time-penalty` policy and config schema 3. Real outputs of the old code; never
regenerate them with a newer release.

- `openspec-assess-change-0.2.0.tgz` — `npm pack` of 0.2.0: the compatible release for replaying v2 runs.
- `archived-change/` — the public example after `openspec archive` (OpenSpec CLI 2.0.0) with v2
  `overrides.json`, `latest.json` and one immutable v2 run.
- `../../../config/legacy/defaults-v2.json` — the shipped 0.2.0 defaults, needed to rebuild a v2
  effective config before a format migration to schema 3.
