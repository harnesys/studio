# Сабагенты: создание, права, каталог

Дата: 2026-09-13
Статус: согласован с хозяином репо (подход 1 + операция `agents`).

## Решения

Зафиксировано в обсуждении:

1. Потолок прав: эффективные права ребёнка не выше прав родительского рана. deny родителя абсолютен.
2. Права сабагента живут в его карточке как карта `PermissionMap`. Один источник правды для UI и тулов.
3. Сабагенты, созданные агентом через пак `agents`, персистятся как обычные делегаты с карточками.
4. Вложенность запрещена на движке, конвенцией в SKILL ограничиваться нельзя.
5. Операция `agents` входит в права, дефолт `ask`.
6. Подход 1: делегирование и права ребёнка при спавне реализуются в библиотеке `packages/harnesys`.
7. Дефолтные права агента (`permissions` в модели) — база: режимы переопределяют отдельные операции не выше базы, пункт `Default` в композере выбирает базу без режимного переопределения.
8. Единый инвариант: любой сабагент (persist-делегат, плагин-агент, план-воркер) исполняется одним механизмом спавна и одной моделью прав. Persist-делегаты остаются в БД, переезд в md-файлы не делается (вариант 1).
9. Существующие тузы не переименовываются в CC-имена: алиасы per-agent. Новые тузы берут CC-имена при совпадающей семантике (`WebSearch`, `KillShell`, `BashOutput`).

## `AgentDefinition.permissions` и `parentId` (библиотека)

`AgentDefinition` получает опциональное поле `permissions?: PermissionMap` (`packages/harnesys/src/domain/agent-definition.ts`). Операции те же, что в `DEFAULT_PERMISSIONS` (`constants.ts:252`), плюс новая `agents`. Поле — база прав агента: потолок для режимов у хоста и база ребёнка при спавне у движка. `null`/отсутствие поля означает `DEFAULT_PERMISSIONS`.

`AgentCatalogCreateInput` получает опциональный `parentId?: string` (`packages/harnesys/src/ports/agents-catalog.ts:16`). Каталог, получивший `parentId`, создаёт делегата под этим агентом.

`AgentRosterEntry` получает опциональный `parentId?: string | null` (`packages/harnesys/src/ports/create-runtime.ts:27`). Хост заполняет его, движок использует для ownership-фильтра спавн-таргетов.

## Права ребёнка при спавне (`graph-spawn.ts`)

При сборке `childOpts` вместо прямого наследования `parent.permissions` вычисляется пересечение:

```
childPermissions = intersect(childDef.permissions ?? DEFAULT_PERMISSIONS, parentRunPermissions)
```

`parentRunPermissions` — карта рана родителя после резолва базы и режима (см. «Дефолтные права агента и режимы»). Порядок жёсткости `deny > ask > allow`: deny любой из сторон даёт deny, иначе берётся более строгий gate. У карты ребёнка единое правило отсутствия поля: `DEFAULT_PERMISSIONS`, как у любого агента. Существующие делегаты без карты становятся read-only (fs.read allow, остальное упирается в sandbox); пресеты обновляются картами в этой же правке, автосев `PRESET_DELEGATES` сеет уже с картами.

`sandbox: true` у ребёнка остаётся (`graph-spawn.ts:178`): `ask` в спавне исполняется как deny, `ask_user` недоступен. Права enforced на движке: игнорирование моделью инструкций не расширяет права ребёнка.

## Тулы пака `agents`

Различие уровней закодировано в именах тулов, поле-флаг модель может забыть:

- `agents_create` создаёт топ-уровневого агента воркспейса. Описание тула фиксирует семантику: самостоятельный агент, виден человеку в сайдбаре, свои треды, допускает пак `agents`, подходит для постоянных ролей.
- `agents_create_subagent` создаёт делегата под вызывающим агентом: `parentId = scope.agentId` (`CapabilityScope`, `domain/pack.ts:5`). Вход: `name`, `role`, `instructions`, `tools?`, `skills?`, `packs?`, `budget?`, `permissions?` (карта прав), `graph?`. Модель наследуется от родителя. Описание фиксирует: спавнится через `agents_spawn`, права не выше родителя, вопросы человеку недоступны, пак `agents` запрещён.
- `agents_list` возвращает `level: 'top' | 'delegate'` и имя родителя для делегата. Модель видит структуру воркспейса до создания.

