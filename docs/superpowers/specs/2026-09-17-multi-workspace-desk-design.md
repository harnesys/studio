# Мультиворкспейс стол: selection, focus, URL

Date: 2026-09-17
Status: design approved in chat
Scope: модель стола с несколькими включёнными workspace, парковка IDE-табов, единый URL фокуса, поверхности schedule/webhook/spawn. Вне скоупа: shared-агенты между workspace, протокол федерации хостов (уже в `2026-09-16-packaging-federation-design.md`), UI онбординга первичной настройки.

## Контекст

Сегодня Studio адресует стол как `/w/:workspaceId/...`: один workspace в path, IDE layout и hydrate завязаны на него. Мультиселект табов сайдбара уже начат (`workspace-tabs.store`, localStorage), но клик с shift/control и «фокус = единственный workspace в URL» расходятся с мокапом `sidebar-mockup.html` и с картиной продукта.

Workspace в продукте: каталог и стор данных. Стол (окно) одновременно показывает несколько таких каталогов в сайдбаре и может держать в центре табы из разных workspace. Selection сайдбара и фокус центра ортогональны.

Связанный документ: `docs/superpowers/specs/2026-09-16-packaging-federation-design.md` (табы-аватары, группы в секциях, inbox). Этот файл уточняет состояние и URL.

## Решение

Два слоя состояния:

1. **Desk chrome** (persist окна): какие workspace включены (selection), IDE-табы и сплит по каждому workspace, включая припаркованные.
2. **Focus** (URL): ровно один активный ресурс в центре. Форма: `/:workspaceId/{kind}/...`.

Deep link и уведомление открывают ресурс по URL, при необходимости **добавляют** его workspace в selection и не снимают остальные. Пустой selection = пустой стол. Страницы gate как домашнего входа нет.

## Selection workspace

- Клик по табу-аватару (и пункт из меню ⋯): toggle on/off. Без shift/control.
- Включённые workspace задают, чьи группы видны в Inbox, Agents, Explorer, Automations, Git.
- Выключенный workspace: группы скрыты; его IDE-табы **паркуются** (исчезают из центра, layout в памяти). Повторное включение поднимает park как был (включая dirty-файлы).
- Выключили workspace активного таба: активным становится другой visible таб; URL переписывается под него. Visible не осталось → URL `/`.
- Confirm при toggle off не спрашиваем. Confirm только на явное закрытие dirty-таба / выход из приложения (как принято для dirty сейчас).

Persist selection и park переживает reload окна. Selection в URL не сериализуем.

## Focus и URL

Шаблон ресурса:

```text
/:workspaceId/{kind}/{ref}
```

`workspaceId` в path: владелец ресурса и сигнал deep link’у, какой workspace включить. Это не режим «стол внутри одного workspace» и не selection.

| kind | URL | IDE-таб | центр |
|---|---|---|---|
| `thread` | `/:workspaceId/thread/:threadId` | `thread` | чат (`ThreadPanel` + composer) только для `thread.kind === 'chat'` |
| `file` | `/:workspaceId/file/*` | `file` | редактор / preview |
| `diff` | `/:workspaceId/diff/*` | `diff` | git diff |
| `schedule` | `/:workspaceId/schedule/:scheduleId` | `schedule` | поверхность автоматизации |
| `webhook` | `/:workspaceId/webhook/:webhookId` | `webhook` | поверхность автоматизации |
| `spawn` | `/:workspaceId/spawn/:threadId/:spawnId` | `spawn` | read-only `SpawnView` |

Окно без фокуса ресурса:

| URL | смысл |
|---|---|
| `/` | стол; selection из persist (в т.ч. пустой) |
| `/settings` | настройки Window (не domain ноды) |
| `/settings/:category` | категория Window (Profile, Appearance, Chat, …) |

Голого `/:workspaceId` нет. Корневые зарезервированные сегменты: `settings` (позже при необходимости онбординг). Id workspace: UUID, с зарезервированными словами не пересекаются.

Закон sync: **active visible tab ↔ URL**. Visible = табы включённых workspace. Смена таба обновляет URL. Смена URL (уведомление, back) делает `selection.add(workspaceId)`, поднимает park, открывает/фокусирует таб.

### Канон для thread vs автоматизация

У `Schedule` и `Webhook` есть `threadId` (primary thread). Канонический адрес этой пары: `/:workspaceId/schedule|:webhook/:id`.

- Открытие из Automations → URL автоматизации, таб `schedule`/`webhook`.
- `/:workspaceId/thread/:threadId`, где `threadId` является primary thread schedule/webhook → **redirect** на URL автоматизации.
- HITL и уведомления по такому треду ведут на URL автоматизации (или на thread URL с последующим redirect).
- Обычные chat-треды: только `/:workspaceId/thread/:threadId`.

Query-origin (`?agent=`, `?scheduler=`, `?webhook=`) снимаем. Текущий speaker читается с записи треда.

### Редиректы со старых путей

Один слой в роутере. Фичи говорят только на новую форму.

| было | стало |
|---|---|
| `/w/:ws/thread/:id` (+ любой origin query) | chat → `/:ws/thread/:id`; primary automation thread → `/:ws/schedule\|webhook/:id` |
| `/w/:ws/file/*` | `/:ws/file/*` |
| `/w/:ws/settings/...` | `/settings/...` |
| `/w/:ws`, `/w/:ws/agent/:id` | `/` |

## Поверхности schedule и webhook

Таб и URL идентифицируют автоматизацию, не модалку настроек.

Состав центра:

1. Шапка: имя, статус, cron (schedule) или URL/метод (webhook), агент-цель, next/last run при наличии. Действия: pause/resume (и аналоги для webhook), ⋯ → существующая config-модалка, удаление.
2. Тело: journal primary thread (`ThreadJournal` / тот же контур, что сейчас для `thread.kind === 'schedule'|'webhook'`). Composer нет.

Создание автоматизации по-прежнему через модалку; после create открывается таб автоматизации по новому URL. Config-модалка по deep link не открывается.

## Spawn

Уже есть IDE-таб `spawn` и `SpawnView` (read-only журнал поддерева spawn, без composer/HITL). Сейчас у восстановленного spawn-таба нет URL (`spawn-view.tsx`).

Целевое:

- Kind `spawn` в общем шаблоне: `/:workspaceId/spawn/:threadId/:spawnId`.
- Active spawn-таб пишет этот URL; deep link / back поднимают таб так же, как file/diff.
- Вложенные spawn по клику открывают свой таб с тем же шаблоном.
- Spawn паркуется вместе с workspace родителя. Отдельного selection нет.

## IDE layout и парковка

Сейчас: `useIdeStore.byWorkspace[workspaceId]` (уже разложение по workspace). Центр читает layout одного `workspaceId` из URL.

Целевое:

- Persist по-прежнему map `workspaceId → layout` (tabs, groups, splits, activeId внутри workspace).
- Центр собирает **visible desk**: layouts всех id из selection, в стабильном порядке selection (или порядке табов desk, зафиксируем при реализации по удобству).
- Active tab стола один; он же focus URL. При нескольких workspace active принадлежит ровно одному из них.
- Выключение workspace убирает его табы из visible и сохраняет запись в map. Включение возвращает.

Сплит между табами разных workspace допустим в рамках visible desk (конечная картина продукта). Минимальная реализация v1 может сначала показывать табы подряд без cross-workspace split; закон URL и park от этого не меняется. Если v1 без cross-split, это явное ограничение приёмки, не скрытый долг.

## Settings

Владение данными и раскладка панелей: `2026-09-17-workspace-node-design.md`.

Кратко для стола:

- `/settings/...` — только Window (Profile, Appearance, Chat, реестр host/node). Футер сайдбара открывает это.
- Domain ноды (General, Providers, Skills, MCP, Plugins, Packages, Mode presets, Memory, Git, Exports) — модалка workspace settings с левым nav, открывается **от конкретного** workspace/node id (меню аватара / ⋯), не от selection.
- Multi-select не дизейблит вход в модалку ноды и не требует табов selection внутри модалки.

## Пустой стол и онбординг

- Selection пустой, URL `/`: сайдбар без групп контента, центр без табов (пустое состояние стола).
- Gate page как обязательный вход удаляется из навигации стола.
- Онбординг первичной настройки и обучения: отдельный слой поверх стола, позже; не замена `/` и не возврат gate-роута как home.

## Deep link (сводка)

1. Разобрать URL → `workspaceId`, `kind`, `ref`.
2. `selection.add(workspaceId)` если выключен.
3. Поднять park этого workspace.
4. Открыть/сфокусировать таб `kind`/`ref`.
5. URL уже каноничен (или после redirect automation).

Примеры источников: push/tray HITL, непрочитанный тред, клик по schedule/webhook в сайдбаре, back/forward.

## Приёмка

- Toggle табов workspace без модификаторов; меню ⋯ тоже toggle/select в selection.
- Два включённых workspace: секции сайдбара показывают обе группы; в центре табы обоих (в пределах v1 layout).
- Выкл → вкл того же workspace: набор открытых табов и dirty восстановлены.
- Выкл всех → пустой стол на `/`; park не стёрт.
- Уведомление по треду выключенного workspace: workspace включается, остальные selection на месте, фокус на ресурсе.
- `/:ws/schedule/:id` и `/:ws/webhook/:id` открывают поверхность с шапкой и journal; config-модалка только по действию в UI.
- `/:ws/spawn/:threadId/:spawnId` синхронизируется с active spawn-табом.
- Primary thread schedule/webhook по `/thread/...` редиректит на automation URL.
- Старые `/w/...` редиректят; `?agent=`/`?scheduler=`/`?webhook=` не используются.
- `/settings` — только Window; domain ноды через модалку конкретного workspace (см. workspace-node-design).

## Вне скоупа

- Флаг `shared` у агентов и кросс-workspace беседы (отдельный дизайн; задел в workspace-node-design).
- Сериализация всего desk (selection + все табы + сплит) в одну shareable ссылку.
- Pairing хостов и реестр (см. packaging-federation).
- Persist ноды и split store (см. workspace-node-design).
- Полный UI онбординга.

## Самопроверка спека

- Плейсхолдеров нет: kind, шаблоны URL, redirect table, поведение park заданы.
- Противоречий с packaging-federation UX сайдбара нет: мультиселект уточнён как toggle без модификаторов; группы секций по selection.
- Settings не дублируют workspace-node: только отсылка и правила входа со стола.
- Скоуп: состояние стола и URL. Shared-агенты, persist ноды, онбординг исключены явно.
- Неоднозначность закрыта: канон thread vs automation, spawn в URL, голого `/:workspaceId` нет, gate не home.
