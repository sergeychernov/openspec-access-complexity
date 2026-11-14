# openspec-assess-change

Переносимый skill для [OpenSpec](https://github.com/Fission-AI/OpenSpec): агент составляет **доказательный профиль** change (объём, домены, слои, архитектура, логика, совместимость, проверяемость, последствия ошибки, неопределённость), а Node.js CLI детерминированно считает свойства change и **четыре рейтинга моделей**: apply/API, verify/API, apply/subscription, verify/subscription. По умолчанию рекомендуется **самый экономичный вариант с достаточным качеством**: сначала порог качества и критические параметры, затем минимальный S = C × (1 + 0.05 × max(0, T − 30)/30), где C — верхний прогноз стоимости или нагрузки, T — типичное время в минутах. Результат сохраняется внутри change, уходит в archive вместе с ним и воспроизводится байт в байт.

Окончательный выбор модели остаётся за владельцем: skill не переключает модели, не запускает apply/verify, не отмечает задачи и не архивирует change.

- Один `SKILL.md` и один evaluator для **Codex**, **Claude Code** и **Antigravity IDE**.
- Без SDK, сети, часов и вызовов моделей: Node.js ≥ 22, Git и OpenSpec CLI 2.x.
- Оценка модели задаётся отдельно для каждой фазы, параметра и supported effort (без общей прибавки к базе) и показывается по шкале 0–100 (хранится 0–10000 bp). Пригодность — эвристическая оценка соответствия, **не вероятность успеха**. У каждой записи своё происхождение: m measured / p proxy / h heuristic / o user-override / u unknown.

## Быстрый старт

```bash
# в репозитории с OpenSpec, после propose
node <pkg>/bin/openspec-assess.mjs template --change <name> --write   # профиль: всё unknown
# … агент заполняет assessment/profile.json по references/rubric.md …
node <pkg>/bin/openspec-assess.mjs pin-evidence --change <name>       # digest источников
node <pkg>/bin/openspec-assess.mjs validate-profile --change <name>
node <pkg>/bin/openspec-assess.mjs assess --change <name>             # run + report.md
node <pkg>/bin/openspec-assess.mjs check-freshness --change <name>
node <pkg>/bin/openspec-assess.mjs replay openspec/changes/archive/<date>-<name>/assessment
node <pkg>/bin/openspec-assess.mjs configure                          # матрица параметр × модель на 127.0.0.1
node <pkg>/bin/openspec-assess.mjs migrate-config --change <name> --out <file>  # явная миграция формата v1/v2 → v3 (legacy policy)
node <pkg>/bin/openspec-assess.mjs switch-policy --config <file> --out <file>     # явная смена политики выбора
```

Общие флаги: `--defaults <file>` (базовый config вместо поставляемого; по умолчанию `<changeRoot>/assessment/config.json`, если есть), `--store <id>` (OpenSpec store; передаётся во все вызовы `openspec`), `--overrides <file>` (по умолчанию `<changeRoot>/assessment/overrides.json`), `--as-of <UTC>` (время для наблюдений квоты; часы не читаются), `--repo-root <dir>`, `--json`. Коды выхода: 0 ok · 1 невалидно/stale/расхождение · 2 usage · 3 разрешение change · 4 несовместимая версия.

## Публичный пример

```bash
cd packages/openspec-assess-change
node examples/run-example.mjs
```

Во временной копии `examples/demo-project` (искусственный change `add-shout-flag` с заполненным профилем) пример выполняет: git init → pin-evidence → validate → assess (четыре рейтинга) → freshness → отметка задач → **настоящий `openspec archive`** → проверка digest → изменение рабочего дерева → replay из архива → сравнение с `examples/golden/` (assessment id, `report.json`, `report.md`). Ожидаемый вывод:

```
4. Assessment 1950295a…
   apply/api            ok   top: codex/gpt-6-luna @medium
   apply/subscription   ok   top: claude-code/claude-haiku-5-5 @medium
   verify/api           ok   top: codex/gpt-6-luna @medium
   verify/subscription  ok   top: codex/gpt-6.1-terra @low
…
8. Result matches examples/golden/ (assessment id, report.json, report.md)
```

Для крошечного демо-change (3 файла, низкий риск) наверх выходят экономичные модели: их качество проходит порог, а более сильные варианты дороже — это и есть политика «дешевейший достаточный». В примере доступность для аккаунта задана overrides: Codex и Claude Code — `available`, Antigravity — не проверена, поэтому его модели в списке `provisional` с причиной. С defaults без overrides все кандидаты `provisional`, а статус рейтинга — `provisional-only` (рекомендации нет, пока не указана доступность).

## Как это устроено

| Документ | О чём |
| --- | --- |
| [SKILL.md](SKILL.md) | инструкции агенту: когда вызывать, как заполнить профиль, правила |
| [references/rubric.md](references/rubric.md) | факторы, шкала 0–4 с якорями, measured/declared/estimated, known/unknown/not-applicable, evidence |
| [references/formula.md](references/formula.md) | пригодность, пороги, критические факторы, utility, сортировка, проверки |
| [references/catalog.md](references/catalog.md) | каталог десяти семейств, происхождение коэффициентов, overrides, ручное обновление модели |
| [references/benchmarks.md](references/benchmarks.md) | benchmark snapshot, mapping, правила provenance |
| [references/cost.md](references/cost.md) | API-стоимость по категориям, подписки, quota pools, as-of |
| [references/layout.md](references/layout.md) | `assessment/` внутри change, атомарная запись, freshness vs replay, archive |
| [references/configurator.md](references/configurator.md) | локальный конфигуратор |
| [references/clients.md](references/clients.md) | подключение к Codex, Claude Code, Antigravity и smoke discovery |
| [references/migration.md](references/migration.md) | миграция формата v1/v2 → v3, явная смена политики выбора, история и rollback |

Структура пакета: `src/core/` — pure ESM (без `node:*`, работает и в браузере), `src/node/` — I/O, OpenSpec, Git, хранение, сервер; `bin/` — CLI; `config/` — defaults и benchmark snapshot (генерируются/проверяются скриптами в `scripts/`); `schemas/` — JSON Schema всех контрактов (`profile`, `config`, `overrides`, `benchmarks`, `manifest`, `latest`, `report`, версия 1, неизвестные поля запрещены); `configurator/`; `examples/`.

## Подключение к клиентам

```bash
node packages/openspec-assess-change/scripts/install-skill.mjs --project . 
```

Копирует пакет в `.agents/skills/openspec-assess-change` (Codex, Antigravity) и связывает с ним `.claude/skills/openspec-assess-change` (Claude Code), затем проверяет, что все три расположения дают одинаковые digest `SKILL.md` и version identity. Подробности и ручная проверка в клиентах — [references/clients.md](references/clients.md).

### Проверено в клиентах

`scripts/smoke-clients.mjs` (2026-11-14, macOS, пакеты 0.2.0 и 0.3.0): Codex CLI 0.169.0, Claude Code 2.1.325 и Antigravity CLI (agy) 1.5.9 обнаруживают skill с одинаковым digest `SKILL.md` и version identity, без обращения к модели. Antigravity не обнаруживает папку-symlink, поэтому установщик по умолчанию копирует пакет. Подробности — [references/clients.md](references/clients.md).

## Проверки

```bash
npm test                  # unit + lifecycle (реальные OpenSpec CLI и Git во временных каталогах)
npm run test:integration  # archive + публичный пример с golden
npm run check             # schemas/ и config/defaults.json совпадают с генераторами
```

Тесты не требуют сети, credentials и платных моделей. Для integration нужен OpenSpec CLI версии из `package.json` (`openspecAssess.openspecCli.tested`, сейчас 2.0.0) — без него тест падает, а не пропускается. CI: `.github/workflows/openspec-assess-change.yml` (Node 22/24/26 × Ubuntu/macOS/Windows).

## Ограничения

- Профиль — суждение агента: детерминизм гарантируется для расчёта по закреплённым входам, а не для повторного чтения prose другим агентом.
- Независимых измерений по отдельным факторам и по verify нет; поставка честно помечает это (proxy/heuristic) — см. [benchmarks](references/benchmarks.md).
- Стоимость и нагрузка — сценарные прогнозы без калибровки на ваших задачах; проценты квоты подписки не выдумываются.
- Лицензия, release и способ распространения ещё не выбраны (`private: true`, `UNLICENSED`).