Гейт операции `agents` (см. ниже) вешается на `agents_create` и `agents_create_subagent` через `def.operations`. `agents_list`, `agents_spawn`, `agents_handoff` не гейтятся: спавн исполняет уже существующую конфигурацию, права ребёнка ограничены пересечением.

## Операция `agents` в правах

`DEFAULT_PERMISSIONS` получает `agents: 'ask'` (`packages/harnesys/src/constants.ts:252`). Тулы создания агентов объявляют `operations: ['agents']`; существующий механизм `checkPermission` → `applyPermissionGate` паркует ран ask-запросом к человеку в ask-режиме.

Studio: `MODE_OPS` получает `'agents'` (`apps/studio/shared/src/modes.ts:1`); попадание операции в карту рана описано в следующей секции. Сиды режимов (`apps/studio/server/src/config/mode-preset-seed.ts`):

| режим | `agents` |
|---|---|
| ask | ask |
| auto | ask |
| plan | deny |
| dont_ask | deny |
| bypass | allow |

У делегатов sandbox превращает `ask` в deny, а движковый запрет пака `agents` вырезает тулы группы целиком.

## Дефолтные права агента и режимы (Studio)

Режим наслаивается на базу и переопределяет только указанные операции. Резолв прав рана (`studio-run-targets.adapter.ts:105-152`):

```
base = agent.permissions ?? DEFAULT_PERMISSIONS
if (modeId == 'default') runPermissions = base
else runPermissions = { op: mode.permissions[op] ? min(mode.permissions[op], base[op]) : base[op] }
```

Порядок жёсткости `deny > ask > allow`. Операция не указана в режиме = база агента; пустой режим эквивалентен `Default`. Правило «режим не может ослабить пропусками» из `permissionMapForMode` заменяется этим резолвом: `allow` в режиме выше базы (`ask`) даёт `ask`, `deny` остаётся абсолютным.

Точки правки:

- `resolveModeId` (`apps/studio/shared/src/modes.ts:42`): `DEFAULT_MODE_ID` меняется с `'ask'` на `'default'`; `'default'` валиден для любого агента без записи в `modes`. Существующие `defaultModeId` продолжают резолвиться, сид `ask` остаётся установленным пресетом.
- Композер (`widgets/chat-composer/ui/chat-composer.tsx:107-122`): список режимов = `Default` + режимы агента; выбор по умолчанию = `defaultModeId` агента, иначе `Default`.
- Редактор режимов (`agent-modes-pane.tsx`, `agent-mode-editor.tsx`): для каждой операции максимальный доступный gate = база агента (`allow` недоступен, если база `ask` или `deny`). Рантайм-пересечение остаётся второй линией: данные режимов могут содержать что угодно, исполнение не выйдет за базу.
- Сиды режимов (`mode-preset-seed.ts` читает `apps/studio/assets/presets/modes/*.json`) без изменений по картам: они уже явные, сужающие режимы (`plan`) прописывают `deny` напрямую.

## Запрет вложенности

Два уровня enforcement, конвенция в SKILL остаётся документацией:

- Каталог Studio: `create-agent` use-case отклоняет `packs.agents` у записи с `parentId` (`ValidationError`), существующая проверка «delegates cannot own delegates» (`create-agent.use-case.ts:154`) сохраняется.
- Движок: при сборке реестра тулов ребёнка `filterToolsForAgent` вырезает группу `agents` (`graph-spawn.ts:151`). Кастомный граф или проигнорированная инструкция не дают ребёнку спавнить.

## Studio: сервер

Цепочка правки персистенса:

- `Agent` в `domain/agent.port.ts` получает `permissions: PermissionMap | null`.
- SQLite: колонка `permissions` (JSON) в `agents`, миграция.
- `create-agent` / `update-agent` use-case прокидывают поле; `AgentPatch` расширяется.
- `create-agent-from-preset` сеет делегата из пресета с его картой прав.
- `SqliteAgentsCatalogPort.create` передаёт `parentId` и `permissions` из `AgentCatalogCreateInput`; `toAgentDefinition` возвращает `permissions`.
- Пресет-схема (`adapters/agent-presets-fs.adapter.ts:29`) получает `permissions?: PermissionMap`; zod перестаёт вырезать поле.

