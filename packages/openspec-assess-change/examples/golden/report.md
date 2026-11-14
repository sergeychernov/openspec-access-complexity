# Assessment: add-shout-flag (planning)

Evaluator 3, renderer 3, package 0.3.0. As-of: 2026-11-14T12:00:00Z.
Scope: all tasks.

> Suitability is a heuristic fit score (stored as 0–10000 bp, shown as 0–100), not a probability of success.
> Cost and load values are scenario forecasts (low/typical/high), not measurements.
> The report is input for a manual choice: it does not run apply or verify, switch models, mark tasks or accept the change.
> Determinism covers the calculation for these pinned inputs, not independent re-reading of the change by another agent.

## Change properties (model-independent)

| Index | Basis points 0–10000 |
| --- | --- |
| volume | 2500–2500 (ranking 2500) |
| complexity | 1250–1250 (ranking 1250) |
| risk | 1785–1785 (ranking 1785) |
| uncertainty | 0–0 (ranking 0) |

Workload category: low s, typical s, high s. Quality demand: 1785 bp.

| Factor | State | Kind | Level (lower–upper) | Ranking level |
| --- | --- | --- | --- | --- |
| Объём (`volume`) | known | estimated | 1–1 | 1 |
| Домены и связи (`domains`) | known | declared | 0–0 | 0 |
| Слои и пересечения границ (`layers`) | known | declared | 1–1 | 1 |
| Архитектурные изменения (`architecture`) | known | declared | 0–0 | 0 |
| Сложность логики (`logic`) | known | declared | 1–1 | 1 |
| Совместимость и миграции (`compatibility`) | known | declared | 1–1 | 1 |
| Проверяемость (сложность проверки) (`testability`) | known | declared | 0–0 | 0 |
| Последствия ошибки (`consequences`) | known | declared | 1–1 | 1 |
| Неопределённость (`uncertainty`) | known | declared | 0–0 | 0 |

Missing data: unknown factors none; unknown quantities none; unknown share 0 bp. unknown factor levels use bounds 0..4 for indices and level 3 for ranking relevance; they are never treated as 0.

## Apply · API

Status: **ok**. Cheapest sufficient variant first: among candidates that pass the quality floor and critical factors, the smallest adjusted cost S (upper cost or load × time penalty on the typical time) wins; extra quality only breaks ties. Suitability is a heuristic fit score, not a probability of success.
Quality floor: 50 on the 0–100 model score scale (demand 1785 bp).
Policy minimum-resource-with-time-penalty v1: candidates must pass the quality floor and critical factors; among them the smallest S = C × (1 + 0.05 × max(0, T − 30) / 30) is preferred, where C is the upper API cost forecast and T the typical time in minutes. Extra quality only breaks ties (S ↑, C ↑, suitability ↓, IDs). S is a comparison criterion, not a price or quota draw; budget and quota checks use the original forecasts.
Top of list for manual choice: `codex/gpt-6-luna` at effort `medium`.

| # | Candidate | Group | Effort | Suitability 0–100 (heuristic) | Coverage | API cost low / typical / high | Typical / high time, min | S for comparison (not a price) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | GPT-6 Luna `codex/gpt-6-luna` | eligible | medium | 54.84 | 100% | USD 0.0205 / USD 0.0411 / USD 0.1027; usage ×1.00 (h) | 15 / 37 | USD 0.10275 (C × 1; exact 102750/1 micros) | — |
| 2 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | eligible | medium | 54.84 | 100% | USD 0.0205 / USD 0.0411 / USD 0.5137; usage ×1.00 (h) | 15 / 37 | USD 0.51375 (C × 1; exact 513750/1 micros) | — |
| 3 | GPT-6.1 Terra `codex/gpt-6.1-terra` | eligible | low | 57.89 | 100% | USD 0.1179 / USD 0.2358 / USD 0.5895; usage ×0.60 (h) | 12 / 31 | USD 0.5895 (C × 1; exact 589500/1 micros) | — |
| 4 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | eligible | low | 66.94 | 100% | USD 0.2358 / USD 0.4716 / USD 1.1790; usage ×0.60 (h) | 18 / 45 | USD 1.179 (C × 1; exact 1179000/1 micros) | — |
| 5 | GPT-6.1 Sol `codex/gpt-6.1-sol` | eligible | low | 66.94 | 100% | USD 0.2358 / USD 0.4716 / USD 1.1790; usage ×0.60 (h) | 18 / 45 | USD 1.179 (C × 1; exact 1179000/1 micros) | — |
| 6 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | eligible | low | 74 | 100% | USD 0.4716 / USD 0.9432 / USD 2.3580; usage ×0.60 (h) | 23 / 58 | USD 2.358 (C × 1; exact 2358000/1 micros) | — |
| 7 | GPT-6 Astra `codex/gpt-6-astra` | eligible | low | 74 | 100% | USD 1.2330 / USD 2.4660 / USD 6.1650; usage ×0.60 (h) | 23 / 58 | USD 6.165 (C × 1; exact 6165000/1 micros) | — |
| 8 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 85 | 100% | unknown (pricing "antigravity.argon.standard" is marked unknown); usage ×1.50 (h) | 58 / 146 | unknown (missing API cost (high forecast)) | account availability is unknown; missing API cost (high forecast) |
| 9 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | provisional | xhigh | 79.94 | 100% | unknown (pricing "antigravity.hydrogen.standard" is marked unknown); usage ×2.20 (h) | 66 / 165 | unknown (missing API cost (high forecast)) | account availability is unknown; missing API cost (high forecast) |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | provisional | high | 57.84 | 100% | unknown (pricing "antigravity.flash.standard" is marked unknown); usage ×1.50 (h) | 22 / 56 | unknown (missing API cost (high forecast)) | account availability is unknown; missing API cost (high forecast) |

