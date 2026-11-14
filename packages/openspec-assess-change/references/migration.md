# Миграция конфигурации и смена политики выбора

| Пакет | config/overrides schema | Качество | Политика выбора |
| --- | --- | --- | --- |
| 0.1.0 | 1 | `base` + общая `effortDelta` (+ `byEffort`) | взвешенная utility |
| 0.2.0 | 2 | явная запись на фазу × effort × параметр | взвешенная utility |
| 0.3.0 | 3 | как в 2 | явное поле `selection.policy`: `minimum-resource-with-time-penalty` (default) или legacy `weighted-utility` |

Это **два разных шага**: миграция формата (числа и порядок сохраняются) и смена политики (намеренно может менять рейтинг). Старые документы не интерпретируются молча: CLI и конфигуратор отклоняют `schemaVersion: 1/2` с подсказкой.

## Шаг 1: миграция формата (v1/v2 → v3, legacy policy)

```bash
# overrides активного change (assessment/overrides.json v1 или v2) поверх поставлявшихся defaults той же версии
node bin/openspec-assess.mjs migrate-config --change <name> --out legacy.json

# или явные файлы
node bin/openspec-assess.mjs migrate-config --from-defaults old-defaults.json --overrides old-overrides.json --out legacy.json
```

Версия определяется по входам; по умолчанию старые defaults — `config/legacy/defaults-v1.json` или `config/legacy/defaults-v2.json` (точные копии поставок 0.1.0 и 0.2.0). Результат использует `selection.policy: weighted-utility` с прежними весами и якорями. Результат — полный config v2 для review/export; входные файлы не перезаписываются (`--out` должен отличаться от входов, существующий файл заменяется только с `--force`), запись в `assessment/runs/` запрещена.

## Шаг 2: явная смена политики

```bash
node bin/openspec-assess.mjs switch-policy --config legacy.json --out <changeRoot>/assessment/config.json [--grace-minutes 30 --interval-minutes 30 --rate-bp 500]
```

Сохраняются профиль, оценки качества и их provenance, исходные ресурсные записи, пороги, критические параметры, доступность, бюджет/квоты и прочие настройки; заменяется только правило сравнения. Прежние веса и якоря **удаляются** (они перечислены в `selection.basis` и в выводе команды, но не действуют скрыто и не пересчитываются в новые параметры); штраф времени начинается с g = 30, s = 30, k = 5 %. Порядок кандидатов может измениться — это ожидаемо и не является ошибкой миграции.

Чтобы использовать результат: сохраните его как `<changeRoot>/assessment/config.json` (подхватывается автоматически) или передавайте `--defaults <file>`; удалите или замените старый `assessment/overrides.json`. Входные файлы обоих шагов не перезаписываются.

## Правила формата v1

1. Старый effective config собирается из выбранных v1 defaults и overrides **по правилам v1** (`src/core/legacy/v1.mjs` — неизменённая копия кода 0.1.0).
2. Для каждого supported effort каждого параметра обеих фаз:
   - есть `byEffort[effort][factor]` → берётся это значение (приоритет v1 сохранён), статус и источники записи сохраняются;
   - иначе `clamp(base + effortDelta, 0, 10000)`; отсутствующая delta = 0; неизвестный base → `unknown` для всех efforts.
3. Происхождение: `base + 0` сохраняет статус base; `base + ненулевая delta` — составное значение → `heuristic` (или `user-override`, если обе части пользовательские); `measured` при другом effort источника → `proxy`. Источники, которые больше не выводят число, переходят в `support`. Исходные v1-данные (base, delta, признак clamping) сохраняются в `migratedFrom`. Миграция не создаёт измерений.
4. Ресурсы: `usageMultiplierBp`, `loadMultiplierBp`, `multiplierBp` → записи `resources.*` по фазе и effort (`heuristic`, либо `user-override`, если значение задавалось v1-override; отсутствующее → `unknown`).
5. Копируются без изменений: enabled, `efforts`, доступность, контекст, capabilities, идентичность, цены, quota pools, ограничения, веса фаз, пороги, workloads и предпочтения.

## Формат v2 → v3

Документы v2 отличаются от v3 только отсутствием `selection.policy`: правила merge те же. Defaults v2 и overrides v2 переводятся в v3 под legacy-политикой и сливаются по прежним правилам.

## Что проверено

- `test/migration.test.mjs` распаковывает настоящий пакет 0.1.0 (`test/fixtures/v1/openspec-assess-change-0.1.0.tgz`) и сравнивает его отчёт с отчётом нового evaluator на мигрированном config: suitability, вклады, utility, cost/load/time, рекомендуемый effort, остальные efforts, исключения и порядок совпадают — для подлинного v1-run из архива и для синтетического v1-config с `byEffort`, ненулевыми и отрицательными delta, clamping и unknown base.
- Для v2: подлинный run пакета 0.2.0 (`test/fixtures/v2`) пересчитывается после `migrate-config` с теми же числами и порядком.
- `switch-policy`: все записи, кроме `selection`, совпадают; качество каждого effort неизменно; порядок вычисляется по новой формуле и в примере действительно меняется.
- Новый run получает новый assessment-id и version identity; побайтовое совпадение со старым report не обещается.

## История не мигрирует

Открытие конфигуратора, `replay` и `check-freshness` не меняют прежние runs, manifests и `latest.json`. Replay run'а 0.1.0 или 0.2.0 новым пакетом завершается кодом 4 и сообщением «Install openspec-assess-change 0.1.0/0.2.0»; совместимые 0.1.0 и 0.2.0 воспроизводят свои runs байт в байт (проверено тестами на сохранённых пакетах). Новый `assess` после миграции добавляет отдельный run и запись в историю `latest.json`, старый run остаётся неизменным. Rollback — вернуть сохранённые v1 config/overrides и использовать release 0.1.0; ни новые, ни старые snapshots при этом не удаляются.

Обновление baseline (новые поставляемые оценки 0.2.0) — отдельный шаг: мигрированный config сохраняет **ваши прежние числа**, а не новые defaults.