## Studio: UI

Модалка настроек агента (`features/manage-agent`):

- «Add from preset» во вкладке Subagents вызывает `POST .../agents/from-preset` с `parentId` немедленно, конфиг-диалог драфта не открывается. Карточка-строка делегата появляется в списке сразу после ответа.
- Клик по карточке открывает редактирование существующего делегата по механизму `openSubagent` (PATCH, «Subagent saved»).
- Коллизия имён в рамках родителя разрешается суффиксом (`Explorer 2`).
- Вкладка Permissions в модалке доступна всем агентам, топ-уровневым и делегатам: операции `fs.write`, `process`, `network`, `mcp`, `agents` × `allow|ask|deny`. У делегатов вкладка дополнена подписью «ask в спавне исполняется как deny», операция `agents` не отображается (пак запрещён у делегата), `fs.read` не отображается у всех (всегда allow).

Навигация настроек делегата (`AGENT_CONFIG_CATEGORIES`, `agent-config-nav.tsx:39`) урезана до применяемого при спавне: `identity`, `model`, `permissions`, `graph`, `capabilities`, `compaction`, `skills`, `mcp`, `limits`. Исключены:

- `modes`: режим рана делегата определяет родитель, права делегата задаются вкладкой Permissions.
- `subagents`: уже скрыто (`showSubagents`), вложенность запрещена.
- `hooks`: `childOpts` не получает `hooks` (`graph-spawn.ts:155-179`), хуки делегата не исполняются, вкладка не влияет на поведение.

Во вкладке `capabilities` делегата пак `agents` не отображается в списке доступных паков.

Пресеты получают `permissions` в JSON. Предлагаемые карты (содержимое правится при ревью):

| пресет | `fs.write` | `process` | `network` | `mcp` | `agents` |
|---|---|---|---|---|---|
| assistant, orchestrator | ask | ask | ask | ask | ask |
| coder | allow | allow | ask | ask | ask |
| researcher | ask | ask | allow | ask | ask |
| planner, reviewer, tester, writer | ask | ask | ask | ask | ask |
| explorer (делегат) | deny | deny | deny | deny | — |
| general (делегат) | allow | allow | deny | deny | — |

`general` сохраняет бюджет `policy: "error"` как ограничитель вместо прав.

## CC-паритет плагин-агентов

Плагин-агенты (`agents/*.md` плагинов claude-compat) уже биндятся как спавн-таргеты `plugin:<plugin>:<agent>`. Разрывы с форматом сабагентов Claude Code закрываются в библиотеке (`formats/agents-commands.ts`, `bind-agents.ts`) и Studio (`plugin-agents.ts`).

**Алиасы тулов.** Таблица алиасов CC → наши в библиотеке; резолв per-agent при сборке реестра рана: `tools` агента с CC-именами резолвится в наши имена, в реестр ребёнка деф кладётся под запрошенным именем. Промпты CC-агентов («use the Glob tool») работают дословно, глобальный реестр не раздувается. `load_tools` резолвит алиасы по той же таблице. Таблица: `Read→read_file`, `Write→write_file`, `Edit→edit_file`, `Glob→glob`, `Grep→grep`, `LS→list_dir`, `Bash→shell`, `WebFetch→fetch`. Нераспознанные имена (`TodoWrite`, `WebSearch`, `NotebookRead`, `NotebookEdit`, `KillShell`, `BashOutput`, `Task`) → diagnostic `unsupported_tool` («analog planned» для запланированных), имя отбрасывается, остальной frontmatter работает.

**`tools` как allow-list.** `filterToolsForAgent` (`application/tool-registry.ts:31`) учитывает `tools`: список задан → агенту доступны только эти тузы после резолва алиасов, не задан → весь реестр (текущее поведение). Правило для всех агентов: делегатов, плагин-агентов, топ-уровневых. При включении проверяются существующие записи с неполными `tools` (сейчас поле на ране игнорируется, данные могут быть частичными): пресеты и стенд правятся в той же итерации.

