# Подключение к Codex, Claude Code и Antigravity IDE

Один пакет — один `SKILL.md`, один evaluator и одни defaults. Различается только место, где клиент ищет skills. Копии не форкаются: во всех клиентах должны совпадать `version identity` и digest `SKILL.md` (`openspec-assess version`).

## Где клиенты ищут skills (проверено 2026-11-14)

| Клиент | Проект | Пользователь | Symlink | Как посмотреть список |
| --- | --- | --- | --- | --- |
| Codex (CLI, IDE, app) | `.agents/skills/<name>/` в каждом каталоге от cwd до корня репозитория | `$HOME/.agents/skills/` | поддерживается, цель symlink сканируется | `/skills` или `$` в CLI/IDE |
| Claude Code | `.claude/skills/<name>/` (также в родительских каталогах до корня репозитория) | `~/.claude/skills/` | поддерживается для project/personal | `/skills`, меню `/` |
| Antigravity (App, CLI, IDE) | `.agents/skills/<name>/` (а также legacy `.agent/skills`) в workspace и родителях до корня репозитория | `~/.gemini/config/skills/` | не описан в документации | IDE: Customizations в боковой панели агента |

Источники: [Codex — Build skills](https://learn.chatgpt.com/docs/build-skills), [Claude Code — Skills](https://code.claude.com/docs/en/skills), [Antigravity — Skills](https://antigravity.google/docs/skills). Codex требует в frontmatter `name` и `description`; Claude Code и Antigravity используют `description` (имя по умолчанию — имя каталога). `SKILL.md` пакета содержит оба поля, имя совпадает с каталогом `openspec-assess-change`.

## Установка в проект

```bash
node packages/openspec-assess-change/scripts/install-skill.mjs --project . --clients codex,claude-code,antigravity
```

Скрипт создаёт `.agents/skills/openspec-assess-change` (Codex и Antigravity) и `.claude/skills/openspec-assess-change` → `../../.agents/skills/openspec-assess-change` — та же схема, что использует `openspec init` для своих skills. По умолчанию (`--mode copy`) в `.agents/skills/...` копируются файлы пакета: **Antigravity (agy 1.5.9) не обнаруживает skill в папке-symlink** (проверено ниже), а копия даёт тот же digest `SKILL.md` и ту же version identity. `--mode symlink` годится только для Codex и Claude Code (оба следуют symlink). Существующий каталог с другим содержимым не перезаписывается без `--force`; при обновлении пакета установку повторяют с `--force`.

Generated skills OpenSpec (`openspec-*`) не изменяются.

## Smoke discovery без платного inference

```bash
node packages/openspec-assess-change/scripts/smoke-clients.mjs --project .
```

1. Файловая проверка (`install-skill --check`): в каждом расположении discovery найден `SKILL.md` с `name` = имени каталога и `description`; `bin/openspec-assess.mjs version --json`, запущенный **из этого расположения**, сообщает тот же digest `SKILL.md` и ту же version identity.
2. Обнаружение самим клиентом, без обращения к модели:

| Клиент | Как проверяется | Почему нет inference |
| --- | --- | --- |
| Codex | `codex debug prompt-input` — локальный рендер model-visible input; skill и корень (`rN` = `<project>/.agents/skills`) ищутся в списке «Available skills» | команда только печатает вход, запрос не отправляется |
| Antigravity | `agy acp`: только `initialize` и `session/new`; skill ищется в `available_commands_update` | `session/prompt` не отправляется |
| Claude Code | `claude -p … --output-format stream-json`; skill ищется в событии `system/init` (`skills`) | `ANTHROPIC_BASE_URL=http://127.0.0.1:9` (закрытый порт) и фиктивный `ANTHROPIC_API_KEY` (`apiKeySource` подтверждает его использование); процесс завершается сразу после `init` |

Описание, которое сообщает каждый клиент, сравнивается с `description` установленного `SKILL.md`.

### Результат проверки (2026-11-14, macOS)

| Клиент | Версия | Copy | Symlink |
| --- | --- | --- | --- |
| Codex CLI | codex-cli 0.169.0 | обнаружен | обнаружен |
| Claude Code | 2.1.325 | обнаружен | обнаружен |
| Antigravity CLI | agy 1.5.9 | обнаружен | **не обнаружен** |

Во всех трёх расположениях совпадают digest `SKILL.md` и version identity: пакет 0.2.0 — `sha256:b92f56f7…` / `sha256:a47386b2…`, пакет 0.3.0 — `sha256:d263725e…` / `sha256:66a02f5a…` (повторный прогон того же скрипта, copy-установка).

Интерактивные проверки (Codex `/skills`, Claude Code `/skills`, Antigravity IDE → Customizations) не выполнялись: они требуют ручного запуска клиентов и не нужны для подтверждения discovery.
