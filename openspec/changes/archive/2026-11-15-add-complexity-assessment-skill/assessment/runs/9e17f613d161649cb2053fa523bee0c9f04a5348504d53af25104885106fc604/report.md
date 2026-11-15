# Assessment: add-complexity-assessment-skill (planning)

Evaluator 3, renderer 3, package 0.3.0. As-of: not set.
Scope: all tasks.

> Suitability is a heuristic fit score (stored as 0–10000 bp, shown as 0–100), not a probability of success.
> Cost and load values are scenario forecasts (low/typical/high), not measurements.
> The report is input for a manual choice: it does not run apply or verify, switch models, mark tasks or accept the change.
> Determinism covers the calculation for these pinned inputs, not independent re-reading of the change by another agent.

## Change properties (model-independent)

| Index | Basis points 0–10000 |
| --- | --- |
| volume | 10000–10000 (ranking 10000) |
| complexity | 8500–8500 (ranking 8500) |
| risk | 6428–6428 (ranking 6428) |
| uncertainty | 5000–5000 (ranking 5000) |

Workload category: low xl, typical xl, high xl. Quality demand: 8500 bp.

| Factor | State | Kind | Level (lower–upper) | Ranking level |
| --- | --- | --- | --- | --- |
| Объём (`volume`) | known | estimated | 4–4 | 4 |
| Домены и связи (`domains`) | known | declared | 3–3 | 3 |
| Слои и пересечения границ (`layers`) | known | declared | 4–4 | 4 |
| Архитектурные изменения (`architecture`) | known | declared | 4–4 | 4 |
| Сложность логики (`logic`) | known | declared | 3–3 | 3 |
| Совместимость и миграции (`compatibility`) | known | declared | 3–3 | 3 |
| Проверяемость (сложность проверки) (`testability`) | known | declared | 3–3 | 3 |
| Последствия ошибки (`consequences`) | known | declared | 2–2 | 2 |
| Неопределённость (`uncertainty`) | known | declared | 2–2 | 2 |

Missing data: unknown factors none; unknown quantities none; unknown share 0 bp. unknown factor levels use bounds 0..4 for indices and level 3 for ranking relevance; they are never treated as 0.

## Apply · API

Status: **provisional-only**. No candidate is confirmed: every remaining candidate needs clarification (see reasons, e.g. unknown account availability or coefficients). None is recommended until the open values are set.
Quality floor: 80 on the 0–100 model score scale (demand 8500 bp).
Policy minimum-resource-with-time-penalty v1: candidates must pass the quality floor and critical factors; among them the smallest S = C × (1 + 0.05 × max(0, T − 30) / 30) is preferred, where C is the upper API cost forecast and T the typical time in minutes. Extra quality only breaks ties (S ↑, C ↑, suitability ↓, IDs). S is a comparison criterion, not a price or quota draw; budget and quota checks use the original forecasts.