<details><summary>Factor contributions for codex/gpt-6-luna @ medium</summary>

| Factor | Level | Relevance | Estimate record | Score 0–100 | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- | --- |
| volume | 1 | 2 | apply/medium/volume | 58 | h heuristic | 6.1 |
| domains | 0 | 2 | apply/medium/domains | 58 | h heuristic | 6.1 |
| layers | 1 | 2 | apply/medium/layers | 58 | h heuristic | 6.1 |
| architecture | 0 | 3 | apply/medium/architecture | 52 | h heuristic | 8.21 |
| logic | 1 | 3 | apply/medium/logic | 52 | h heuristic | 8.21 |
| compatibility | 1 | 2 | apply/medium/compatibility | 58 | h heuristic | 6.1 |
| testability | 0 | 1 | apply/medium/testability | 58 | h heuristic | 3.05 |
| consequences | 1 | 2 | apply/medium/consequences | 52 | h heuristic | 5.47 |
| uncertainty | 0 | 2 | apply/medium/uncertainty | 52 | h heuristic | 5.47 |

Provenance letters: m measured · p proxy · h heuristic · o user-override · u unknown.

</details>

## Verify · API

Status: **ok**. Cheapest sufficient variant first: among candidates that pass the quality floor and critical factors, the smallest adjusted cost S (upper cost or load × time penalty on the typical time) wins; extra quality only breaks ties. Suitability is a heuristic fit score, not a probability of success.
Quality floor: 50 on the 0–100 model score scale (demand 1785 bp).
Policy minimum-resource-with-time-penalty v1: candidates must pass the quality floor and critical factors; among them the smallest S = C × (1 + 0.05 × max(0, T − 30) / 30) is preferred, where C is the upper API cost forecast and T the typical time in minutes. Extra quality only breaks ties (S ↑, C ↑, suitability ↓, IDs). S is a comparison criterion, not a price or quota draw; budget and quota checks use the original forecasts.
Top of list for manual choice: `codex/gpt-6-luna` at effort `medium`.

