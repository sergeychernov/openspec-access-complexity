# Каталог моделей и происхождение коэффициентов

`config/defaults.json` генерируется скриптом `scripts/build-defaults.mjs` из компактных таблиц с комментариями; `npm run check` проверяет, что файл совпадает с генератором. Версии закреплены: автоматического «latest» нет, новая версия появляется только при ручном изменении.

## Стартовый каталог (проверено 2026-11-14)

| Harness | Семейство | Версия | modelId / client ID | Efforts | Контекст | Статус идентичности |
| --- | --- | --- | --- | --- | --- | --- |
| codex | Astra | GPT-6 Astra | `gpt-6-astra` | low, medium, high, xhigh, max | 1.05M | confirmed |
| codex | Sol | GPT-6.1 Sol | `gpt-6.1-sol` | low…max | 1.05M | confirmed |
| codex | Terra | GPT-6.1 Terra | `gpt-6.1-terra` | low…max | 1.05M | confirmed (Codex CLI ≥ 0.159.0) |
| codex | Luna | GPT-6 Luna | `gpt-6-luna` | low…max | 1.05M | confirmed |
| claude-code | Opus | Claude Opus 5.5 | `claude-opus-5-5` | low, medium, high, xhigh, max | 1M | confirmed |
| claude-code | Sonnet | Claude Sonnet 5.5 | `claude-sonnet-5-5` | low…max | 1M | confirmed |
| claude-code | Haiku | Claude Haiku 5.5 | `claude-haiku-5-5` | low…max | 1M | confirmed |
| antigravity | Argon | Gemini 4 Argon | catalog key `gemini-4-argon`, client ID — null | low, medium, high | — | unconfirmed |
| antigravity | Hydrogen | Gemini 4 Hydrogen | catalog key `gemini-4-hydrogen`, client ID — null | low, medium, high, xhigh («Extra») | — | unconfirmed |
| antigravity | Flash | Gemini 3.8 Flash | catalog key `gemini-3.8-flash`, client ID — null | low, medium, high | — | unconfirmed |