| # | Candidate | Group | Effort | Suitability 0–100 (heuristic) | Coverage | API cost low / typical / high | Typical / high time, min | S for comparison (not a price) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | provisional | max | 88 | 100% | USD 39.3000 / USD 78.6000 / USD 196.5000; usage ×3.00 (h) | 1950 / 4875 | USD 825.3 (C × 4.2; exact 825300000/1 micros) | account availability is unknown |
| 2 | GPT-6 Astra `codex/gpt-6-astra` | provisional | max | 88 | 100% | USD 179.2500 / USD 358.5000 / USD 896.2500; usage ×3.00 (h) | 1950 / 4875 | USD 3764.25 (C × 4.2; exact 3764250000/1 micros) | account availability is unknown |
| 3 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 85 | 100% | unknown (pricing "antigravity.argon.standard" is marked unknown); usage ×1.50 (h) | 975 / 2437 | unknown (missing API cost (high forecast)) | account availability is unknown; missing API cost (high forecast) |
| 4 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | provisional | max | 81.03 | 100% | USD 19.6500 / USD 39.3000 / USD 98.2500; usage ×3.00 (h) | 1500 / 3750 | USD 338.9625 (C × 3.45; exact 338962500/1 micros) | account availability is unknown |
| 5 | GPT-6.1 Sol `codex/gpt-6.1-sol` | provisional | max | 81.03 | 100% | USD 34.0500 / USD 68.1000 / USD 170.2500; usage ×3.00 (h) | 1500 / 3750 | USD 587.3625 (C × 3.45; exact 587362500/1 micros) | account availability is unknown |
| 6 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | provisional | xhigh | 80.03 | 100% | unknown (pricing "antigravity.hydrogen.standard" is marked unknown); usage ×2.20 (h) | 1100 / 2750 | unknown (missing API cost (high forecast)) | account availability is unknown; missing API cost (high forecast) |
| 7 | GPT-6.1 Terra `codex/gpt-6.1-terra` | below-threshold | max | 72.06 | 100% | USD 17.0250 / USD 34.0500 / USD 85.1250; usage ×3.00 (h) | 1050 / 2625 | USD 229.8375 (C × 2.7; exact 229837500/1 micros) | account availability is unknown; critical factor architecture: coefficient 7000 < required 7500; suitability 7206 < quality floor 8000 |
| 8 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | below-threshold | max | 60.1 | 100% | USD 5.1375 / USD 10.2750 / USD 25.6875; usage ×3.00 (h) | 750 / 1875 | USD 56.5125 (C × 2.2; exact 56512500/1 micros) | account availability is unknown; critical factor architecture: coefficient 5700 < required 7500; suitability 6010 < quality floor 8000 |
| 9 | GPT-6 Luna `codex/gpt-6-luna` | below-threshold | max | 60.1 | 100% | USD 1.7925 / USD 3.5850 / USD 8.9625; usage ×3.00 (h) | 750 / 1875 | USD 19.7175 (C × 2.2; exact 19717500/1 micros) | account availability is unknown; critical factor architecture: coefficient 5700 < required 7500; suitability 6010 < quality floor 8000 |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | below-threshold | high | 58.1 | 100% | unknown (pricing "antigravity.flash.standard" is marked unknown); usage ×1.50 (h) | 375 / 937 | unknown (missing API cost (high forecast)) | account availability is unknown; critical factor architecture: coefficient 5500 < required 7500; suitability 5810 < quality floor 8000; missing API cost (high forecast) |

<details><summary>Factor contributions for claude-code/claude-opus-5-5 @ max</summary>

| Factor | Level | Relevance | Estimate record | Score 0–100 | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- | --- |
| volume | 4 | 8 | apply/max/volume | 88 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 11.73 |
| domains | 3 | 6 | apply/max/domains | 88 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 8.8 |
| layers | 4 | 8 | apply/max/layers | 88 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 11.73 |
| architecture | 4 | 12 | apply/max/architecture | 88 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 17.6 |
| logic | 3 | 9 | apply/max/logic | 88 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 13.2 |
| compatibility | 3 | 6 | apply/max/compatibility | 88 | h heuristic | 8.8 |
| testability | 3 | 3 | apply/max/testability | 88 | h heuristic | 4.4 |
| consequences | 2 | 4 | apply/max/consequences | 88 | h heuristic | 5.86 |
| uncertainty | 2 | 4 | apply/max/uncertainty | 88 | h heuristic | 5.86 |

Provenance letters: m measured · p proxy · h heuristic · o user-override · u unknown.

</details>

## Verify · API

Status: **provisional-only**. No candidate is confirmed: every remaining candidate needs clarification (see reasons, e.g. unknown account availability or coefficients). None is recommended until the open values are set.
Quality floor: 78 on the 0–100 model score scale (demand 8500 bp).
Policy minimum-resource-with-time-penalty v1: candidates must pass the quality floor and critical factors; among them the smallest S = C × (1 + 0.05 × max(0, T − 30) / 30) is preferred, where C is the upper API cost forecast and T the typical time in minutes. Extra quality only breaks ties (S ↑, C ↑, suitability ↓, IDs). S is a comparison criterion, not a price or quota draw; budget and quota checks use the original forecasts.

