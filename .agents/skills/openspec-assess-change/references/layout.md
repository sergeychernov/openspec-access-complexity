# Хранение, freshness, replay и archive

## Layout внутри change

```
<changeRoot>/assessment/
  profile.json            рабочий профиль (редактируется)
  overrides.json          необязательные пользовательские overrides (schema 3) для этого change
  config.json             необязательный базовый config вместо поставляемого (например, результат migrate-config)
  latest.json             указатель на последний завершённый run + история (assessmentId, stage)
  runs/<assessment-id>/   immutable snapshot
    profile.json             профиль на момент расчёта
    config.snapshot.json     effective config
    benchmarks.snapshot.json использованные benchmark-записи и mapping
    manifest.json            версии, digest входов/выходов и источников
    report.json              машинный отчёт
    report.md                читаемый отчёт
```

`changeRoot` берётся из `openspec status --change <name> --json` (с выбранным `--store`). CLI не создаёт `openspec/` и не пишет в другие changes. Все файлы — канонический JSON/Markdown с LF и завершающим переводом строки, без абсолютных путей машины, времени выполнения и секретов: их можно коммитить вместе с change.

`assessment-id` = SHA-256 канонического `{profile, effective config, benchmark snapshot, version identity, asOf}`. Version identity — версии пакета, evaluator, renderer, правил нормализации и всех схем; изменение семантики любого из них меняет id.

## Запись run

1. Проверить profile (структура + локальные evidence), разрешить пути через `realpath` и убедиться, что `assessment/`, `runs/`, `latest.json` и `profile.json` остаются внутри changeRoot (symlink наружу → отказ до записи).
2. Рассчитать отчёт, записать run во временный `assessment/.tmp-…`, повторно проверить manifest и digest, затем `rename` в `runs/<id>`.
3. Только после этого атомарно заменить `latest.json` (временный файл + fsync + rename).

Повтор с теми же входами проверяет существующий run и переиспользует его (история не дублируется). Ошибка валидации или прерванная запись не меняет `latest.json`; незавершённый `.tmp-*` может остаться, но не попадает в `runs/` и не становится текущим.

## Freshness ≠ replay

| | `check-freshness` | `replay` |
| --- | --- | --- |
| Вопрос | Описывает ли оценка **текущий** change? | Можно ли **воспроизвести** исторический результат? |
| Читает | текущие planning-артефакты, evidence, scope, рабочий profile, config, версию evaluator | только файлы run |
| Stale/ошибка, если | изменились артефакты (кроме отметок `[x]` в tasks.md), источник evidence или diff, текст выбранных задач, рабочий profile, defaults/overrides/effective config или version identity | повреждён manifest, не совпал digest или content address, несовместима версия evaluator |
| Пишет | ничего | ничего |

Runs, созданные пакетами 0.1.0 (evaluator 1) и 0.2.0 (evaluator 2), новый пакет не пересчитывает: replay сообщает нужную версию (`Install openspec-assess-change 0.1.0` / `0.2.0`), даже после смены политики выбора. Миграция конфигурации не трогает историю — см. [migration.md](migration.md).

Replay архивной оценки не подтверждает, что историческое evidence соответствует текущим файлам. Несовместимый evaluator сообщает нужную версию пакета (`Install openspec-assess-change X`), а не пересчитывает новым алгоритмом; код из snapshot не исполняется.

## Archive

`openspec archive <change>` (проверено с OpenSpec CLI 2.0.0) переносит каталог change целиком в `openspec/changes/archive/YYYY-MM-DD-<change>/`, включая `assessment/`. Интеграционный тест `test/integration/archive.test.mjs` архивирует change с planning- и verification-run, сверяет digest всех файлов до и после и выполняет replay из архива; `examples/run-example.mjs` делает то же для публичного примера и сравнивает результат с `examples/golden/`.

```bash
node bin/openspec-assess.mjs replay openspec/changes/archive/2026-11-14-add-shout-flag/assessment
```
