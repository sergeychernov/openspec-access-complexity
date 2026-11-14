# Расход: API и подписки

Все прогнозы ниже — исходные величины. Политика выбора использует верхний прогноз C и типичное время T для критерия сравнения S = C × (1 + k × max(0, T − g)/s) (см. [formula.md](formula.md)); S никогда не подменяет прогноз оплаты, бюджет или квоту.

Все прогнозы — **сценарии** (low / typical / high) для категории нагрузки change (`xs`…`xl`), а не измерения. `high` включает возможные доработки. Пока нет калибровки на собственных задачах, это ориентир для сравнения кандидатов между собой, а не счёт.

## API

Usage-профиль: `workloads.api[phase][category][scenario]` — непересекающиеся категории токенов (`uncachedInputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `outputTokens`, `reasoningTokens`), пик контекста и вызовы инструментов. Профиль масштабируется **явной записью** модели для фазы и effort `resources.api.usage[phase][effort]` (единица `token-workload-multiplier-bp`, 10000 = ×1.0, со своим статусом и основанием). Нагрузка подписки и время — аналогичные записи `resources.subscription.load` и `resources.time.minutes`. Записи не выводятся из общей кривой effort и не зависят от оценки качества: изменение качества не меняет расход. Неизвестная запись → прогноз `unknown`, не ноль.

Pricing adapter (`priceUsage`) складывает по категориям, каждая округляется вниз в микроединицах:

| Категория | Тариф |
| --- | --- |
| uncached input | `rates.uncachedInput` |
| cache read | `rates.cacheRead` |
| cache write | `rates.cacheWrite` (OpenAI — 30-минутная запись, Anthropic — 5-минутная) |
| visible output | `rates.output` |
| reasoning | **один раз**: либо как output (`reasoningBilling: as-output`), либо по `rates.reasoning` (`separate`) |
| tool calls | `toolCharges[tool]` × число вызовов |

- Тарифы — микроединицы валюты за 1M токенов; валюта и tier записаны явно, конвертации валют нет (несовпадение → стоимость `unknown`).
- `longContext`: если пик контекста превышает `thresholdTokens`, используются длинноконтекстные тарифы (OpenAI: > 272K; Claude Haiku 5.5: промпт > 100K).
- Любой отсутствующий тариф, вызов инструмента без цены, неизвестный usage-множитель или `pricing.status: unknown` делают итог **unknown**, а не нулём. Такой кандидат идёт после кандидатов с полной экономикой и не получает выгоды «бесплатности».
- Не моделируются: batch-скидки, fast mode, региональные надбавки, priority tiers.

Поставляемые цены (`status: confirmed`, стандартный tier, USD) проверены 2026-11-14 на [OpenAI pricing](https://developers.openai.com/api/docs/pricing) и [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing). Для моделей Antigravity публичной поштучной цены в этом harness не найдено — `unknown`.

Бюджет: `constraints.api.maxCostMicros`. Нижняя оценка выше бюджета → исключение; только верхняя выше → `provisional`; неизвестная стоимость → `provisional`.

## Подписки

Отдельная относительная шкала нагрузки (`workloads.subscription` × `resources.subscription.load[phase][effort]`), **не** выводимая из API-цены. Без подтверждённого преобразования проценты квоты не выдумываются.

- `quotaPools`: один pool на план; кандидаты с одним `poolId` делят его (отчёт показывает общий pool один раз — переключение модели не даёт нового лимита). Antigravity учитывает Gemini и Claude/GPT отдельно; все три модели каталога — Gemini и делят `antigravity-gemini`.
- `observation` (опционально): `remaining`, `unit`, `observedAt`, `maxAgeHours`, `resetAt`, `source`.
- `conversion` (опционально): `quotaUnitsPer1000Load` — только если пользователь подтвердил связь нагрузки с единицами квоты.

Свежесть наблюдения определяется **только** по явно переданному `--as-of` (входит в assessment-id); evaluator не читает часы. Без `as-of`, при устаревшем наблюдении, после `resetAt` или без conversion — вместимость `unknown`, рейтинг строится по пригодности и относительной нагрузке. С наблюдением и conversion: нехватка по нижнему сценарию → исключение, по верхнему → `provisional` («может не хватить»).