| # | Candidate | Group | Effort | Suitability 0–100 (heuristic) | Coverage | API cost low / typical / high | Typical / high time, min | S for comparison (not a price) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | provisional | max | 86 | 100% | USD 23.5800 / USD 47.1600 / USD 117.9000; usage ×3.00 (h) | 1170 / 2925 | USD 341.91 (C × 2.9; exact 341910000/1 micros) | account availability is unknown |
| 2 | GPT-6 Astra `codex/gpt-6-astra` | provisional | max | 86 | 100% | USD 107.5500 / USD 215.1000 / USD 537.7500; usage ×3.00 (h) | 1170 / 2925 | USD 1559.475 (C × 2.9; exact 1559475000/1 micros) | account availability is unknown |
| 3 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 83 | 100% | unknown (pricing "antigravity.argon.standard" is marked unknown); usage ×1.50 (h) | 585 / 1462 | unknown (missing API cost (high forecast)) | account availability is unknown; missing API cost (high forecast) |
| 4 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | below-threshold | max | 77.09 | 100% | USD 11.7900 / USD 23.5800 / USD 58.9500; usage ×3.00 (h) | 900 / 2250 | USD 144.4275 (C × 2.45; exact 144427500/1 micros) | account availability is unknown; suitability 7709 < quality floor 7800 |
| 5 | GPT-6.1 Sol `codex/gpt-6.1-sol` | below-threshold | max | 77.09 | 100% | USD 20.4300 / USD 40.8600 / USD 102.1500; usage ×3.00 (h) | 900 / 2250 | USD 250.2675 (C × 2.45; exact 250267500/1 micros) | account availability is unknown; suitability 7709 < quality floor 7800 |
| 6 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | below-threshold | xhigh | 76.09 | 100% | unknown (pricing "antigravity.hydrogen.standard" is marked unknown); usage ×2.20 (h) | 660 / 1650 | unknown (missing API cost (high forecast)) | account availability is unknown; suitability 7609 < quality floor 7800; missing API cost (high forecast) |
| 7 | GPT-6.1 Terra `codex/gpt-6.1-terra` | below-threshold | max | 68.18 | 100% | USD 10.2150 / USD 20.4300 / USD 51.0750; usage ×3.00 (h) | 630 / 1575 | USD 102.15 (C × 2; exact 102150000/1 micros) | account availability is unknown; suitability 6818 < quality floor 7800 |
| 8 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | below-threshold | max | 56.28 | 100% | USD 3.0825 / USD 6.1650 / USD 15.4125; usage ×3.00 (h) | 450 / 1125 | USD 26.20125 (C × 1.7; exact 26201250/1 micros) | account availability is unknown; critical factor testability: coefficient 5900 < required 7000; suitability 5628 < quality floor 7800 |
| 9 | GPT-6 Luna `codex/gpt-6-luna` | below-threshold | max | 56.28 | 100% | USD 1.0755 / USD 2.1510 / USD 5.3775; usage ×3.00 (h) | 450 / 1125 | USD 9.14175 (C × 1.7; exact 9141750/1 micros) | account availability is unknown; critical factor testability: coefficient 5900 < required 7000; suitability 5628 < quality floor 7800 |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | below-threshold | high | 54.28 | 100% | unknown (pricing "antigravity.flash.standard" is marked unknown); usage ×1.50 (h) | 225 / 562 | unknown (missing API cost (high forecast)) | account availability is unknown; critical factor testability: coefficient 5700 < required 7000; suitability 5428 < quality floor 7800; missing API cost (high forecast) |

<details><summary>Factor contributions for claude-code/claude-opus-5-5 @ max</summary>

| Factor | Level | Relevance | Estimate record | Score 0–100 | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- | --- |
| volume | 4 | 4 | verify/max/volume | 86 | h heuristic | 6.49 |
| domains | 3 | 6 | verify/max/domains | 86 | h heuristic | 9.73 |
| layers | 4 | 4 | verify/max/layers | 86 | h heuristic | 6.49 |
| architecture | 4 | 8 | verify/max/architecture | 86 | h heuristic | 12.98 |
| logic | 3 | 6 | verify/max/logic | 86 | h heuristic | 9.73 |
| compatibility | 3 | 6 | verify/max/compatibility | 86 | h heuristic | 9.73 |
| testability | 3 | 9 | verify/max/testability | 86 | h heuristic | 14.6 |
| consequences | 2 | 6 | verify/max/consequences | 86 | h heuristic | 9.73 |
| uncertainty | 2 | 4 | verify/max/uncertainty | 86 | h heuristic | 6.49 |

Provenance letters: m measured · p proxy · h heuristic · o user-override · u unknown.

</details>

## Apply · Subscription

