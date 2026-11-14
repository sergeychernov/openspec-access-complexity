# Benchmark snapshot и mapping

`config/benchmarks.json` — небольшие структурированные записи с атрибуцией. Тексты статей, закрытые datasets и содержимое задач не копируются; в отчёт попадают только записи, на которые ссылаются коэффициенты effective config (`benchmarks.snapshot.json` в каждом run).

## Запись (record)

Обязательно: `id`, `benchmark.name` + `benchmark.version`, `source` (`url`, `publisher`, `retrievedAt`, `kind`: `independent` | `provider-claim`), `model` (точные `modelId`, `harness`, `effort`), `metric`, `score` (целое), `unit` (`bp`, `count`, `micros`, `seconds`, `tokens`). По возможности — `attempts`, `uncertainty`, `conditions`.

Правила (проверяются `benchmarksErrors`/`provenanceErrors`):

- одно измерение (benchmark+версия, модель, harness, effort, metric) встречается один раз — повтор в другом источнике не увеличивает вес;
- заявления провайдера (`provider-claim`) не могут обосновать `measured`;
- разные версии benchmark не сравниваются без явного mapping для каждой версии.

## Sources и support

В записи оценки `sources` — записи, из которых **выведено** число (только `measured` и `proxy`, нужен mapping); `support` — свидетельства, которые подтверждают общее предположение (например, порядок моделей), но не вычисляют число; они не меняют статус `heuristic`.

## Mapping benchmark → фактор

Отдельные версионированные записи `mappings`: `benchmark` + `metric` → `phase` + `factor`, `relation` = `direct` | `proxy`, `rationale`. Коэффициент `measured` требует независимую запись **того же** кандидата (и effort для `byEffort`) и mapping `direct`; иначе — `proxy`. Измерение общей реализации не становится измерением verify или архитектуры автоматически: нет mapping — ссылка на запись отклоняется.

## Снимок 2026-11-14

Источник: публичная страница [Artificial Analysis — Coding Agents](https://artificialanalysis.ai/agents/coding-agents) (методология: [coding-agents-benchmarking](https://artificialanalysis.ai/methodology/coding-agents-benchmarking/)). Coding Agent Index v2.1 = равновзвешенная композиция FrontierCode-AA 2.0 (132 задачи), Terminal-Bench 4.1 (66), SWE-Atlas-QnA-AA (124); каждая задача — среднее по трём попыткам; агент запускается в своём harness.

| Кандидат | Effort | Index v2.1 |
| --- | --- | --- |
| claude-code / claude-opus-5-5 | max | 58 |
| claude-code / claude-sonnet-5-5 | max | 56 |
| codex / gpt-6-astra | max | 53 (26.0 мин и 7.63 USD на задачу) |
| codex / gpt-6.1-sol | max | 52 |
| codex / gpt-6.1-terra | max | 49 |
| antigravity / gemini-4-argon | high | 45 |

Mapping: индекс → apply × {`volume`, `domains`, `layers`, `architecture`, `logic`} как **proxy** (агрегированная доля решённых задач не является прямым измерением отдельного фактора). Mapping на verify нет. В поставке 0.2.0 ни одно число не выведено из индекса: записи указаны как `support` эвристических apply-оценок (индекс подтверждает порядок tiers внутри harness). Mapping остаётся в снимке для явного proxy с вашим правилом преобразования и для v1-конфигураций, перенесённых миграцией. Для Haiku 5.5, Luna, Hydrogen и Flash в снимке записей нет — их коэффициенты остаются эвристикой. Отдельные лидерборды SWE-bench и Terminal-Bench для этого снимка не проверялись; их записи можно добавить по правилам ниже (с отдельной версией benchmark и mapping).

## Как добавить данные

1. Найдите результат для точного `modelId` + `harness` + `effort` и версии benchmark; запишите record с URL и датой.
2. Добавьте mapping с обоснованием (или используйте существующий для той же версии и метрики).
3. Укажите ID записи в `sources` коэффициента и выберите статус по правилам выше; `npm test` проверит provenance.
4. Локальная калибровка по собственным завершённым changes — следующий шаг; в v1 автоматического обучения нет.