Источники: [OpenAI models](https://developers.openai.com/api/docs/models), [Codex models](https://learn.chatgpt.com/docs/models), [Claude models overview](https://platform.claude.com/docs/en/about-claude/models/overview), [Claude Code model configuration](https://code.claude.com/docs/en/model-config), [Antigravity models](https://antigravity.google/docs/models).

Примечания:

- Для Codex в каталог входят значения effort из API-документации от `low` до `max`; `none` и Codex-уровень `ultra` не включены, так как страница Codex не даёт их списка по моделям.
- Antigravity не публикует идентификаторы моделей (страница отсылает к `agy models`), поэтому `clientModelId` равен `null` и не синтезируется из display name. `modelId` здесь — ключ каталога.
- Публичная доступность ≠ доступность аккаунту: `availability` по умолчанию `unknown`, и такой кандидат остаётся `provisional`. Укажите `available`/`unavailable` в overrides (см. `examples/demo-project/.../assessment/overrides.json`).

## Записи оценок (config schema 2)

Единица настройки качества — версия модели + harness + фаза + параметр + supported effort. Каждая такая комбинация — отдельная запись `models[].quality[phase][effort][factor]`:

```json
{ "value": 8200, "status": "heuristic", "basis": "prior for GPT-6 Astra apply at effort medium: 82/100 …", "support": ["aa-cai-2.1.codex.astra.max"] }
```

- `value` — целое 0–10000 bp (в интерфейсе 0–100) или `null` при `status: "unknown"`.
- `sources` — записи benchmark, из которых **выведено** это число; допустимы только для `measured` и `proxy` и требуют mapping (см. [benchmarks.md](benchmarks.md)).
- `support` — свидетельства, подтверждающие общее предположение (например, порядок моделей), но не вычисляющие число; допустимы при любом статусе.
- `inheritedFrom` — исходная модель/harness/статус при переносе на новую версию.
- `origin` — исходная запись, которую заменило пользовательское значение или явное «Нет данных»: её значение, статус, основание и sources хранятся отдельно от текущего объяснения пользователя.
- `migratedFrom` — исходные v1-данные записи после `migrate-config`.

Каждый supported effort, включая не разрешённые для рекомендаций, имеет записи всех параметров для обеих фаз; отсутствие записи — ошибка, отсутствие данных — запись `unknown`. Так же устроены ресурсы: `resources.api.usage`, `resources.subscription.load`, `resources.time.minutes` с полем `unit` (`token-workload-multiplier-bp`, `load-workload-multiplier-bp`, `time-workload-multiplier-bp`; 10000 = ×1.0 нагрузки категории) и записью на фазу × effort.

| Статус | Буква | Значение |
| --- | --- | --- |
| `measured` | m | независимое измерение **этого** кандидата при **этом** effort с mapping `direct` на фазу/параметр (в поставке таких нет) |
| `proxy` | p | число получено по явному mapping из связанного измерения (другая фаза, параметр, effort или версия) |
| `heuristic` | h | выбранный приор с описанным основанием, без воспроизводимого вывода числа из измерения |
| `user-override` | o | значение пользователя; исходная запись — в `origin` |
| `unknown` | u | численного значения нет; не равно нулю |

## Поставляемые значения

- Качество — таблица `QUALITY` в `scripts/build-defaults.mjs`: для каждой модели, фазы и effort явно записана оценка 0–100 для «обычных» параметров; для глубоких (`architecture`, `logic`, `consequences`, `uncertainty`) приор tier уменьшает её на 0/2/4/6 пунктов (frontier/strong/balanced/economy). Пример: Astra apply low/medium/high/xhigh/max = 74/82/85/87/88, verify — 72/80/83/85/86; у economy-моделей (Luna, Haiku) xhigh и max равны 63 — прироста выше xhigh не предполагается. Общей effort delta нет; все значения `heuristic`.
- Для шести кандидатов независимый Artificial Analysis Coding Agent Index v2.1 указан в `support` apply-записей `volume`, `domains`, `layers`, `architecture`, `logic`: индекс согласуется с порядком tiers внутри harness (`test/catalog.test.mjs`), но не вычисляет 82, поэтому оценка остаётся `heuristic`. Результат при max не выдаётся за измерение low и не используется для verify.
- Ресурсы — явные записи по модели, фазе и effort (`RES` по tier: множители токенов ×0.6/1/1.5/2.2/3, нагрузки и времени — по tier); одинаковые значения у моделей одного tier означают отсутствие помодельных измерений, а не общую кривую, и редактируются помодельно.
- Политики фаз (`relevanceWeights`, `qualityFloors`, `criticalFactors`) описаны в их `basis`. Выбор (`selection`, config schema 3): `policy: minimum-resource-with-time-penalty`, `policyVersion: 1`, `timePenalty` = { `graceMinutes` 30, `intervalMinutes` 30, `rateBp` 500 } отдельно для API и подписки. Это публичная политика, не benchmark-факт; веса и якоря прежней utility в ней запрещены.

## Пользовательские overrides (overrides schema 3)

Порядок: базовый config (поставляемый `config/defaults.json`, либо `--defaults <file>`, либо `<changeRoot>/assessment/config.json`) ← явный `--overrides <file>` (или `<changeRoot>/assessment/overrides.json`). Merge идёт по известным ключам схемы, списки с `id` — по `id`, записи оценок — по записи:

```json
{ "kind": "openspec-assess.overrides", "schemaVersion": 3,
  "set": { "models": [ { "id": "codex.sol", "quality": { "apply": { "high": { "architecture": { "value": 9100, "basis": "по опыту в этом репозитории" } } } } } ] } }
```

- `{ "value": n }` → `user-override` c `origin` = заменённая запись; `{ "value": null }` → явный `unknown` с `origin`.
- Частичный override наследует только **ту же** запись defaults, а не соседний effort или фазу. Остальные записи, ресурсы и сложность change не меняются.
- Запись с явным `status` заменяет запись целиком (так экспортирует конфигуратор, вместе с `origin`).
- Отсутствующее поле наследуется; явные `0`, `false` и `null` — значения; неизвестный ключ — ошибка с путём. Reset = удалить override записи: возвращается запись defaults с её provenance.
- Пример настройки политики: `"selection": { "api": { "timePenalty": { "rateBp": 0 } } }` — отключить учёт времени для API (остальные параметры наследуются).
- Документы v1 и v2 (`schemaVersion: 1/2`) отклоняются с подсказкой выполнить [миграцию](migration.md); старые числа и старая политика не трактуются молча по новым правилам.

## Как обновить модель (ручная процедура)

1. Проверьте новую версию на первичной странице вендора: точный ID, efforts, контекст, цену.
2. Для локальной замены создайте override:
   ```json
   { "kind": "openspec-assess.overrides", "schemaVersion": 3,
     "set": { "models": [ { "id": "codex.sol", "modelId": "gpt-6.2-sol", "displayName": "GPT-6.2 Sol" } ] } }
   ```
   Записи, не заданные явно, переносятся с `inheritedFrom` (прежние modelId/harness/статус): `heuristic` остаётся `heuristic`, `proxy` — `proxy`, `measured` прежней версии становится `proxy` (измерение не приписывается новой версии). `identity.status` становится `unconfirmed`, старый `clientModelId` сбрасывается.
3. Если у новой версии другой набор efforts, задайте `supportedEfforts` и **явные** записи качества и ресурсов для каждого нового effort в обеих фазах (при отсутствии данных — `unknown`).
4. Известные оценки задайте явно (`user-override`) или добавьте benchmark-записи и mapping.
5. Для изменения поставки: правьте таблицы в `scripts/build-defaults.mjs`, запустите `npm run defaults && npm test`.

Прежние assessment snapshots не меняются: каждый run хранит свой `config.snapshot.json`, а replay использует только его.