Status: **provisional-only**. No candidate is confirmed: every remaining candidate needs clarification (see reasons, e.g. unknown account availability or coefficients). None is recommended until the open values are set.
Quality floor: 80 on the 0–100 model score scale (demand 8500 bp).
Policy minimum-resource-with-time-penalty v1: candidates must pass the quality floor and critical factors; among them the smallest S = C × (1 + 0.05 × max(0, T − 30) / 30) is preferred, where C is the upper subscription load forecast and T the typical time in minutes. Extra quality only breaks ties (S ↑, C ↑, suitability ↓, IDs). S is a comparison criterion, not a price or quota draw; budget and quota checks use the original forecasts.

| # | Candidate | Group | Effort | Suitability 0–100 (heuristic) | Coverage | Relative load low / typical / high | Typical / high time, min | S for comparison (not a price) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | provisional | max | 88 | 100% | 1500 / 3000 / 7500 load units; ×6.00 (h); capacity unknown | 1950 / 4875 | 31500 load units (C × 4.2; exact 31500/1) | account availability is unknown |
| 2 | GPT-6 Astra `codex/gpt-6-astra` | provisional | max | 88 | 100% | 1500 / 3000 / 7500 load units; ×6.00 (h); capacity unknown | 1950 / 4875 | 31500 load units (C × 4.2; exact 31500/1) | account availability is unknown |
| 3 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 85 | 100% | 750 / 1500 / 3750 load units; ×3.00 (h); capacity unknown | 975 / 2437 | 9656.25 load units (C × 2.575; exact 38625/4) | account availability is unknown |
| 4 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | provisional | max | 81.03 | 100% | 750 / 1500 / 3750 load units; ×3.00 (h); capacity unknown | 1500 / 3750 | 12937.5 load units (C × 3.45; exact 25875/2) | account availability is unknown |
| 5 | GPT-6.1 Sol `codex/gpt-6.1-sol` | provisional | max | 81.03 | 100% | 750 / 1500 / 3750 load units; ×3.00 (h); capacity unknown | 1500 / 3750 | 12937.5 load units (C × 3.45; exact 25875/2) | account availability is unknown |
| 6 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | provisional | xhigh | 80.03 | 100% | 550 / 1100 / 2750 load units; ×2.20 (h); capacity unknown | 1100 / 2750 | 7654.166666 load units (C × 2.783333; exact 45925/6) | account availability is unknown |
| 7 | GPT-6.1 Terra `codex/gpt-6.1-terra` | below-threshold | max | 72.06 | 100% | 525 / 1050 / 2625 load units; ×2.10 (h); capacity unknown | 1050 / 2625 | 7087.5 load units (C × 2.7; exact 14175/2) | account availability is unknown; critical factor architecture: coefficient 7000 < required 7500; suitability 7206 < quality floor 8000 |
| 8 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | below-threshold | max | 60.1 | 100% | 300 / 600 / 1500 load units; ×1.20 (h); capacity unknown | 750 / 1875 | 3300 load units (C × 2.2; exact 3300/1) | account availability is unknown; critical factor architecture: coefficient 5700 < required 7500; suitability 6010 < quality floor 8000 |
| 9 | GPT-6 Luna `codex/gpt-6-luna` | below-threshold | max | 60.1 | 100% | 300 / 600 / 1500 load units; ×1.20 (h); capacity unknown | 750 / 1875 | 3300 load units (C × 2.2; exact 3300/1) | account availability is unknown; critical factor architecture: coefficient 5700 < required 7500; suitability 6010 < quality floor 8000 |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | below-threshold | high | 58.1 | 100% | 150 / 300 / 750 load units; ×0.60 (h); capacity unknown | 375 / 937 | 1181.25 load units (C × 1.575; exact 4725/4) | account availability is unknown; critical factor architecture: coefficient 5500 < required 7500; suitability 5810 < quality floor 8000 |

Quota pools:
- `antigravity-gemini` (Antigravity plan: Gemini models): antigravity/gemini-4-argon, antigravity/gemini-4-hydrogen, antigravity/gemini-3.8-flash — unknown; One shared quota: switching between these models does not create a new independent limit.
- `claude-plan` (Claude subscription plan): claude-code/claude-opus-5-5, claude-code/claude-sonnet-5-5, claude-code/claude-haiku-5-5 — unknown; One shared quota: switching between these models does not create a new independent limit.
- `codex-plan` (Codex subscription plan): codex/gpt-6-astra, codex/gpt-6.1-sol, codex/gpt-6.1-terra, codex/gpt-6-luna — unknown; One shared quota: switching between these models does not create a new independent limit.

