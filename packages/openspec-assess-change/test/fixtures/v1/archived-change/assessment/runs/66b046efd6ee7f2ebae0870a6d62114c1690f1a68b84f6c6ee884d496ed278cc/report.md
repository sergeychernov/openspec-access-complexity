# Assessment: add-shout-flag (planning)

Evaluator 1, renderer 1, package 0.1.0. As-of: 2026-11-14T12:00:00Z.
Scope: all tasks.

> Suitability is a heuristic fit score on a 0–10000 scale, not a probability of success.
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
Quality floor: 5000 bp (demand 1785). Selection weights: quality 7, economy 3, time 0.
Top of list for manual choice: `claude-code/claude-opus-5-5` at effort `medium`.

| # | Candidate | Group | Effort | Suitability (heuristic) | Coverage | Utility | API cost low / typical / high | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | eligible | medium | 8200 | 10000 | 8150 | USD 0.7860 / USD 1.5720 / USD 3.9300 | — |
| 2 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | eligible | high | 7794 | 10000 | 8013 | USD 0.5895 / USD 1.1790 / USD 2.9475 | — |
| 3 | GPT-6.1 Sol `codex/gpt-6.1-sol` | eligible | high | 7794 | 10000 | 8013 | USD 0.5895 / USD 1.1790 / USD 2.9475 | — |
| 4 | GPT-6.1 Terra `codex/gpt-6.1-terra` | eligible | xhigh | 7089 | 10000 | 7638 | USD 0.4323 / USD 0.8646 / USD 2.1615 | — |
| 5 | GPT-6 Astra `codex/gpt-6-astra` | eligible | low | 7400 | 10000 | 7255 | USD 1.2330 / USD 2.4660 / USD 6.1650 | — |
| 6 | GPT-6 Luna `codex/gpt-6-luna` | eligible | max | 6084 | 10000 | 7212 | USD 0.0616 / USD 0.1233 / USD 0.3082 | — |
| 7 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | eligible | max | 6084 | 10000 | 7027 | USD 0.0616 / USD 0.1233 / USD 1.5412 | — |
| 8 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 8500 | 10000 | — | unknown (pricing "antigravity.argon.standard" is marked unknown) | account availability is unknown |
| 9 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | provisional | xhigh | 7994 | 10000 | — | unknown (pricing "antigravity.hydrogen.standard" is marked unknown) | account availability is unknown |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | provisional | high | 5784 | 10000 | — | unknown (pricing "antigravity.flash.standard" is marked unknown) | account availability is unknown |

<details><summary>Factor contributions for claude-code/claude-opus-5-5 @ medium</summary>

| Factor | Level | Relevance | Coefficient | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- |
| volume | 1 | 2 | 8200 | proxy [aa-cai-2.1.claude-code.opus-5-5.max] | 863 |
| domains | 0 | 2 | 8200 | proxy [aa-cai-2.1.claude-code.opus-5-5.max] | 863 |
| layers | 1 | 2 | 8200 | proxy [aa-cai-2.1.claude-code.opus-5-5.max] | 863 |
| architecture | 0 | 3 | 8200 | proxy [aa-cai-2.1.claude-code.opus-5-5.max] | 1294 |
| logic | 1 | 3 | 8200 | proxy [aa-cai-2.1.claude-code.opus-5-5.max] | 1294 |
| compatibility | 1 | 2 | 8200 | heuristic | 863 |
| testability | 0 | 1 | 8200 | heuristic | 431 |
| consequences | 1 | 2 | 8200 | heuristic | 863 |
| uncertainty | 0 | 2 | 8200 | heuristic | 863 |

</details>

## Verify · API

Status: **ok**. Ordered for manual choice. Suitability is a heuristic fit score, not a probability of success.
Quality floor: 5000 bp (demand 1785). Selection weights: quality 7, economy 3, time 0.
Top of list for manual choice: `claude-code/claude-opus-5-5` at effort `high`.

| # | Candidate | Group | Effort | Suitability (heuristic) | Coverage | Utility | API cost low / typical / high | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | eligible | high | 8300 | 10000 | 8279 | USD 0.7074 / USD 1.4148 / USD 3.5370 | — |
| 2 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | eligible | xhigh | 7600 | 10000 | 7931 | USD 0.5187 / USD 1.0375 / USD 2.5938 | — |
| 3 | GPT-6.1 Sol `codex/gpt-6.1-sol` | eligible | xhigh | 7600 | 10000 | 7931 | USD 0.5187 / USD 1.0375 / USD 2.5938 | — |
| 4 | GPT-6 Astra `codex/gpt-6-astra` | eligible | medium | 8000 | 10000 | 7675 | USD 1.2330 / USD 2.4660 / USD 6.1650 | — |
| 5 | GPT-6.1 Terra `codex/gpt-6.1-terra` | eligible | xhigh | 6700 | 10000 | 7495 | USD 0.2593 / USD 0.5187 / USD 1.2969 | — |
| 6 | GPT-6 Luna `codex/gpt-6-luna` | eligible | max | 5700 | 10000 | 6962 | USD 0.0369 / USD 0.0739 / USD 0.1849 | — |
| 7 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | eligible | max | 5700 | 10000 | 6851 | USD 0.0369 / USD 0.0739 / USD 0.9247 | — |
| 8 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 8300 | 10000 | — | unknown (pricing "antigravity.argon.standard" is marked unknown) | account availability is unknown |
| 9 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | provisional | xhigh | 7600 | 10000 | — | unknown (pricing "antigravity.hydrogen.standard" is marked unknown) | account availability is unknown |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | provisional | high | 5400 | 10000 | — | unknown (pricing "antigravity.flash.standard" is marked unknown) | account availability is unknown |

<details><summary>Factor contributions for claude-code/claude-opus-5-5 @ high</summary>

| Factor | Level | Relevance | Coefficient | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- |
| volume | 1 | 1 | 8300 | heuristic | 461 |
| domains | 0 | 2 | 8300 | heuristic | 922 |
| layers | 1 | 1 | 8300 | heuristic | 461 |
| architecture | 0 | 2 | 8300 | heuristic | 922 |
| logic | 1 | 2 | 8300 | heuristic | 922 |
| compatibility | 1 | 2 | 8300 | heuristic | 922 |
| testability | 0 | 3 | 8300 | heuristic | 1383 |
| consequences | 1 | 3 | 8300 | heuristic | 1383 |
| uncertainty | 0 | 2 | 8300 | heuristic | 922 |

</details>

## Apply · Subscription

Status: **ok**. Ordered for manual choice. Suitability is a heuristic fit score, not a probability of success.
Quality floor: 5000 bp (demand 1785). Selection weights: quality 7, economy 3, time 0.
Top of list for manual choice: `claude-code/claude-opus-5-5` at effort `medium`.

| # | Candidate | Group | Effort | Suitability (heuristic) | Coverage | Utility | Relative load low / typical / high | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | eligible | medium | 8200 | 10000 | 8290 | 30 / 60 / 150; capacity unknown | — |
| 2 | GPT-6 Astra `codex/gpt-6-astra` | eligible | medium | 8200 | 10000 | 8290 | 30 / 60 / 150; capacity unknown | — |
| 3 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | eligible | high | 7794 | 10000 | 8119 | 22 / 45 / 112; capacity unknown | — |
| 4 | GPT-6.1 Sol `codex/gpt-6.1-sol` | eligible | high | 7794 | 10000 | 8119 | 22 / 45 / 112; capacity unknown | — |
| 5 | GPT-6.1 Terra `codex/gpt-6.1-terra` | eligible | xhigh | 7089 | 10000 | 7617 | 23 / 46 / 115; capacity unknown | — |
| 6 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | eligible | xhigh | 5984 | 10000 | 6990 | 13 / 26 / 66; capacity unknown | — |
| 7 | GPT-6 Luna `codex/gpt-6-luna` | eligible | xhigh | 5984 | 10000 | 6990 | 13 / 26 / 66; capacity unknown | — |
| 8 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 8500 | 10000 | 8275 | 45 / 90 / 225; capacity unknown | account availability is unknown |
| 9 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | provisional | xhigh | 7994 | 10000 | 8100 | 33 / 66 / 165; capacity unknown | account availability is unknown |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | provisional | high | 5784 | 10000 | 6913 | 9 / 18 / 45; capacity unknown | account availability is unknown |

Quota pools:
- `antigravity-gemini` (Antigravity plan: Gemini models): antigravity/gemini-4-argon, antigravity/gemini-4-hydrogen, antigravity/gemini-3.8-flash — unknown; One shared quota: switching between these models does not create a new independent limit.
- `claude-plan` (Claude subscription plan): claude-code/claude-opus-5-5, claude-code/claude-sonnet-5-5, claude-code/claude-haiku-5-5 — unknown; One shared quota: switching between these models does not create a new independent limit.
- `codex-plan` (Codex subscription plan): codex/gpt-6-astra, codex/gpt-6.1-sol, codex/gpt-6.1-terra, codex/gpt-6-luna — unknown; One shared quota: switching between these models does not create a new independent limit.

<details><summary>Factor contributions for claude-code/claude-opus-5-5 @ medium</summary>

| Factor | Level | Relevance | Coefficient | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- |
| volume | 1 | 2 | 8200 | proxy [aa-cai-2.1.claude-code.opus-5-5.max] | 863 |
| domains | 0 | 2 | 8200 | proxy [aa-cai-2.1.claude-code.opus-5-5.max] | 863 |
| layers | 1 | 2 | 8200 | proxy [aa-cai-2.1.claude-code.opus-5-5.max] | 863 |
| architecture | 0 | 3 | 8200 | proxy [aa-cai-2.1.claude-code.opus-5-5.max] | 1294 |
| logic | 1 | 3 | 8200 | proxy [aa-cai-2.1.claude-code.opus-5-5.max] | 1294 |
| compatibility | 1 | 2 | 8200 | heuristic | 863 |
| testability | 0 | 1 | 8200 | heuristic | 431 |
| consequences | 1 | 2 | 8200 | heuristic | 863 |
| uncertainty | 0 | 2 | 8200 | heuristic | 863 |

</details>

## Verify · Subscription

Status: **ok**. Ordered for manual choice. Suitability is a heuristic fit score, not a probability of success.
Quality floor: 5000 bp (demand 1785). Selection weights: quality 7, economy 3, time 0.
Top of list for manual choice: `claude-code/claude-opus-5-5` at effort `high`.

| # | Candidate | Group | Effort | Suitability (heuristic) | Coverage | Utility | Relative load low / typical / high | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | eligible | high | 8300 | 10000 | 8405 | 27 / 54 / 135; capacity unknown | — |
| 2 | GPT-6 Astra `codex/gpt-6-astra` | eligible | high | 8300 | 10000 | 8405 | 27 / 54 / 135; capacity unknown | — |
| 3 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | eligible | xhigh | 7600 | 10000 | 8023 | 19 / 39 / 99; capacity unknown | — |
| 4 | GPT-6.1 Sol `codex/gpt-6.1-sol` | eligible | xhigh | 7600 | 10000 | 8023 | 19 / 39 / 99; capacity unknown | — |
| 5 | GPT-6.1 Terra `codex/gpt-6.1-terra` | eligible | xhigh | 6700 | 10000 | 7483 | 13 / 27 / 69; capacity unknown | — |
| 6 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | eligible | max | 5700 | 10000 | 6828 | 10 / 21 / 54; capacity unknown | — |
| 7 | GPT-6 Luna `codex/gpt-6-luna` | eligible | max | 5700 | 10000 | 6828 | 10 / 21 / 54; capacity unknown | — |
| 8 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 8300 | 10000 | 8405 | 27 / 54 / 135; capacity unknown | account availability is unknown |
| 9 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | provisional | xhigh | 7600 | 10000 | 8023 | 19 / 39 / 99; capacity unknown | account availability is unknown |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | provisional | high | 5400 | 10000 | 6699 | 5 / 10 / 27; capacity unknown | account availability is unknown |

Quota pools:
- `antigravity-gemini` (Antigravity plan: Gemini models): antigravity/gemini-4-argon, antigravity/gemini-4-hydrogen, antigravity/gemini-3.8-flash — unknown; One shared quota: switching between these models does not create a new independent limit.
- `claude-plan` (Claude subscription plan): claude-code/claude-opus-5-5, claude-code/claude-sonnet-5-5, claude-code/claude-haiku-5-5 — unknown; One shared quota: switching between these models does not create a new independent limit.
- `codex-plan` (Codex subscription plan): codex/gpt-6-astra, codex/gpt-6.1-sol, codex/gpt-6.1-terra, codex/gpt-6-luna — unknown; One shared quota: switching between these models does not create a new independent limit.

<details><summary>Factor contributions for claude-code/claude-opus-5-5 @ high</summary>

| Factor | Level | Relevance | Coefficient | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- |
| volume | 1 | 1 | 8300 | heuristic | 461 |
| domains | 0 | 2 | 8300 | heuristic | 922 |
| layers | 1 | 1 | 8300 | heuristic | 461 |
| architecture | 0 | 2 | 8300 | heuristic | 922 |
| logic | 1 | 2 | 8300 | heuristic | 922 |
| compatibility | 1 | 2 | 8300 | heuristic | 922 |
| testability | 0 | 3 | 8300 | heuristic | 1383 |
| consequences | 1 | 3 | 8300 | heuristic | 1383 |
| uncertainty | 0 | 2 | 8300 | heuristic | 922 |

</details>

## Benchmark sources

- `aa-cai-2.1.antigravity.argon.high`: Artificial Analysis Coding Agent Index v2.1, index, antigravity/gemini-4-argon@high — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.claude-code.opus-5-5.max`: Artificial Analysis Coding Agent Index v2.1, index, claude-code/claude-opus-5-5@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.claude-code.sonnet-5-5.max`: Artificial Analysis Coding Agent Index v2.1, index, claude-code/claude-sonnet-5-5@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.codex.astra.max`: Artificial Analysis Coding Agent Index v2.1, index, codex/gpt-6-astra@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.codex.sol.max`: Artificial Analysis Coding Agent Index v2.1, index, codex/gpt-6.1-sol@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.codex.terra.max`: Artificial Analysis Coding Agent Index v2.1, index, codex/gpt-6.1-terra@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents

