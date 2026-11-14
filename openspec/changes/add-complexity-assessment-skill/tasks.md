# Tasks

## 1. Пакет и контракты данных

- [x] 1.1 Создать структуру переносимого ESM-пакета, package metadata и CLI entrypoint; закрепить поддерживаемые Node.js/OpenSpec версии и проверить запуск из чистого checkout без SDK клиентов.
- [x] 1.2 Описать schemas для profile, config, benchmark records, manifest и report с versioning и запретом неизвестных полей; проверить valid fixtures и отклонение неподдерживаемых версий, типов и дублирующихся IDs.
- [x] 1.3 Описать factor IDs, шкалу 0–4 с якорями, measured/declared/estimated и known/unknown/not-applicable; проверить на примерах большого механического и малого критичного change.
- [x] 1.4 Реализовать canonical serialization, integer arithmetic, digest и version identity, включающую семантику evaluator/renderer; проверить перестановку JSON keys, stable output bytes и отсутствие влияния locale.

## 2. Профиль change и evidence

- [x] 2.1 Реализовать validate-profile с проверкой диапазонов, обоснований, evidence references и локальных digest; проверить missing evidence, планируемый новый файл и изменившийся источник.
- [x] 2.2 Реализовать независимые volume/complexity/risk/uncertainty и явную обработку unknown/not-applicable; проверить, что изменение model config не меняет свойства change.
- [x] 2.3 Добавить planning и verification profiles, task scope, ranges и привязку к фактическому diff; проверить сохранение distinction estimate/measured и ссылку verification на исходную оценку.
- [x] 2.4 Документировать rubric и подготовить образец профиля с evidence для искусственного change; проверить его валидатором и проверить разрешение всех локальных ссылок.

## 3. Каталог моделей и benchmark baseline

- [x] 3.1 Составить стартовый каталог десяти согласованных семейств с точными версиями, client IDs, supported efforts и sources; проверить соответствие model/harness IDs и наличие записи для каждого семейства.
- [x] 3.2 Подготовить benchmark snapshot и mapping benchmark → factor по сопоставимым независимым измерениям; проверить provenance, единицы, benchmark versions, отсутствие дублирования одного измерения и маркировку proxy/heuristic при пробелах.
- [x] 3.3 Сформировать начальные apply/verify matrices, relevance weights, quality thresholds и economy preferences; документировать основания всех коэффициентов и проверить, что ни одно эвристическое значение не помечено measured.
- [x] 3.4 Реализовать effective config merge defaults → overrides по IDs; проверить сохранение 0/false, отклонение неизвестных keys и нулевой суммы применимых весов.
- [x] 3.5 Реализовать ручную смену model version/harness с inherited evidence и пользовательскими overrides; проверить, что обновление config не меняет прежние snapshots, и документировать процедуру обновления каталога.

## 4. Оценка расхода

- [x] 4.1 Реализовать API usage/pricing profiles по фазе и effort с диапазонами и непересекающимися billable categories; проверить cache read/write, reasoning, tool charges и отсутствие двойного учёта.
- [x] 4.2 Добавить явные tiers, context rules, валюту и unknown pricing/usage; проверить, что неполные данные не дают нулевой стоимости, и документировать сценарный характер прогноза.
- [x] 4.3 Реализовать отдельные subscription load profiles, optional quota observations и общие pools; проверить отсутствие преобразования API-price → квота и отсутствие дублирования общей квоты.
- [x] 4.4 Реализовать freshness quota observations по явно переданному as-of и реакцию на известный недостаток бюджета; проверить одинаковые результаты при разных системных часах и показать unknown capacity без observation.

## 5. Рейтинги и объяснения

- [x] 5.1 Реализовать candidate expansion по поддерживаемым efforts и обязательные ограничения; проверить disabled, неподдерживаемый effort, недостаточный context и неизвестное критическое ограничение.
- [x] 5.2 Реализовать phase suitability, quality floors и coverage по design; проверить отдельные apply/verify matrices, unknown coefficients, not-applicable и невозможность компенсировать hard constraint низкой ценой.
- [x] 5.3 Реализовать utility с фиксированными normalization anchors и отдельными API/subscription preferences; проверить, что добавление постороннего кандидата не меняет индивидуальные scores остальных.
- [x] 5.4 Реализовать stable sorting и выбор рекомендуемого effort для model + harness; проверить ties, incomplete economic data, отсутствие eligible кандидатов и порядок по ID без localeCompare.
- [x] 5.5 Сформировать четыре рейтинга и explanation trace в JSON/Markdown; проверить factor contributions, источники, исключения, uncertainty и отсутствие неподтверждённых вероятностей успеха.
- [x] 5.6 Документировать формулу и выполнить golden/metamorphic tests: одинаковые входы дают одинаковый output, изменение phase weights влияет только на нужную фазу, снижение расхода не ухудшает economic utility при прочих равных.

## 6. Хранение в change и archive

- [x] 6.1 Реализовать разрешение OpenSpec root/changeRoot/store и проверку planning readiness; проверить неоднозначный change, отсутствующий root и external store без создания лишнего openspec-каталога.
- [x] 6.2 Реализовать assessment/profile.json, content-addressed runs, effective snapshots и manifest; проверить, что профиль и все результаты находятся внутри change и пригодны для Git.
- [x] 6.3 Реализовать завершение run и atomic latest update с path containment; проверить повтор одинаковых входов, symlink escape, прерывание записи и сохранность предыдущего latest.
- [x] 6.4 Реализовать check-freshness по artifact/scope/diff/config digests; проверить изменение design и конфигурации, явные причины stale и сохранение истории planning/verification.
- [x] 6.5 Реализовать read-only replay по snapshots с проверкой version identity и integrity; проверить изменившийся рабочий repo, повреждённый manifest и несовместимую версию evaluator без переписывания истории.
- [x] 6.6 Проверить настоящий OpenSpec archive на временном завершённом fixture: весь assessment переносится, digest совпадают и replay работает из archive; документировать layout и отличие freshness от historical replay.

## 7. Конфигуратор

- [x] 7.1 Создать локальную таблицу параметр × модель с apply/verify, effort, источниками и отдельными API/subscription settings; проверить редактирование всех полей и отображение ошибок schema в интерфейсе.
- [x] 7.2 Подключить preview к тому же pure evaluator, добавить import/export и reset выбранных defaults; проверить совпадение CLI/UI output и сохранение исходных файлов до явного export.
- [x] 7.3 Добавить loopback-only static server без произвольной записи файлов и внешних ресурсов; проверить offline-сценарий в браузере и документировать запуск/остановку configurator.

## 8. Общий skill и сквозная приёмка

- [x] 8.1 Написать общий SKILL.md с подготовкой evidence-профиля, вызовом после propose и повторной оценкой перед verify; проверить frontmatter, references и отсутствие автоматического запуска реализации или смены модели.
- [x] 8.2 Проверить актуальные механизмы подключения пакета в Codex, Claude Code и Antigravity IDE и документировать их; выполнить smoke discovery одного version/digest во всех трёх клиентах без платного inference.
- [x] 8.3 Подготовить README и воспроизводимый публичный example change → profile → four rankings → archive → replay; выполнить команды примера из чистого checkout и сверить golden result.
- [x] 8.4 Подключить CI для поддерживаемых Node/OS и закреплённого OpenSpec; проверить полный offline suite и archive integration без credentials, публикации и пропуска обязательных проверок.

## 9. Уточнения конфигуратора и effort-оценок

Отметки разделов 1–8 относятся к начальной реализации. Требования этого раздела добавлены после её проверки и принимаются отдельно; существующие отметки не подтверждают выполнение новых требований.

- [x] 9.1 Ввести версионированные config/override contracts с полной матрицей модель/harness × apply/verify × factor × supported effort, отдельными значением и provenance, explicit unknown и исходным основанием overrides; проверить отсутствующие записи, неподдерживаемые efforts, изоляцию override/reset, сохранение 0 и отказ от скрытого наследования соседнего effort.
- [x] 9.2 Пересмотреть defaults и benchmark mapping: явно задать каждую effort-оценку, документировать источник числа или heuristic/unknown и убрать универсальные quality deltas. Проверить tier-based значения, независимость apply/verify, равные и немонотонные scores, отсутствие ложных measured/proxy и сохранение исходной идентичности при inherited.
- [x] 9.3 Ввести явные редактируемые API usage, subscription load и time records по модели/harness, фазе и effort с единицами и собственным provenance; проверить неизвестные значения, сохранение прежних численных resource-настроек при миграции и отсутствие автоматической связи расхода с качеством.
- [x] 9.4 Перевести evaluator и explanation trace на точные effort-записи без base + delta fallback; проверить coverage/provisional для unknown, изменение только выбранной комбинации и одинаковые четыре рейтинга в CLI/UI при одинаковых входах.
- [x] 9.5 Добавить понятные подписи и доступные подсказки weights/оценок, ввод и отображение качества 0–100 с целыми bp внутри; проверить точный round-trip 0/82/82.01/100, неверный диапазон/точность, явный unknown, подписи единиц и отсутствие влияния отображения на ранги.
- [x] 9.6 Добавить независимый селектор отображаемого effort каждой модели и «Все уровни» с редактированием factor × supported effort текущей фазы; проверить независимость просмотра от allowed efforts, config digest и рейтингов, отдельный provenance каждой ячейки.
- [x] 9.7 Заменить длинные provenance chips кругами p/h/o/u/m с общей легендой и подробностями; проверить tooltip по наведению/фокусу, полную доступную подпись, активацию с клавиатуры, различимость без цвета и сохранение полных status IDs в JSON.
- [x] 9.8 Реализовать явную миграцию старого effective config с приоритетом byEffort перед clamp(base + delta), unknown и сохранением исходного provenance; проверить прежние численные scores/ресурсы/порядок, отсутствие автоматической миграции архивов, неизменность старых manifests/latest и read-only replay совместимой версией.
- [x] 9.9 Обновить formula/catalog/configurator references, JSON schemas, examples и версионные identities evaluator/renderer; выполнить подходящие schema, golden, metamorphic, UI и archive/replay проверки. Документировать различия весов, сложности профиля и качества, источники чисел и процедуру миграции; новые fixtures не выдавать за прежние исторические snapshots.


## 10. Экономичный выбор при достаточном качестве

Отметки разделов 1–9 относятся к предыдущим этапам реализации. Новая политика намеренно заменяет взвешенную utility и может менять рейтинг; прошлые отметки не подтверждают новые требования.

- [x] 10.1 Ввести явную policy/version и конфигурацию минимизации расхода отдельно для API/subscription: верхний resource-прогноз, typical-время, 30 минут без штрафа, интервал 30 минут и коэффициент 0.05 (500 bp). Проверить schema, default/override merge, допустимые диапазоны, выключение штрафа коэффициентом 0 и отсутствие скрытого действия старых weights/anchors.
- [x] 10.2 Реализовать S = C × (1 + k × max(0, T − g) / s) без насыщения и с точным сравнением дробных значений; сохранить quality floor/critical gates и единый comparator для efforts и моделей: S ↑, C ↑, F ↓, stable IDs. Проверить, что избыток качества не компенсирует больший S и время до порога не участвует в tie-break.
- [x] 10.3 Обработать неизвестные C/T без нулевых подстановок и экономической рекомендации при отсутствии полного подходящего варианта; обновить report/trace/preview для исходных диапазонов, параметров штрафа, точного S и причин выбора. Проверить, что budget/quota используют исходный расход, а не S.
- [x] 10.4 Заменить настройки прежней utility в конфигураторе настройками новой политики с понятными единицами; при очистке nullable-поля качества или ресурсов сохранять unknown/null с origin и индикатором u. Убрать отдельный ∅ и не добавлять меню; проверить пробельный ввод, 0, ошибочный непустой ввод, обязательные поля и reset/export/import.
- [x] 10.5 Разделить миграцию формата и явную смену политики: сохранить прежние гарантии v1 → v2 под legacy policy, добавить переход к новой policy/version с сохранением исходных оценок/ограничений и допустимым изменением рангов. Проверить отдельные runs, прежние manifests/latest, совместимый read-only replay и отсутствие неявного пересчёта истории.
- [x] 10.6 Добавить проверки новой политики: C выше прежних $20/1000 anchors, рост C при равном T, время 29/30/31/45/60/90 минут, дробный штраф при C = 1, разные high-time при одинаковом typical, ties, unknown, одинаковый comparator, низкий effort при достаточном качестве и независимость индивидуального S от постороннего кандидата.
- [x] 10.7 Проверить UI и CLI на одинаковых входах: одинаковые рейтинги, доступное пояснение очистки поля, сохранение источников, отсутствие ∅, понятное различие исходного расхода и S, неизменность выбора от округления отображения и просмотра effort.
- [x] 10.8 Обновить formula/cost/configurator/catalog references, schemas, skill references при необходимости и публичные examples/golden для новой policy/version; сохранить legacy fixtures. Выполнить подходящие offline и archive/replay проверки, обновить инструкции продолжения и сообщить результат отдельно от ещё открытой CI-приёмки 8.4.

## Состояние проверки клиентов

Ранее apply был приостановлен из-за недоступных CLI; владелец затем сообщил об их установке. В актуальном checklist задача 8.2 и задачи раздела 9 отмечены выполненными. Прежний блокер сохраняется здесь как история, а не текущее препятствие. Задача 8.4 остаётся открытой; её критерии CI независимы от нового пересмотра политики. Этот пересмотр сохраняет отметки другого агента и сам не подтверждает повторный smoke discovery клиентов.

## Workflow follow-up

- Раздел 10 реализован в пакете 0.3.0 (policy minimum-resource-with-time-penalty v1, config/overrides/report schema 3, evaluator/renderer 3; legacy-фикстуры 0.1.0 и 0.2.0 сохранены). CI-приёмка 8.4 подтверждена прогоном 43618025901 (коммит 3672cb0): Node 22/24/26 × Ubuntu/macOS/Windows, unit/lifecycle 161/161 и integration 3/3 без пропусков, OpenSpec CLI 2.0.0, без credentials; до этого CI выявил и помог исправить ошибки путей под Windows. Все задачи выполнены; прежний assessment, если он существует, проверить на stale после изменения planning-артефактов.
- После реализации выполнить openspec-verify-change и review; артефакт assessment сам по себе не означает приёмку.
- Архивировать этот change штатным workflow после принятия требований; не включать archive самого change в implementation checklist.
- Перед публичной публикацией отдельно определить лицензию, release и способ распространения; материалы и примеры подготовлены для будущей статьи, публикация не выполняется автоматически.
