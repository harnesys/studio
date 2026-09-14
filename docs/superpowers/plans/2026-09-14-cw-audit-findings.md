# CW-аудит: вендорные плагины и домашние пресеты (2026-09-14)

Бейслайн: f75ff4a. Закрытый мир: неназванная capability недоступна; `tools:` из plugin-доков маппятся через `CC_TOOL_ALIASES` с деривацией паков, unmapped имя отбрасывается с `claude_tool_unmapped` (`packages/harnesys/src/application/plugins/bind-agents.ts:mapSpecTools`). Нативные имена сверены с meta паков `files`/`shell`/`fetch` (`packages/harnesys/src/packs/base.ts`). Резолв модели — `resolveModelRef` (`apps/studio/server/src/application/plugins/plugin-agents.ts`); список моделей взят read-only из `~/.harnesys/studio.db`. Аудит файловый, вендорные файлы не менялись.

## feature-dev

`~/.harnesys/plugins/feature-dev/agents/` — единственный плагин с агент-доками.

| file | tools declared | mapped | dropped (unmapped) | post-flip status | recommendation |
|---|---|---|---|---|---|
| code-architect.md | Glob, Grep, LS, Read, NotebookRead, WebFetch, TodoWrite, WebSearch, KillShell, BashOutput | Glob→glob, Grep→grep, LS→list_dir, Read→read_file, WebFetch→fetch (packs: files, fetch) | NotebookRead, TodoWrite, WebSearch, KillShell, BashOutput | reduced (5 tools) | none; отдельное решение по TodoWrite ниже |
| code-explorer.md | тот же список из 10 имён | те же 5 | те же 5 | reduced (5 tools) | none; см. TodoWrite |
| code-reviewer.md | тот же список из 10 имён | те же 5 | те же 5 | reduced (5 tools) | none; см. TodoWrite |

Общее по трём докам:

- `model: sonnet` во всех трёх. Точного совпадения имени модели нет; substring-фолбэк (`model.name.includes("sonnet")`, регистронезависимо) тоже мимо: в `llm_models` нет ни одного имени с подстрокой sonnet/opus/haiku. Итог: `unresolved_model`, агент живёт без `model` и наследует модель родителя при спавне. Для audit-стенда это ожидаемо, блокера нет.
- Все отброшенные имена — из `PLANNED_CC_TOOLS` (unmapped-planned), не unknown. У каждого есть план-примечание в `tool-aliases.ts`.
- `TodoWrite` — самое заметное отбрасывание: в рантайме есть `plan`-пак (`plan_save`/`plan_item_update`/`plan_get`), но алиаса в `CC_TOOL_ALIASES` нет, и добавление алиаса — изменение библиотеки, вне рамок аудита. Если владельцу нужен planning-паритет для этих агентов, вариант без правки вендора — один алиас в библиотеке (обсуждать отдельно).
- Write/Edit/Bash (`write_file`/`edit_file`/`shell`) доками не заявлены; read-only профиль агента сохраняется после флипа без дополнительных потерь.

## Остальные плагины

| plugin | agent docs |
|---|---|
| frontend-design | нет каталога `agents/` (только skills) |
| playwright | каталог пустой |
| security-guidance | нет `agents/` (hooks) |
| superpowers | нет `agents/` (skills/hooks) |
| typescript-lsp | нет `agents/` |

`*.pre-fk.bak` исключены из перечисления.

## Домашние пресеты

`~/.harnesys/presets/agents/` не существует — классифицировать нечего. Студийные бандл-пресеты (`apps/studio/assets/presets/agents/*.json`, 10 файлов) получили явные `tools:` в f75ff4a; домашний layer поверх них пуст.

## Итоговые счётчики

- Документов аудитовано: 3 (все — feature-dev).
- Чат-онли после флипа: 0. Ни одного дока без `tools` или с полностью unmapped списком.
- Unmapped упоминаний: 15 (5 уникальных имён: NotebookRead, TodoWrite, WebSearch, KillShell, BashOutput; по 3 дока на каждое).