**Алиасы моделей.** `resolveModelRef` (`apps/studio/server/src/application/plugins/plugin-agents.ts:65`): bare-имя (`sonnet`) сначала матчится точно, затем substring-поиском по именам моделей всех провайдеров. Нерезолв → warning `unresolved_model`, компонент живёт без `model` и наследует модель родителя при спавне (политика «дропать компонент» отменяется).

**Цвет.** Носители: `AgentSpec.color` (frontmatter плагин-агентов, поле признаётся валидным, warning снимается) → `CatalogAgentEntry.color`; `Agent.color` в Studio (колонка БД, редактируемое поле во вкладке Identity всех агентов и делегатов, палитра CC: red, orange, yellow, green, blue, purple, magenta, cyan, pink). Рендер: `agent-card`, строка делегата, `SpawnCard`.

**Граф плагин-агента.** `standardAgentGraph()` (`bind-agents.ts:168`) не пробрасывает `tools` в ноду `llm:generate`: при реализации проверить, исполняется ли тул-цикл с подмножеством тулов, и пробросить резолв алиасов.

Права плагин-агентов: карты нет → `DEFAULT_PERMISSIONS`, спавн ограничивает пересечением с правами рана родителя и sandbox (фактически read-only у read-oriented CC-агентов). Вложенность не нарушается: плагин-агент не имеет пака `agents`.

## Ownership ростера

`resolveTargets` (`graph-spawn.ts:105`) пропускает делегатов, у которых `parentId` не равен `agentId` исполняемого агента: цель недоступна с ошибкой `spawn_target_missing`. Закрывает возможность таргетировать чужих делегатов через кастомный граф с явным `agentId`. `agents_list` и `agents_spawn` фильтруются каталогом по тому же правилу (уже действует, `sqlite-agents-catalog.port.ts:40`).

## Ошибки и границы

- `agents_create_subagent` с `packs.agents` возвращает ошибку валидации в результате тула; то же сохранение в UI отклоняет use-case.
- Карта прав делегата шире родительской не ошибка: карточка показывает запрошенные права, ран применяет пересечение молча.
- `budget.policy: 'ask'` у делегата остаётся предупреждением валидации: ask в спавне недоступен, эффективен только `error`.
- Удаление родителя удаляет делегатов каскадно (`delete-agent.use-case.ts:20`), без изменений.

## Не-цели

Вложенные сабагенты (делегат с паком `agents`), профили спавна как отдельная сущность, эфемерные агенты на ран, режимы делегата при спавне. Вопросы возвращаются при появлении второго потребителя.

## Проверка

Тесты в репо запрещены (`AGENTS.md`). Ручная проверка через agent-browser по портам хозяина (3000 API, 5173 Vite):

1. «Add from preset» создаёт карточку сразу, клик открывает редактирование.
2. Вкладка Permissions: сохранение карты, `fs.read` скрыт, у делегата скрыт `agents`.
3. Навигация делегата: вкладки Modes, Hooks, Subagents отсутствуют, пак `agents` не предлагается в Capabilities.
3. Композер: `Default` присутствует в списке режимов всегда; выбор `Default` даёт руну базу агента.
4. Режим `auto` у агента с базой `fs.write: ask` исполняет запись через ask-подтверждение; с базой `allow` — без подтверждения.
5. Редактор режимов не предлагает gate выше базы агента.
6. Спавн: делегат с `fs.write: allow` у родителя в ask-базе получает deny (пересечение + sandbox); в bypass-базе исполняет запись.
7. `agents_create_subagent` из рана: делегат появился в карточке родителя, карточка видна в UI.
8. `agents_create` при `agents: ask` паркует ран ask-запросом.
9. Кастомный граф с `agentId` чужого делегата: `spawn_target_missing`.
10. Сохранение делегата с паком `agents`: `ValidationError` в UI и в результате тула.
11. Плагин `feature-dev`: три агента в `agents_list`, `color` без warning, модель `sonnet` резолвится substring-матчем.
12. Спавн `plugin:feature-dev:code-architect`: тул-цикл с `Read/Glob/Grep` (алиасы), write/shell отсечены allow-list'ом и правами.
13. Frontmatter с `TodoWrite`/`WebSearch`: diagnostic `unsupported_tool`, агент работает.

`bun run lint` в корне, typecheck пакетов после правок.
