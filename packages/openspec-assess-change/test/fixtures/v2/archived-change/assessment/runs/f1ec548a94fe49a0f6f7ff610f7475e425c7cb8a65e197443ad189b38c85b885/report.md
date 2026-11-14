# Assessment: add-shout-flag (planning)

Evaluator 2, renderer 2, package 0.2.0. As-of: 2026-11-14T12:00:00Z.
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

Status: **ok**. Ordered for manual choice. Suitability is a heuristic fit score, not a probability of success.
Quality floor: 50 on the 0–100 model score scale (demand 1785 bp). Selection weights: quality 7, economy 3, time 0.
Top of list for manual choice: `claude-code/claude-opus-5-5` at effort `medium`.

| # | Candidate | Group | Effort | Suitability 0–100 (heuristic) | Coverage | Utility 0–100 | API cost low / typical / high | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | eligible | medium | 82 | 100% | 81.5 | USD 0.7860 / USD 1.5720 / USD 3.9300; usage ×1.00 (h) | — |
| 2 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | eligible | high | 77.94 | 100% | 80.13 | USD 0.5895 / USD 1.1790 / USD 2.9475; usage ×1.50 (h) | — |
| 3 | GPT-6.1 Sol `codex/gpt-6.1-sol` | eligible | high | 77.94 | 100% | 80.13 | USD 0.5895 / USD 1.1790 / USD 2.9475; usage ×1.50 (h) | — |
| 4 | GPT-6.1 Terra `codex/gpt-6.1-terra` | eligible | xhigh | 70.89 | 100% | 76.38 | USD 0.4323 / USD 0.8646 / USD 2.1615; usage ×2.20 (h) | — |
| 5 | GPT-6 Astra `codex/gpt-6-astra` | eligible | low | 74 | 100% | 72.55 | USD 1.2330 / USD 2.4660 / USD 6.1650; usage ×0.60 (h) | — |
| 6 | GPT-6 Luna `codex/gpt-6-luna` | eligible | xhigh | 59.84 | 100% | 71.54 | USD 0.0452 / USD 0.0904 / USD 0.2260; usage ×2.20 (h) | — |
| 7 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | eligible | xhigh | 59.84 | 100% | 70.19 | USD 0.0452 / USD 0.0904 / USD 1.1302; usage ×2.20 (h) | — |
| 8 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 85 | 100% | — | unknown (pricing "antigravity.argon.standard" is marked unknown); usage ×1.50 (h) | account availability is unknown |
| 9 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | provisional | xhigh | 79.94 | 100% | — | unknown (pricing "antigravity.hydrogen.standard" is marked unknown); usage ×2.20 (h) | account availability is unknown |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | provisional | high | 57.84 | 100% | — | unknown (pricing "antigravity.flash.standard" is marked unknown); usage ×1.50 (h) | account availability is unknown |

<details><summary>Factor contributions for claude-code/claude-opus-5-5 @ medium</summary>

| Factor | Level | Relevance | Estimate record | Score 0–100 | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- | --- |
| volume | 1 | 2 | apply/medium/volume | 82 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 8.63 |
| domains | 0 | 2 | apply/medium/domains | 82 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 8.63 |
| layers | 1 | 2 | apply/medium/layers | 82 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 8.63 |
| architecture | 0 | 3 | apply/medium/architecture | 82 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 12.94 |
| logic | 1 | 3 | apply/medium/logic | 82 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 12.94 |
| compatibility | 1 | 2 | apply/medium/compatibility | 82 | h heuristic | 8.63 |
| testability | 0 | 1 | apply/medium/testability | 82 | h heuristic | 4.31 |
| consequences | 1 | 2 | apply/medium/consequences | 82 | h heuristic | 8.63 |
| uncertainty | 0 | 2 | apply/medium/uncertainty | 82 | h heuristic | 8.63 |

Provenance letters: m measured · p proxy · h heuristic · o user-override · u unknown.

</details>

## Verify · API

Status: **ok**. Ordered for manual choice. Suitability is a heuristic fit score, not a probability of success.
Quality floor: 50 on the 0–100 model score scale (demand 1785 bp). Selection weights: quality 7, economy 3, time 0.
Top of list for manual choice: `claude-code/claude-opus-5-5` at effort `high`.

| # | Candidate | Group | Effort | Suitability 0–100 (heuristic) | Coverage | Utility 0–100 | API cost low / typical / high | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | eligible | high | 83 | 100% | 82.79 | USD 0.7074 / USD 1.4148 / USD 3.5370; usage ×1.50 (h) | — |
| 2 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | eligible | xhigh | 76 | 100% | 79.31 | USD 0.5187 / USD 1.0375 / USD 2.5938; usage ×2.20 (h) | — |
| 3 | GPT-6.1 Sol `codex/gpt-6.1-sol` | eligible | xhigh | 76 | 100% | 79.31 | USD 0.5187 / USD 1.0375 / USD 2.5938; usage ×2.20 (h) | — |
| 4 | GPT-6 Astra `codex/gpt-6-astra` | eligible | medium | 80 | 100% | 76.75 | USD 1.2330 / USD 2.4660 / USD 6.1650; usage ×1.00 (h) | — |
| 5 | GPT-6.1 Terra `codex/gpt-6.1-terra` | eligible | xhigh | 67 | 100% | 74.95 | USD 0.2593 / USD 0.5187 / USD 1.2969; usage ×2.20 (h) | — |
| 6 | GPT-6 Luna `codex/gpt-6-luna` | eligible | xhigh | 56 | 100% | 68.99 | USD 0.0271 / USD 0.0542 / USD 0.1356; usage ×2.20 (h) | — |
| 7 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | eligible | xhigh | 56 | 100% | 68.18 | USD 0.0271 / USD 0.0542 / USD 0.6781; usage ×2.20 (h) | — |
| 8 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 83 | 100% | — | unknown (pricing "antigravity.argon.standard" is marked unknown); usage ×1.50 (h) | account availability is unknown |
| 9 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | provisional | xhigh | 76 | 100% | — | unknown (pricing "antigravity.hydrogen.standard" is marked unknown); usage ×2.20 (h) | account availability is unknown |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | provisional | high | 54 | 100% | — | unknown (pricing "antigravity.flash.standard" is marked unknown); usage ×1.50 (h) | account availability is unknown |

<details><summary>Factor contributions for claude-code/claude-opus-5-5 @ high</summary>

| Factor | Level | Relevance | Estimate record | Score 0–100 | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- | --- |
| volume | 1 | 1 | verify/high/volume | 83 | h heuristic | 4.61 |
| domains | 0 | 2 | verify/high/domains | 83 | h heuristic | 9.22 |
| layers | 1 | 1 | verify/high/layers | 83 | h heuristic | 4.61 |
| architecture | 0 | 2 | verify/high/architecture | 83 | h heuristic | 9.22 |
| logic | 1 | 2 | verify/high/logic | 83 | h heuristic | 9.22 |
| compatibility | 1 | 2 | verify/high/compatibility | 83 | h heuristic | 9.22 |
| testability | 0 | 3 | verify/high/testability | 83 | h heuristic | 13.83 |
| consequences | 1 | 3 | verify/high/consequences | 83 | h heuristic | 13.83 |
| uncertainty | 0 | 2 | verify/high/uncertainty | 83 | h heuristic | 9.22 |

Provenance letters: m measured · p proxy · h heuristic · o user-override · u unknown.

</details>

## Apply · Subscription

Status: **ok**. Ordered for manual choice. Suitability is a heuristic fit score, not a probability of success.
Quality floor: 50 on the 0–100 model score scale (demand 1785 bp). Selection weights: quality 7, economy 3, time 0.
Top of list for manual choice: `claude-code/claude-opus-5-5` at effort `medium`.

| # | Candidate | Group | Effort | Suitability 0–100 (heuristic) | Coverage | Utility 0–100 | Relative load low / typical / high | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | eligible | medium | 82 | 100% | 82.9 | 30 / 60 / 150 load units; ×2.00 (h); capacity unknown | — |
| 2 | GPT-6 Astra `codex/gpt-6-astra` | eligible | medium | 82 | 100% | 82.9 | 30 / 60 / 150 load units; ×2.00 (h); capacity unknown | — |
| 3 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | eligible | high | 77.94 | 100% | 81.19 | 22 / 45 / 112 load units; ×1.50 (h); capacity unknown | — |
| 4 | GPT-6.1 Sol `codex/gpt-6.1-sol` | eligible | high | 77.94 | 100% | 81.19 | 22 / 45 / 112 load units; ×1.50 (h); capacity unknown | — |
| 5 | GPT-6.1 Terra `codex/gpt-6.1-terra` | eligible | xhigh | 70.89 | 100% | 76.17 | 23 / 46 / 115 load units; ×1.54 (h); capacity unknown | — |
| 6 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | eligible | xhigh | 59.84 | 100% | 69.9 | 13 / 26 / 66 load units; ×0.88 (h); capacity unknown | — |
| 7 | GPT-6 Luna `codex/gpt-6-luna` | eligible | xhigh | 59.84 | 100% | 69.9 | 13 / 26 / 66 load units; ×0.88 (h); capacity unknown | — |
| 8 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 85 | 100% | 82.75 | 45 / 90 / 225 load units; ×3.00 (h); capacity unknown | account availability is unknown |
| 9 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | provisional | xhigh | 79.94 | 100% | 81 | 33 / 66 / 165 load units; ×2.20 (h); capacity unknown | account availability is unknown |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | provisional | high | 57.84 | 100% | 69.13 | 9 / 18 / 45 load units; ×0.60 (h); capacity unknown | account availability is unknown |

Quota pools:
- `antigravity-gemini` (Antigravity plan: Gemini models): antigravity/gemini-4-argon, antigravity/gemini-4-hydrogen, antigravity/gemini-3.8-flash — unknown; One shared quota: switching between these models does not create a new independent limit.
- `claude-plan` (Claude subscription plan): claude-code/claude-opus-5-5, claude-code/claude-sonnet-5-5, claude-code/claude-haiku-5-5 — unknown; One shared quota: switching between these models does not create a new independent limit.
- `codex-plan` (Codex subscription plan): codex/gpt-6-astra, codex/gpt-6.1-sol, codex/gpt-6.1-terra, codex/gpt-6-luna — unknown; One shared quota: switching between these models does not create a new independent limit.

<details><summary>Factor contributions for claude-code/claude-opus-5-5 @ medium</summary>

| Factor | Level | Relevance | Estimate record | Score 0–100 | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- | --- |
| volume | 1 | 2 | apply/medium/volume | 82 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 8.63 |
| domains | 0 | 2 | apply/medium/domains | 82 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 8.63 |
| layers | 1 | 2 | apply/medium/layers | 82 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 8.63 |
| architecture | 0 | 3 | apply/medium/architecture | 82 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 12.94 |
| logic | 1 | 3 | apply/medium/logic | 82 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 12.94 |
| compatibility | 1 | 2 | apply/medium/compatibility | 82 | h heuristic | 8.63 |
| testability | 0 | 1 | apply/medium/testability | 82 | h heuristic | 4.31 |
| consequences | 1 | 2 | apply/medium/consequences | 82 | h heuristic | 8.63 |
| uncertainty | 0 | 2 | apply/medium/uncertainty | 82 | h heuristic | 8.63 |

Provenance letters: m measured · p proxy · h heuristic · o user-override · u unknown.

</details>

## Verify · Subscription

Status: **ok**. Ordered for manual choice. Suitability is a heuristic fit score, not a probability of success.
Quality floor: 50 on the 0–100 model score scale (demand 1785 bp). Selection weights: quality 7, economy 3, time 0.
Top of list for manual choice: `claude-code/claude-opus-5-5` at effort `high`.

| # | Candidate | Group | Effort | Suitability 0–100 (heuristic) | Coverage | Utility 0–100 | Relative load low / typical / high | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | eligible | high | 83 | 100% | 84.05 | 27 / 54 / 135 load units; ×3.00 (h); capacity unknown | — |
| 2 | GPT-6 Astra `codex/gpt-6-astra` | eligible | high | 83 | 100% | 84.05 | 27 / 54 / 135 load units; ×3.00 (h); capacity unknown | — |
| 3 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | eligible | xhigh | 76 | 100% | 80.23 | 19 / 39 / 99 load units; ×2.20 (h); capacity unknown | — |
| 4 | GPT-6.1 Sol `codex/gpt-6.1-sol` | eligible | xhigh | 76 | 100% | 80.23 | 19 / 39 / 99 load units; ×2.20 (h); capacity unknown | — |
| 5 | GPT-6.1 Terra `codex/gpt-6.1-terra` | eligible | xhigh | 67 | 100% | 74.83 | 13 / 27 / 69 load units; ×1.54 (h); capacity unknown | — |
| 6 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | eligible | xhigh | 56 | 100% | 68.03 | 7 / 15 / 39 load units; ×0.88 (h); capacity unknown | — |
| 7 | GPT-6 Luna `codex/gpt-6-luna` | eligible | xhigh | 56 | 100% | 68.03 | 7 / 15 / 39 load units; ×0.88 (h); capacity unknown | — |
| 8 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 83 | 100% | 84.05 | 27 / 54 / 135 load units; ×3.00 (h); capacity unknown | account availability is unknown |
| 9 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | provisional | xhigh | 76 | 100% | 80.23 | 19 / 39 / 99 load units; ×2.20 (h); capacity unknown | account availability is unknown |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | provisional | high | 54 | 100% | 66.99 | 5 / 10 / 27 load units; ×0.60 (h); capacity unknown | account availability is unknown |

Quota pools:
- `antigravity-gemini` (Antigravity plan: Gemini models): antigravity/gemini-4-argon, antigravity/gemini-4-hydrogen, antigravity/gemini-3.8-flash — unknown; One shared quota: switching between these models does not create a new independent limit.
- `claude-plan` (Claude subscription plan): claude-code/claude-opus-5-5, claude-code/claude-sonnet-5-5, claude-code/claude-haiku-5-5 — unknown; One shared quota: switching between these models does not create a new independent limit.
- `codex-plan` (Codex subscription plan): codex/gpt-6-astra, codex/gpt-6.1-sol, codex/gpt-6.1-terra, codex/gpt-6-luna — unknown; One shared quota: switching between these models does not create a new independent limit.

<details><summary>Factor contributions for claude-code/claude-opus-5-5 @ high</summary>

| Factor | Level | Relevance | Estimate record | Score 0–100 | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- | --- |
| volume | 1 | 1 | verify/high/volume | 83 | h heuristic | 4.61 |
| domains | 0 | 2 | verify/high/domains | 83 | h heuristic | 9.22 |
| layers | 1 | 1 | verify/high/layers | 83 | h heuristic | 4.61 |
| architecture | 0 | 2 | verify/high/architecture | 83 | h heuristic | 9.22 |
| logic | 1 | 2 | verify/high/logic | 83 | h heuristic | 9.22 |
| compatibility | 1 | 2 | verify/high/compatibility | 83 | h heuristic | 9.22 |
| testability | 0 | 3 | verify/high/testability | 83 | h heuristic | 13.83 |
| consequences | 1 | 3 | verify/high/consequences | 83 | h heuristic | 13.83 |
| uncertainty | 0 | 2 | verify/high/uncertainty | 83 | h heuristic | 9.22 |

Provenance letters: m measured · p proxy · h heuristic · o user-override · u unknown.

</details>

## Benchmark sources

- `aa-cai-2.1.antigravity.argon.high`: Artificial Analysis Coding Agent Index v2.1, index, antigravity/gemini-4-argon@high — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.claude-code.opus-5-5.max`: Artificial Analysis Coding Agent Index v2.1, index, claude-code/claude-opus-5-5@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.claude-code.sonnet-5-5.max`: Artificial Analysis Coding Agent Index v2.1, index, claude-code/claude-sonnet-5-5@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.codex.astra.max`: Artificial Analysis Coding Agent Index v2.1, index, codex/gpt-6-astra@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.codex.sol.max`: Artificial Analysis Coding Agent Index v2.1, index, codex/gpt-6.1-sol@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.codex.terra.max`: Artificial Analysis Coding Agent Index v2.1, index, codex/gpt-6.1-terra@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents

