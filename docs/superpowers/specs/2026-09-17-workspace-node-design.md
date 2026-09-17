# Workspace-node: владение данными и settings

Date: 2026-09-17
Status: design approved in chat
Scope: топология Window / Host process / Workspace-node, persist на ноду, раскладка settings, вход в UI. Вне скоупа: протокол sync/mesh между нодами, shared-агенты (задел только), миграция существующего `studio.db` пошаговым планом реализации.

Связанные документы:

- `2026-09-16-packaging-federation-design.md` — remote-host, pairing, упаковка
- `2026-09-17-multi-workspace-desk-design.md` — selection, park, URL фокуса стола

## Контекст

Текущий Studio смешивает в `/w/:workspaceId/settings` данные workspace, «системные» панели и вещи, которые фактически живут в одном `~/.harnesys/studio.db` на процесс. При столе с нодами на laptop, LAN-машине и VPS общий bag Providers/Plugins/Mode presets не работает: у каждой ноды свой runtime и свой persist, общей БД нет (`packaging-federation`, ROADMAP).

Запреты, зафиксированные в обсуждении:

- общей базы между нодами нет;
- нода самодостаточна;
- федерация собирает ноды в сеть отдельно от «одной БД»;
- providers, plugins, mode presets не живут на уровне «весь хост / всё окно».

## Решение

Единица автономии: **workspace-node** (далее нода). Host process поднимает ноды. Window подключается к нодам и рисует стол. Секреты и capabilities принадлежат ноде.

Целевой persist: **отдельный store на каждую ноду** (свой db-файл или каталог состояния). Host process держит registry «какие ноды поднять» и transport (listen, token), не каталог моделей и не skills.

## Три слоя

| слой | роль | persist |
|---|---|---|
| **Window** | UI стола, реестр известных host endpoints / нод для pairing, desk chrome (selection, park) | локально у клиента (`~/.harnesys` окна / Tauri store) |
| **Host process** | runtime: listen, auth token, список нод на этой машине, cron/ticker *внутри* каждой поднятой ноды | host registry + token; без domain-таблиц агентов/провайдеров |
| **Workspace-node** | каталог workspace + все domain-данные этой ноды | store ноды |

Один host process на машине может поднимать несколько локальных нод (Home + Shop на ноутбуке). Нода на VPS — другой host process. Окно в selection держит id нод с разных host; каждый API-вызов идёт на host той ноды.

### Что лежит на ноде

- папка workspace (файлы пользователя);
- агенты, треды, runs, schedules, webhooks;
- **providers и модели** (ключи и endpoints этой ноды);
- **plugins** (установки, доступные агентам этой ноды);
- **mode presets**;
- skills, MCP config, tool packages;
- memory / knowledge index, git-метаданные, exports.

### Что лежит на Window

- Appearance (тема, scale UI);
- Profile как представление человека *в этом окне* (как подписываться в UI);
- Chat display preferences стола (если это чисто клиентское);
- реестр host/node endpoints после pairing;
- selection workspace-табов, parked IDE layouts.

### Что лежит на Host process

- `host.token`, bind address/port;
- список локальных node id → путь store / путь папки;
- процессные health/logs.

Host не экспонирует «providers хоста». UI никогда не пишет domain-настройки «в хост целиком».

## Settings UI

Два входа, без смеси уровней.

### `/settings` — только Window

Категории: Profile, Appearance, Chat (клиентские), плюс управление реестром host/node (pairing), без Capabilities ноды.

URL как в desk-спеке: `/settings`, `/settings/:category`, … без `workspaceId` в path.

Футер сайдбара «Settings» открывает только это.

### Модалка ноды — Workspace settings

Паттерн как у agent config: диалог с левым nav.

Группы (имена рабочих):

| группа | пункты |
|---|---|
| Workspace | General (имя, путь, host/node id, удаление ноды из окна / с host) |
| Capabilities | Providers, Skills, MCP, Plugins, Packages, Mode presets |
| Data | Memory, Git, Exports |

Все чтения/записи модалки идут в API **этой** ноды (через её host). Модалка не показывает «объединённых» провайдеров нескольких нод.

Create workspace: короткая форма (host → name → folder), как в packaging UX. Полная модалка — для уже существующей ноды.

### Вход в модалку

Всегда от **конкретной ноды**, не от selection:

- пункт в меню этого workspace (⋯ overflow / context по аватару);
- при наличии — ⋯ у группы этой ноды в секции сайдбара.

Selection из N нод не дизейблит вход и не требует табов selection внутри модалки. Опциональный switcher «редактировать другую ноду» внутри модалки — не v1.

Дисейбл Settings при multi-select запрещён как модель: обычный стол держит несколько нод включёнными.

## Связь со столом

Desk-спека (`multi-workspace-desk-design`): selection и URL фокуса оперируют id ноды (= workspace id в текущем клиенте). Deep link включает ноду в selection и ходит в её API за сущностью.

Старая идея «settings workspace берёт последний сфокусированный workspace внутри `/settings`» отменяется: domain settings только в модалке ноды.

## Федерация и дружба агентов (задел)

- Ноды остаются самодостаточными; общей БД нет.
- Дружба агентов разных нод: отдельный протокол (allowlist нод, флаг вроде `shared`, маршрутизация сообщений/HITL). Записи хода принадлежат ноде-владельцу (или явно выбранной home-node в будущей спеке).
- Sync конфигурации между нодами (копирование presets без секретов, export/import bundle): отдельный дизайн. Эта спека требует лишь, чтобы не появился скрытый global settings bag.

Packaging-federation v1 (pairing host, inbox с нескольких host) совместим: host по-прежнему точка транспорта; domain внутри host режется на ноды с отдельным persist.

## Расхождение с сегодняшним кодом

Факт сейчас: один `studio.db` на server process, providers/plugins/mode-presets в нём, settings page под `/w/:workspaceId/settings` со смешанным nav (`settings-nav.ts`).

Целевая модель выше. Переход: implementation plan режет миграцию (logical per-node API → physical split store). Пока physical split не сделан, API и UI уже обязаны адресовать ноду явно; host-global domain endpoints не расширять.

## Приёмка

- `/settings` не содержит Providers, Skills, MCP, Plugins, Packages, Mode presets, Memory, Git, Workspace general.
- Workspace settings открываются модалкой с nav General / Capabilities / Data для выбранного node id.
- При двух включённых нодах (в т.ч. разных host) модалка одной ноды пишет только в её store/API; вторая не меняется.
- Футер Settings не открывает domain ноды.
- Нет UI «providers этого хоста для всех его workspace».
- Persist целевой: у ноды свой store; host registry отдельно.

## Вне скоупа

- Реализация mesh sync и conflict resolution.
- Спека shared-агентов и кросс-node thread.
- Пошаговые SQL-миграции split `studio.db` (план реализации).
- Онбординг первичной настройки окна.

## Самопроверка спека

- Плейсхолдеров нет: три слоя, списки владения, UI входы, группы модалки заданы.
- Противоречие с desk-спекой Settings закрывается правкой desk-документа (ссылка сюда).
- Скоуп: владение и settings. Sync/shared исключены явно, задел описан.
- Неоднозначность «providers на хосте» снята: на ноде.