<details><summary>Factor contributions for claude-code/claude-opus-5-5 @ max</summary>

| Factor | Level | Relevance | Estimate record | Score 0–100 | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- | --- |
| volume | 4 | 8 | apply/max/volume | 88 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 11.73 |
| domains | 3 | 6 | apply/max/domains | 88 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 8.8 |
| layers | 4 | 8 | apply/max/layers | 88 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 11.73 |
| architecture | 4 | 12 | apply/max/architecture | 88 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 17.6 |
| logic | 3 | 9 | apply/max/logic | 88 | h heuristic — support [aa-cai-2.1.claude-code.opus-5-5.max] | 13.2 |
| compatibility | 3 | 6 | apply/max/compatibility | 88 | h heuristic | 8.8 |
| testability | 3 | 3 | apply/max/testability | 88 | h heuristic | 4.4 |
| consequences | 2 | 4 | apply/max/consequences | 88 | h heuristic | 5.86 |
| uncertainty | 2 | 4 | apply/max/uncertainty | 88 | h heuristic | 5.86 |

Provenance letters: m measured · p proxy · h heuristic · o user-override · u unknown.

</details>

## Verify · Subscription

Status: **provisional-only**. No candidate is confirmed: every remaining candidate needs clarification (see reasons, e.g. unknown account availability or coefficients). None is recommended until the open values are set.
Quality floor: 78 on the 0–100 model score scale (demand 8500 bp).
Policy minimum-resource-with-time-penalty v1: candidates must pass the quality floor and critical factors; among them the smallest S = C × (1 + 0.05 × max(0, T − 30) / 30) is preferred, where C is the upper subscription load forecast and T the typical time in minutes. Extra quality only breaks ties (S ↑, C ↑, suitability ↓, IDs). S is a comparison criterion, not a price or quota draw; budget and quota checks use the original forecasts.

| # | Candidate | Group | Effort | Suitability 0–100 (heuristic) | Coverage | Relative load low / typical / high | Typical / high time, min | S for comparison (not a price) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Claude Opus 5.5 `claude-code/claude-opus-5-5` | provisional | max | 86 | 100% | 900 / 1800 / 4500 load units; ×6.00 (h); capacity unknown | 1170 / 2925 | 13050 load units (C × 2.9; exact 13050/1) | account availability is unknown |
| 2 | GPT-6 Astra `codex/gpt-6-astra` | provisional | max | 86 | 100% | 900 / 1800 / 4500 load units; ×6.00 (h); capacity unknown | 1170 / 2925 | 13050 load units (C × 2.9; exact 13050/1) | account availability is unknown |
| 3 | Gemini 4 Argon `antigravity/gemini-4-argon` | provisional | high | 83 | 100% | 450 / 900 / 2250 load units; ×3.00 (h); capacity unknown | 585 / 1462 | 4331.25 load units (C × 1.925; exact 17325/4) | account availability is unknown |
| 4 | Claude Sonnet 5.5 `claude-code/claude-sonnet-5-5` | below-threshold | max | 77.09 | 100% | 450 / 900 / 2250 load units; ×3.00 (h); capacity unknown | 900 / 2250 | 5512.5 load units (C × 2.45; exact 11025/2) | account availability is unknown; suitability 7709 < quality floor 7800 |
| 5 | GPT-6.1 Sol `codex/gpt-6.1-sol` | below-threshold | max | 77.09 | 100% | 450 / 900 / 2250 load units; ×3.00 (h); capacity unknown | 900 / 2250 | 5512.5 load units (C × 2.45; exact 11025/2) | account availability is unknown; suitability 7709 < quality floor 7800 |
| 6 | Gemini 4 Hydrogen `antigravity/gemini-4-hydrogen` | below-threshold | xhigh | 76.09 | 100% | 330 / 660 / 1650 load units; ×2.20 (h); capacity unknown | 660 / 1650 | 3382.5 load units (C × 2.05; exact 6765/2) | account availability is unknown; suitability 7609 < quality floor 7800 |
| 7 | GPT-6.1 Terra `codex/gpt-6.1-terra` | below-threshold | max | 68.18 | 100% | 315 / 630 / 1575 load units; ×2.10 (h); capacity unknown | 630 / 1575 | 3150 load units (C × 2; exact 3150/1) | account availability is unknown; suitability 6818 < quality floor 7800 |
| 8 | Claude Haiku 5.5 `claude-code/claude-haiku-5-5` | below-threshold | max | 56.28 | 100% | 180 / 360 / 900 load units; ×1.20 (h); capacity unknown | 450 / 1125 | 1530 load units (C × 1.7; exact 1530/1) | account availability is unknown; critical factor testability: coefficient 5900 < required 7000; suitability 5628 < quality floor 7800 |
| 9 | GPT-6 Luna `codex/gpt-6-luna` | below-threshold | max | 56.28 | 100% | 180 / 360 / 900 load units; ×1.20 (h); capacity unknown | 450 / 1125 | 1530 load units (C × 1.7; exact 1530/1) | account availability is unknown; critical factor testability: coefficient 5900 < required 7000; suitability 5628 < quality floor 7800 |
| 10 | Gemini 3.8 Flash `antigravity/gemini-3.8-flash` | below-threshold | high | 54.28 | 100% | 90 / 180 / 450 load units; ×0.60 (h); capacity unknown | 225 / 562 | 596.25 load units (C × 1.325; exact 2385/4) | account availability is unknown; critical factor testability: coefficient 5700 < required 7000; suitability 5428 < quality floor 7800 |

Quota pools:
- `antigravity-gemini` (Antigravity plan: Gemini models): antigravity/gemini-4-argon, antigravity/gemini-4-hydrogen, antigravity/gemini-3.8-flash — unknown; One shared quota: switching between these models does not create a new independent limit.
- `claude-plan` (Claude subscription plan): claude-code/claude-opus-5-5, claude-code/claude-sonnet-5-5, claude-code/claude-haiku-5-5 — unknown; One shared quota: switching between these models does not create a new independent limit.
- `codex-plan` (Codex subscription plan): codex/gpt-6-astra, codex/gpt-6.1-sol, codex/gpt-6.1-terra, codex/gpt-6-luna — unknown; One shared quota: switching between these models does not create a new independent limit.

<details><summary>Factor contributions for claude-code/claude-opus-5-5 @ max</summary>

| Factor | Level | Relevance | Estimate record | Score 0–100 | Provenance | Contribution |
| --- | --- | --- | --- | --- | --- | --- |
| volume | 4 | 4 | verify/max/volume | 86 | h heuristic | 6.49 |
| domains | 3 | 6 | verify/max/domains | 86 | h heuristic | 9.73 |
| layers | 4 | 4 | verify/max/layers | 86 | h heuristic | 6.49 |
| architecture | 4 | 8 | verify/max/architecture | 86 | h heuristic | 12.98 |
| logic | 3 | 6 | verify/max/logic | 86 | h heuristic | 9.73 |
| compatibility | 3 | 6 | verify/max/compatibility | 86 | h heuristic | 9.73 |
| testability | 3 | 9 | verify/max/testability | 86 | h heuristic | 14.6 |
| consequences | 2 | 6 | verify/max/consequences | 86 | h heuristic | 9.73 |
| uncertainty | 2 | 4 | verify/max/uncertainty | 86 | h heuristic | 6.49 |

Provenance letters: m measured · p proxy · h heuristic · o user-override · u unknown.

</details>

## Benchmark sources

- `aa-cai-2.1.antigravity.argon.high`: Artificial Analysis Coding Agent Index v2.1, index, antigravity/gemini-4-argon@high — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.claude-code.opus-5-5.max`: Artificial Analysis Coding Agent Index v2.1, index, claude-code/claude-opus-5-5@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.claude-code.sonnet-5-5.max`: Artificial Analysis Coding Agent Index v2.1, index, claude-code/claude-sonnet-5-5@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.codex.astra.max`: Artificial Analysis Coding Agent Index v2.1, index, codex/gpt-6-astra@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.codex.sol.max`: Artificial Analysis Coding Agent Index v2.1, index, codex/gpt-6.1-sol@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents
- `aa-cai-2.1.codex.terra.max`: Artificial Analysis Coding Agent Index v2.1, index, codex/gpt-6.1-terra@max — Artificial Analysis (independent) https://artificialanalysis.ai/agents/coding-agents