| # | Candidate | Group | Effort | Suitability 0–100 (heuristic) | Coverage | API cost low / typical / high | Typical / high time, min | S for comparison (not a price) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | GPT-6 Luna `codex/gpt-6-luna` | eligible | medium | 51 | 100% | USD 0.0123 / USD 0.0246 / USD 0.0616; usage ×1.00 (h) | 9 / 22 | USD 0.06165 (C × 1; exact 61650/1 micros) | — |
| 2 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | eligible | medium | 51 | 100% | USD 0.0123 / USD 0.0246 / USD 0.3082; usage ×1.00 (h) | 9 / 22 | USD 0.30825 (C × 1; exact 308250/1 micros) | — |
| 3 | GPT-6.1 Terra `codex/gpt-6.1-terra` | eligible | low | 54 | 100% | USD 0.0707 / USD 0.1414 / USD 0.3537; usage ×0.60 (h) | 7 / 18 | USD 0.3537 (C × 1; exact 353700/1 micros) | — |
| 4 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | eligible | low | 63 | 100% | USD 0.1414 / USD 0.2829 / USD 0.7074; usage ×0.60 (h) | 10 / 27 | USD 0.7074 (C × 1; exact 707400/1 micros) | — |
| 5 | GPT-6.1 Sol `codex/gpt-6.1-sol` | eligible | low | 63 | 100% | USD 0.1414 / USD 0.2829 / USD 0.7074; usage ×0.60 (h) | 10 / 27 | USD 0.7074 (C × 1; exact 707400/1 micros) | — |
| 6 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | eligible | low | 72 | 100% | USD 0.2829 / USD 0.5659 / USD 1.4148; usage ×0.60 (h) | 14 / 35 | USD 1.4148 (C × 1; exact 1414800/1 micros) | — |
| 7 | GPT-6 Astra `codex/gpt-6-astra` | eligible | low | 72 | 100% | USD 0.7398 / USD 1.4796 / USD 3.6990; usage ×0.60 (h) | 14 / 35 | USD 3.699 (C × 1; exact 3699000/1 micros) | — |
| 8 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 83 | 100% | unknown (pricing "antigravity.argon.standard" is marked unknown); usage ×1.50 (h) | 35 / 87 | unknown (missing API cost (high forecast)) | account availability is unknown; missing API cost (high forecast) |
| 9 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | provisional | xhigh | 76 | 100% | unknown (pricing "antigravity.hydrogen.standard" is marked unknown); usage ×2.20 (h) | 39 / 99 | unknown (missing API cost (high forecast)) | account availability is unknown; missing API cost (high forecast) |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | provisional | high | 54 | 100% | unknown (pricing "antigravity.flash.standard" is marked unknown); usage ×1.50 (h) | 13 / 33 | unknown (missing API cost (high forecast)) | account availability is unknown; missing API cost (high forecast) |

<details><summary>Factor contributions for codex/gpt-6-luna @ medium</summary>

| Factor | Level | Relevance | Estimate record | Score 0–100 | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- | --- |
| volume | 1 | 1 | verify/medium/volume | 54 | h heuristic | 3 |
| domains | 0 | 2 | verify/medium/domains | 54 | h heuristic | 6 |
| layers | 1 | 1 | verify/medium/layers | 54 | h heuristic | 3 |
| architecture | 0 | 2 | verify/medium/architecture | 48 | h heuristic | 5.33 |
| logic | 1 | 2 | verify/medium/logic | 48 | h heuristic | 5.33 |
| compatibility | 1 | 2 | verify/medium/compatibility | 54 | h heuristic | 6 |
| testability | 0 | 3 | verify/medium/testability | 54 | h heuristic | 9 |
| consequences | 1 | 3 | verify/medium/consequences | 48 | h heuristic | 8 |
| uncertainty | 0 | 2 | verify/medium/uncertainty | 48 | h heuristic | 5.33 |

Provenance letters: m measured · p proxy · h heuristic · o user-override · u unknown.

</details>

## Apply · Subscription

Status: **ok**. Cheapest sufficient variant first: among candidates that pass the quality floor and critical factors, the smallest adjusted cost S (upper cost or load × time penalty on the typical time) wins; extra quality only breaks ties. Suitability is a heuristic fit score, not a probability of success.
Quality floor: 50 on the 0–100 model score scale (demand 1785 bp).
Policy minimum-resource-with-time-penalty v1: candidates must pass the quality floor and critical factors; among them the smallest S = C × (1 + 0.05 × max(0, T − 30) / 30) is preferred, where C is the upper subscription load forecast and T the typical time in minutes. Extra quality only breaks ties (S ↑, C ↑, suitability ↓, IDs). S is a comparison criterion, not a price or quota draw; budget and quota checks use the original forecasts.
Top of list for manual choice: `claude-code/claude-haiku-5-5` at effort `medium`.

