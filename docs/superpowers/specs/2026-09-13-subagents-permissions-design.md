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

## `AgentDefinition.permissions` и `parentId` (библиотека)

`AgentDefinition` получает опциональное поле `permissions?: PermissionMap` (`packages/harnesys/src/domain/agent-definition.ts`). Операции те же, что в `DEFAULT_PERMISSIONS` (`constants.ts:252`), плюс новая `agents`. Поле универсальное: любой агент может нести карту, применение на уровне спавна определяет движок.

`AgentCatalogCreateInput` получает опциональный `parentId?: string` (`packages/harnesys/src/ports/agents-catalog.ts:16`). Каталог, получивший `parentId`, создаёт делегата под этим агентом.

`AgentRosterEntry` получает опциональный `parentId?: string | null` (`packages/harnesys/src/ports/create-runtime.ts:27`). Хост заполняет его, движок использует для ownership-фильтра спавн-таргетов.

## Права ребёнка при спавне (`graph-spawn.ts`)

При сборке `childOpts` вместо прямого наследования `parent.permissions` вычисляется пересечение:

```
childPermissions = intersect(childDef.permissions ?? parent.permissions, parent.permissions)
```

Порядок жёсткости `deny > ask > allow`: deny любой из сторон даёт deny, иначе берётся более строгий gate. Полей нет у ребёнка, берётся карта родителя (текущее поведение сохраняется для существующих делегатов).

`sandbox: true` у ребёнка остаётся (`graph-spawn.ts:178`): `ask` в спавне исполняется как deny, `ask_user` недоступен. Права enforced на движке: игнорирование моделью инструкций не расширяет права ребёнка.

## Тулы пака `agents`

Различие уровней закодировано в именах тулов, поле-флаг модель может забыть:

- `agents_create` создаёт топ-уровневого агента воркспейса. Описание тула фиксирует семантику: самостоятельный агент, виден человеку в сайдбаре, свои треды, допускает пак `agents`, подходит для постоянных ролей.
- `agents_create_subagent` создаёт делегата под вызывающим агентом: `parentId = scope.agentId` (`CapabilityScope`, `domain/pack.ts:5`). Вход: `name`, `role`, `instructions`, `tools?`, `skills?`, `packs?`, `budget?`, `permissions?` (карта прав), `graph?`. Модель наследуется от родителя. Описание фиксирует: спавнится через `agents_spawn`, права не выше родителя, вопросы человеку недоступны, пак `agents` запрещён.
- `agents_list` возвращает `level: 'top' | 'delegate'` и имя родителя для делегата. Модель видит структуру воркспейса до создания.

Гейт операции `agents` (см. ниже) вешается на `agents_create` и `agents_create_subagent` через `def.operations`. `agents_list`, `agents_spawn`, `agents_handoff` не гейтятся: спавн исполняет уже существующую конфигурацию, права ребёнка ограничены пересечением.

## Операция `agents` в правах

`DEFAULT_PERMISSIONS` получает `agents: 'ask'` (`packages/harnesys/src/constants.ts:252`). Тулы создания агентов объявляют `operations: ['agents']`; существующий механизм `checkPermission` → `applyPermissionGate` паркует ран ask-запросом к человеку в ask-режиме.

Studio: `MODE_OPS` получает `'agents'` (`apps/studio/shared/src/modes.ts:1`), `permissionMapForMode` передаёт его без изменений. Сиды режимов (`apps/studio/server/src/config/mode-preset-seed.ts`):

| режим | `agents` |
|---|---|
| ask | ask |
| auto | ask |
| plan | deny |
| dont_ask | deny |
| bypass | allow |

У делегатов sandbox превращает `ask` в deny, а движковый запрет пака `agents` вырезает тулы группы целиком.

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
- В карточке делегата добавляется панель Permissions: `fs.write`, `process`, `network`, `mcp` × `allow|ask|deny`, подпись «ask в спавне исполняется как deny». `fs.read` не отображается (всегда allow), `agents` не отображается (пак запрещён у делегата, операция не применяется).
- У топ-агентов панель Permissions не показывается: их права задаются режимами.

Пресеты делегатов получают явные карты: `explorer` все операции deny (read-only), `general` `fs.write` и `process` allow при бюджете `policy: "error"`. Топ-уровневые пресеты без изменений.

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
2. Панель прав делегата сохраняет карту, `fs.read` скрыт.
3. Спавн в ask-режиме: делегат с `fs.write: allow` получает deny (пересечение + sandbox).
4. Спавн в bypass: делегат с `fs.write: allow` исполняет запись.
5. `agents_create_subagent` из рана: делегат появился в карточке родителя, карточка видна в UI.
6. `agents_create` в ask-режиме паркует ран ask-запросом.
7. Кастомный граф с `agentId` чужого делегата: `spawn_target_missing`.
8. Сохранение делегата с паком `agents`: `ValidationError` в UI и в результате тула.

`bun run lint` в корне, typecheck пакетов после правок.