| # | Candidate | Group | Effort | Suitability 0–100 (heuristic) | Coverage | Relative load low / typical / high | Typical / high time, min | S for comparison (not a price) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | eligible | medium | 54.84 | 100% | 6 / 12 / 30 load units; ×0.40 (h); capacity unknown | 15 / 37 | 30 load units (C × 1; exact 30/1) | — |
| 2 | GPT-6 Luna `codex/gpt-6-luna` | eligible | medium | 54.84 | 100% | 6 / 12 / 30 load units; ×0.40 (h); capacity unknown | 15 / 37 | 30 load units (C × 1; exact 30/1) | — |
| 3 | GPT-6.1 Terra `codex/gpt-6.1-terra` | eligible | low | 57.89 | 100% | 6 / 12 / 31 load units; ×0.42 (h); capacity unknown | 12 / 31 | 31 load units (C × 1; exact 31/1) | — |
| 4 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | eligible | low | 66.94 | 100% | 9 / 18 / 45 load units; ×0.60 (h); capacity unknown | 18 / 45 | 45 load units (C × 1; exact 45/1) | — |
| 5 | GPT-6.1 Sol `codex/gpt-6.1-sol` | eligible | low | 66.94 | 100% | 9 / 18 / 45 load units; ×0.60 (h); capacity unknown | 18 / 45 | 45 load units (C × 1; exact 45/1) | — |
| 6 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | eligible | low | 74 | 100% | 18 / 36 / 90 load units; ×1.20 (h); capacity unknown | 23 / 58 | 90 load units (C × 1; exact 90/1) | — |
| 7 | GPT-6 Astra `codex/gpt-6-astra` | eligible | low | 74 | 100% | 18 / 36 / 90 load units; ×1.20 (h); capacity unknown | 23 / 58 | 90 load units (C × 1; exact 90/1) | — |
| 8 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 85 | 100% | 45 / 90 / 225 load units; ×3.00 (h); capacity unknown | 58 / 146 | 235.5 load units (C × 1.046666; exact 471/2) | account availability is unknown |
| 9 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | provisional | xhigh | 79.94 | 100% | 33 / 66 / 165 load units; ×2.20 (h); capacity unknown | 66 / 165 | 174.9 load units (C × 1.06; exact 1749/10) | account availability is unknown |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | provisional | high | 57.84 | 100% | 9 / 18 / 45 load units; ×0.60 (h); capacity unknown | 22 / 56 | 45 load units (C × 1; exact 45/1) | account availability is unknown |

Quota pools:
- `antigravity-gemini` (Antigravity plan: Gemini models): antigravity/gemini-4-argon, antigravity/gemini-4-hydrogen, antigravity/gemini-3.8-flash — unknown; One shared quota: switching between these models does not create a new independent limit.
- `claude-plan` (Claude subscription plan): claude-code/claude-haiku-5-5, claude-code/claude-sonnet-5-5, claude-code/claude-opus-5-5 — unknown; One shared quota: switching between these models does not create a new independent limit.
- `codex-plan` (Codex subscription plan): codex/gpt-6-luna, codex/gpt-6.1-terra, codex/gpt-6.1-sol, codex/gpt-6-astra — unknown; One shared quota: switching between these models does not create a new independent limit.

<details><summary>Factor contributions for claude-code/claude-haiku-5-5 @ medium</summary>

| Factor | Level | Relevance | Estimate record | Score 0–100 | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- | --- |
| volume | 1 | 2 | apply/medium/volume | 58 | h heuristic | 6.1 |
| domains | 0 | 2 | apply/medium/domains | 58 | h heuristic | 6.1 |
| layers | 1 | 2 | apply/medium/layers | 58 | h heuristic | 6.1 |
| architecture | 0 | 3 | apply/medium/architecture | 52 | h heuristic | 8.21 |
| logic | 1 | 3 | apply/medium/logic | 52 | h heuristic | 8.21 |
| compatibility | 1 | 2 | apply/medium/compatibility | 58 | h heuristic | 6.1 |
| testability | 0 | 1 | apply/medium/testability | 58 | h heuristic | 3.05 |
| consequences | 1 | 2 | apply/medium/consequences | 52 | h heuristic | 5.47 |
| uncertainty | 0 | 2 | apply/medium/uncertainty | 52 | h heuristic | 5.47 |

Provenance letters: m measured · p proxy · h heuristic · o user-override · u unknown.

</details>

## Verify · Subscription

Status: **ok**. Cheapest sufficient variant first: among candidates that pass the quality floor and critical factors, the smallest adjusted cost S (upper cost or load × time penalty on the typical time) wins; extra quality only breaks ties. Suitability is a heuristic fit score, not a probability of success.
Quality floor: 50 on the 0–100 model score scale (demand 1785 bp).
Policy minimum-resource-with-time-penalty v1: candidates must pass the quality floor and critical factors; among them the smallest S = C × (1 + 0.05 × max(0, T − 30) / 30) is preferred, where C is the upper subscription load forecast and T the typical time in minutes. Extra quality only breaks ties (S ↑, C ↑, suitability ↓, IDs). S is a comparison criterion, not a price or quota draw; budget and quota checks use the original forecasts.
Top of list for manual choice: `codex/gpt-6.1-terra` at effort `low`.

| # | Candidate | Group | Effort | Suitability 0–100 (heuristic) | Coverage | Relative load low / typical / high | Typical / high time, min | S for comparison (not a price) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | GPT-6.1 Terra `codex/gpt-6.1-terra` | eligible | low | 54 | 100% | 3 / 7 / 18 load units; ×0.42 (h); capacity unknown | 7 / 18 | 18 load units (C × 1; exact 18/1) | — |
| 2 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | eligible | medium | 51 | 100% | 3 / 7 / 18 load units; ×0.40 (h); capacity unknown | 9 / 22 | 18 load units (C × 1; exact 18/1) | — |
| 3 | GPT-6 Luna `codex/gpt-6-luna` | eligible | medium | 51 | 100% | 3 / 7 / 18 load units; ×0.40 (h); capacity unknown | 9 / 22 | 18 load units (C × 1; exact 18/1) | — |
| 4 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | eligible | low | 63 | 100% | 5 / 10 / 27 load units; ×0.60 (h); capacity unknown | 10 / 27 | 27 load units (C × 1; exact 27/1) | — |
| 5 | GPT-6.1 Sol `codex/gpt-6.1-sol` | eligible | low | 63 | 100% | 5 / 10 / 27 load units; ×0.60 (h); capacity unknown | 10 / 27 | 27 load units (C × 1; exact 27/1) | — |
| 6 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | eligible | low | 72 | 100% | 10 / 21 / 54 load units; ×1.20 (h); capacity unknown | 14 / 35 | 54 load units (C × 1; exact 54/1) | — |
| 7 | GPT-6 Astra `codex/gpt-6-astra` | eligible | low | 72 | 100% | 10 / 21 / 54 load units; ×1.20 (h); capacity unknown | 14 / 35 | 54 load units (C × 1; exact 54/1) | — |
| 8 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 83 | 100% | 27 / 54 / 135 load units; ×3.00 (h); capacity unknown | 35 / 87 | 136.125 load units (C × 1.008333; exact 1089/8) | account availability is unknown |
| 9 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | provisional | xhigh | 76 | 100% | 19 / 39 / 99 load units; ×2.20 (h); capacity unknown | 39 / 99 | 100.485 load units (C × 1.015; exact 20097/200) | account availability is unknown |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | provisional | high | 54 | 100% | 5 / 10 / 27 load units; ×0.60 (h); capacity unknown | 13 / 33 | 27 load units (C × 1; exact 27/1) | account availability is unknown |

Quota pools:
- `antigravity-gemini` (Antigravity plan: Gemini models): antigravity/gemini-4-argon, antigravity/gemini-4-hydrogen, antigravity/gemini-3.8-flash — unknown; One shared quota: switching between these models does not create a new independent limit.
- `claude-plan` (Claude subscription plan): claude-code/claude-haiku-5-5, claude-code/claude-sonnet-5-5, claude-code/claude-opus-5-5 — unknown; One shared quota: switching between these models does not create a new independent limit.
- `codex-plan` (Codex subscription plan): codex/gpt-6.1-terra, codex/gpt-6-luna, codex/gpt-6.1-sol, codex/gpt-6-astra — unknown; One shared quota: switching between these models does not create a new independent limit.

<details><summary>Factor contributions for codex/gpt-6.1-terra @ low</summary>

| Factor | Level | Relevance | Estimate record | Score 0–100 | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- | --- |
| volume | 1 | 1 | verify/low/volume | 56 | h heuristic | 3.11 |
| domains | 0 | 2 | verify/low/domains | 56 | h heuristic | 6.22 |
| layers | 1 | 1 | verify/low/layers | 56 | h heuristic | 3.11 |
| architecture | 0 | 2 | verify/low/architecture | 52 | h heuristic | 5.77 |
| logic | 1 | 2 | verify/low/logic | 52 | h heuristic | 5.77 |
| compatibility | 1 | 2 | verify/low/compatibility | 56 | h heuristic | 6.22 |
| testability | 0 | 3 | verify/low/testability | 56 | h heuristic | 9.33 |
| consequences | 1 | 3 | verify/low/consequences | 52 | h heuristic | 8.66 |
| uncertainty | 0 | 2 | verify/low/uncertainty | 52 | h heuristic | 5.77 |

Provenance letters: m measured · p proxy · h heuristic · o user-override · u unknown.

</details>

## Benchmark sources

- `aa-cai-2.1.antigravity.argon.high`: Artificial Analysis Coding Agent Index v2.1, index, antigravity/gemini-4-argon@high — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.claude-code.opus-5-5.max`: Artificial Analysis Coding Agent Index v2.1, index, claude-code/claude-opus-5-5@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.claude-code.sonnet-5-5.max`: Artificial Analysis Coding Agent Index v2.1, index, claude-code/claude-sonnet-5-5@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.codex.astra.max`: Artificial Analysis Coding Agent Index v2.1, index, codex/gpt-6-astra@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.codex.sol.max`: Artificial Analysis Coding Agent Index v2.1, index, codex/gpt-6.1-sol@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.codex.terra.max`: Artificial Analysis Coding Agent Index v2.1, index, codex/gpt-6.1-terra@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents

