# Desk URL, selection, park Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Стол адресуется как `/:workspaceId/{kind}/...` и `/`; selection и park живут в persist окна; focus в URL; gate не home.

**Architecture:** Desk chrome (selection + `useIdeStore.byWorkspace`) ортогонален focus URL. Deep link делает `selection.add(workspaceId)` и поднимает park. Центр собирает visible desk из включённых workspace в порядке selection. Cross-workspace split не делать: табы выбранных workspace подряд, один active на стол. Inbox/events: per-node данные + merge в окне; не вводить `GET /inbox` по всему `studio.db`. Webhook URL в UI не клеить из `window.location`.

**Tech Stack:** React Router 7, Zustand, существующий SSE `/api/desk/watch`.

**Spec:** `docs/superpowers/specs/2026-09-17-multi-workspace-desk-design.md`

**Sequence:** `docs/superpowers/plans/2026-09-17-multi-workspace-implementation-sequence.md` Phase 1.

## Global Constraints

- Тесты `*.test.ts` / `*.spec.ts` запрещены. Приёмка: `bun run lint`, `bun run typecheck` из корня; ручная проверка по разрешению.
- Host в URL не добавлять. Id ноды = текущий `workspaceId` (UUID).
- Не делать `workspace.db`, pairing, Tauri, store-приёмку node-спеки, модалку workspace settings.
- `/settings` в этой фазе: перенос пути без workspaceId; смешанный nav допустим (Phase 2 вычистит).
- Именованные типы. FSD: слайс через `index.ts`.
- Не поднимать второй стенд на `:3000` / `:5173`.

---

## File map

| файл | ответственность |
|---|---|
| `apps/studio/client/src/shared/config/routes.ts` | канон path helpers, kinds, redirects table |
| `apps/studio/client/src/shared/config/location.ts` | разбор нового URL |
| `apps/studio/client/src/shared/config/navigation.ts` | navigate без `?agent=` |
| `apps/studio/client/src/app/routes/index.tsx` | дерево роутов, legacy `/w/*` |
| `apps/studio/client/src/pages/workspace/ui/workspace-page.tsx` | стол на `/` и на resource URL |
| `apps/studio/client/src/pages/workspace/ui/ide-layout-view.tsx` | visible desk |
| `apps/studio/client/src/features/ide/model/ide.store.ts` | kinds `schedule` / `webhook`; park = запись в map |
| `apps/studio/client/src/features/ide/model/ide-sync.ts` | URL ↔ active visible tab |
| `apps/studio/client/src/features/ide/model/open-ide.ts` | spawn/diff/schedule/webhook пишут URL |
| `apps/studio/client/src/widgets/ide-content/ui/ide-content.tsx` | поверхности automation |
| `apps/studio/client/src/widgets/ide-home/ui/ide-home.tsx` | пустой стол / без голого workspace home как единственный вход |
| `apps/studio/client/src/pages/workspace-gate/` | снять с `/` |
| `apps/studio/client/src/features/desk/ui/desk-sync.tsx` | hydrate selected + deep link add |
| `apps/studio/client/src/widgets/workspace-sidebar/ui/automations-section.tsx` | open automation URL |

`harnesys.ide-workspaces` остаётся persist park до Phase 3 (`window.desk`).

---

## Types (канон URL)

В `routes.ts` заменить `StudioSurface` / `ThreadOrigin` query-модель.

```ts
export type StudioFocusKind =
  | 'thread'
  | 'file'
  | 'diff'
  | 'schedule'
  | 'webhook'
  | 'spawn';

export type StudioFocus =
  | { kind: 'none' }
  | { kind: 'settings'; category: WindowSettingsCategory; providerId: string | null }
  | {
      kind: 'thread';
      workspaceId: string;
      threadId: string;
    }
  | { kind: 'file'; workspaceId: string; path: string }
  | { kind: 'diff'; workspaceId: string; path: string }
  | { kind: 'schedule'; workspaceId: string; scheduleId: string }
  | { kind: 'webhook'; workspaceId: string; webhookId: string }
  | { kind: 'spawn'; workspaceId: string; threadId: string; spawnId: string };

export const studioPath = {
  desk: '/',
  thread: (workspaceId: string, threadId: string) =>
    `/${workspaceId}/thread/${threadId}`,
  file: (workspaceId: string, path: string) =>
    `/${workspaceId}/file${path.startsWith('/') ? path : `/${path}`}`,
  diff: (workspaceId: string, path: string) =>
    `/${workspaceId}/diff${path.startsWith('/') ? path : `/${path}`}`,
  schedule: (workspaceId: string, scheduleId: string) =>
    `/${workspaceId}/schedule/${scheduleId}`,
  webhook: (workspaceId: string, webhookId: string) =>
    `/${workspaceId}/webhook/${webhookId}`,
  spawn: (workspaceId: string, threadId: string, spawnId: string) =>
    `/${workspaceId}/spawn/${threadId}/${spawnId}`,
  settings: (category?: WindowSettingsCategory, providerId?: string) => {
    if (category && category !== 'profile') {
      if (category === 'providers' && providerId) {
        return `/settings/providers/${providerId}`;
      }
      return `/settings/${category}`;
    }
    return '/settings';
  },
};
```

`WindowSettingsCategory` в Phase 1 может ещё включать domain id из `settings-nav.ts`. Голого `studioPath.workspace(id)` нет. `studioPath.gate` удалить. `studioPath.agent` удалить.

Reserved root: `settings`. UUID workspace с ним не пересекается.

---

### Task 1: Path helpers и location

**Files:**
- Modify: `apps/studio/client/src/shared/config/routes.ts`
- Modify: `apps/studio/client/src/shared/config/location.ts`
- Modify: `apps/studio/client/src/shared/config/navigation.ts`

**Interfaces:**
- Produces: `StudioFocus`, `studioPath` как выше; `useStudioLocation(): StudioFocus`
- Consumes: `SETTINGS_CATEGORIES`

- [ ] **Step 1: Переписать `routes.ts`**

Удалить `ThreadOrigin`, `ThreadOriginRef`, `STUDIO_*_PATTERN` со `/w/`, `resolveStudioEntry`. Все импортёры `studioPath.thread(..., origin)` править в этой и следующих задачах: сигнатура без origin.

`parseSettingsCategory` оставить.

- [ ] **Step 2: `useStudioLocation`**

Парсить `useMatch` в порядке: `/settings/...`, затем `/:workspaceId/thread/:threadId`, `file`, `diff`, `schedule`, `webhook`, `spawn`. Query `agent` / `scheduler` / `webhook` не читать.

- [ ] **Step 3: Navigation**

```ts
openDesk() { void navigate(studioPath.desk); }
openThread(workspaceId: string, threadId: string) { ... }
openFile(workspaceId: string, path: string) { ... }
openDiff(...)
openSchedule(...)
openWebhook(...)
openSpawn(...)
openSettings(category?: WindowSettingsCategory, providerId?: string)
```

Без `leaveWorkspace` → gate. Footer settings: `openSettings()` без workspace id (уже в сигнатуре).

- [ ] **Step 4: Lint / typecheck**

Починить все call sites `studioPath` / `openThread` / `ThreadOriginRef` (grep). Не оставлять `?agent=`.

```bash
bun run lint
bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/studio/client/src/shared/config
git commit -m "feat(studio): workspace-first focus URL helpers"
```

---

### Task 2: Router, redirects, `/` = стол

**Files:**
- Modify: `apps/studio/client/src/app/routes/index.tsx`
- Modify: `apps/studio/client/src/pages/workspace/ui/workspace-page.tsx`
- Delete or stop using as index: `apps/studio/client/src/pages/workspace-gate/ui/workspace-gate-page.tsx`

**Interfaces:**
- Produces: `WorkspacePage` на `/` и на `/:workspaceId/{kind}/...`; legacy redirect layer

- [ ] **Step 1: Route tree**

```ts
const routes: RouteObject[] = [
  {
    element: <StudioLayout />,
    children: [
      { index: true, element: <WorkspacePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/:category', element: <SettingsPage /> },
      { path: 'settings/:category/:providerId', element: <SettingsPage /> },
      {
        path: ':workspaceId',
        element: <WorkspacePage />,
        children: [
          { path: 'thread/:threadId', element: null },
          { path: 'file/*', element: null },
          { path: 'diff/*', element: null },
          { path: 'schedule/:scheduleId', element: null },
          { path: 'webhook/:webhookId', element: null },
          { path: 'spawn/:threadId/:spawnId', element: null },
        ],
      },
      { path: 'w/*', element: <LegacyWorkspaceRedirect /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];
```

`settings` объявить **выше** `:workspaceId`. Голого `:workspaceId` index не должно открывать ресурс: если path = `/:workspaceId` без kind, redirect на `/`.

- [ ] **Step 2: `LegacyWorkspaceRedirect`**

Один слой. Таблица из desk-спеки:

| было | стало |
|---|---|
| `/w/:ws/thread/:id` + любой origin query | chat → `/:ws/thread/:id`; primary automation thread → `/:ws/schedule\|webhook/:id` (после hydrate, см. Task 5) |
| `/w/:ws/file/*` | `/:ws/file/*` |
| `/w/:ws/settings/...` | `/settings/...` |
| `/w/:ws`, `/w/:ws/agent/:id` | `/` |

Для thread redirect на automation нужен kind треда: в redirect можно сначала перейти на `/:ws/thread/:id`, Task 5 сделает канон. Query origin выбросить сразу (`replace`).

- [ ] **Step 3: Gate**

`/` больше не рендерит `WorkspaceGatePage`. Страницу не обязательно удалять в этом PR, если на неё нет ссылок; снять с index и с `Navigate to={studioPath.gate}`. Create workspace: ⋯ меню (Phase 0) и пустой стол.

`WorkspaceGuard` / `resolveStudioEntry` / `OpeningDesk` как обязательный вход удалить. Hydrate остаётся в `DeskSync`.

`openSettings` на settings page «Back» → `studioPath.desk`, не `openWorkspace`.

- [ ] **Step 4: Lint / typecheck / commit**

```bash
bun run lint
bun run typecheck
git add apps/studio/client/src/app apps/studio/client/src/pages
git commit -m "feat(studio): desk routes without /w and without gate home"
```

---

### Task 3: Park и visible desk

**Files:**
- Modify: `apps/studio/client/src/features/ide/model/ide.store.ts`
- Modify: `apps/studio/client/src/features/ide/model/ide-persist.ts`
- Modify: `apps/studio/client/src/features/ide/index.ts`
- Modify: `apps/studio/client/src/pages/workspace/ui/workspace-page.tsx`
- Modify: `apps/studio/client/src/pages/workspace/ui/ide-layout-view.tsx`
- Modify: `apps/studio/client/src/widgets/ide-tabs/ui/ide-tabs.tsx`
- Modify: `apps/studio/client/src/features/ide/model/ide-sync.ts`

**Interfaces:**

```ts
export type IdeTabKind =
  | 'thread'
  | 'file'
  | 'spawn'
  | 'diff'
  | 'schedule'
  | 'webhook';

export type VisibleDesk = {
  tabs: IdeTab[];
  activeId: string | null;
};
```

Park: `byWorkspace[id]` не удалять при toggle off. Visible = concat tabs (и groups внутри workspace) для id из `useSelectedWorkspaceIds()` в порядке selection. Cross-workspace split не собирать: для v1 этой фазы показывать группы каждого selected workspace последовательно. Закон URL от этого не меняется.

- [ ] **Step 1: kinds**

Добавить `schedule` / `webhook` в `IdeTabKind` и persist sanitize (`ide-persist.ts` alive set). Поля: `scheduleId?`, `webhookId?` на `IdeTab`. `openSchedule(workspaceId, scheduleId, threadId, agentId)`, `openWebhook(...)`.

- [ ] **Step 2: `useVisibleDesk`**

Новый хук в `features/ide/model/visible-desk.ts`, экспорт из `index.ts`:

```ts
export function useVisibleDesk(): VisibleDesk {
  const ids = useSelectedWorkspaceIds();
  const byWorkspace = useIdeStore((s) => s.byWorkspace);
  const tabs = ids.flatMap((id) => byWorkspace[id]?.tabs ?? []);
  const activeId =
    ids.map((id) => byWorkspace[id]?.activeId).find((id) => id) ?? null;
  return { tabs, activeId };
}
```

Active стола один: при `setActive` сбрасывать active других visible workspace (в store action `setDeskActive(workspaceId, tabId)`). Toggle off workspace, чей tab был active: взять последний visible tab другого included workspace или `navigate('/')`.

`WorkspacePage` / `IdeLayoutView` читают visible desk, не `useIdeTabs(urlWorkspaceId)`.

- [ ] **Step 3: `useIdeSync`**

Закон: active visible tab ↔ URL.

- URL resource: `selection.add(workspaceId)`, `open*` соответствующего kind, hydrate если нужно.
- Смена таба: `navigate(studioPath.*)` без origin query.
- Spawn/diff: писать URL (сейчас не пишут).
- Toggle off active workspace: URL на другой visible tab или `/`.
- Confirm на toggle off нет.

- [ ] **Step 4: Lint / typecheck / commit**

```bash
bun run lint
bun run typecheck
git add apps/studio/client/src/features/ide apps/studio/client/src/pages/workspace \
  apps/studio/client/src/widgets/ide-tabs
git commit -m "feat(studio): visible desk parks IDE tabs by selection"
```

---

### Task 4: Deep link = `selection.add`

**Files:**
- Modify: `apps/studio/client/src/features/desk/ui/desk-sync.tsx`
- Modify: `apps/studio/client/src/widgets/workspace-sidebar/model/workspace-tabs.store.ts` (уже есть `add` из Phase 0)

- [ ] **Step 1**

При ненулевом `focus.workspaceId` (thread/file/diff/schedule/webhook/spawn): `useWorkspaceTabsStore.getState().add(workspaceId)` до hydrate. Не вызывать `toggle` и не чистить остальных.

Hydrate этого id, затем open tab. `DeskSync` уже гидратит все известные workspace: оставить, плюс гарантировать id из URL.

Уведомления/tray в клиенте нет: контракт тот же для любого входа на URL.

- [ ] **Step 2: Lint / typecheck / commit**

```bash
git commit -m "feat(studio): deep link adds workspace to selection"
```

---

### Task 5: Schedule, webhook, spawn поверхности и канон thread

**Files:**
- Modify: `apps/studio/client/src/widgets/ide-content/ui/ide-content.tsx`
- Modify: `apps/studio/client/src/widgets/ide-home/ui/ide-home.tsx`
- Modify: `apps/studio/client/src/widgets/workspace-sidebar/ui/automations-section.tsx`
- Modify: `apps/studio/client/src/features/ide/model/open-ide.ts`
- Modify: `apps/studio/client/src/features/ide/model/ide-sync.ts`
- Modify: виджеты agent-dashboard / thread-actions, которые открывают schedule/webhook через `studioPath.thread(..., { kind: 'scheduler' })`

**Interfaces:**
- Tab `schedule` / `webhook`: шапка (имя, статус, cron или URL/метод, агент, pause, ⋯ config modal) + `ThreadJournal` primary thread. Composer нет.
- Config modal только из UI (существующие `openScheduleConfigDialog` / `openWebhookConfigDialog`), не из deep link.

- [ ] **Step 1: Open from Automations**

После create и по клику строки: `openSchedule` / `openWebhook` + `studioPath.schedule|webhook`. Не thread URL.

- [ ] **Step 2: Redirect primary thread**

В `useIdeSync` после hydrate: если URL `/:ws/thread/:threadId` и тред `kind === 'schedule' | 'webhook'`, `replace` на `/:ws/schedule/:id` или webhook. Id автоматизации: найти в schedule/webhook store по `threadId`. HITL/inbox open thread: тот же redirect.

Обычный `thread.kind === 'chat'`: без redirect.

- [ ] **Step 3: Spawn URL**

`useOpenSpawnTab`: `navigate(studioPath.spawn(workspaceId, threadId, spawnId))`. `useIdeSync` открывает spawn tab с URL. Вложенный spawn: тот же шаблон. Park вместе с parent workspace.

- [ ] **Step 4: Diff URL**

`openDiff` пишет `studioPath.diff`. Роут уже в Task 2.

- [ ] **Step 5: Webhook origin**

Не собирать абсолютный URL из `window.location` / `location.origin`. Поле `endpoint` как относительный `/api/workspaces/:id/hooks/:id` (сервер уже так пишет). Показ абсолютного origin: Phase 6.

- [ ] **Step 6: Lint / typecheck / commit**

```bash
git commit -m "feat(studio): schedule webhook spawn as focus kinds"
```

Шапка automation: если вынести из `ide-content.tsx` (файл уже около лимита), новый виджет рядом по ответственности `automation-surface`, не `helpers.ts`.

---

### Task 6: Inbox/events контракт

**Files:**
- Modify: `apps/studio/client/src/features/desk/model/use-desk.ts` (`useWaitingThreads`)
- Read: `apps/studio/client/src/shared/api/desk.ts`, `apps/studio/server/src/adapters/http/workspace/workspace-file-routes.ts` (`GET /api/desk/watch`)

- [ ] **Step 1**

Не добавлять `GET /api/inbox`. Inbox = merge в окне: `useWaitingThreads(selectedIds)` как сейчас. SSE: клиент может остаться на `/api/desk/watch` (один host); фильтр событий по `workspaceId` на клиенте в `applyDeskEvent`. Не переводить inbox на SQL join «все workspace».

Подписка `GET /api/workspaces/:id/desk/watch` уже есть на сервере. Для Phase 1 один global watch допустим (один процесс). Комментарий в `desk.ts`: fan-out по host — Phase 6; контракт merge остаётся в окне.

- [ ] **Step 2: Commit** только если менялся код/комментарий контракта.

---

### Task 7: Пустой стол и settings path

**Files:**
- Modify: `apps/studio/client/src/pages/settings/ui/settings-page.tsx` (back, `studioPath.settings` без ws)
- Modify: `apps/studio/client/src/widgets/workspace-sidebar/ui/workspace-sidebar.tsx` footer
- Modify: `apps/studio/client/src/pages/workspace/ui/workspace-page.tsx` empty state

- [ ] **Step 1**

Selection пустой, URL `/`: сайдбар без групп, центр пустой стол (не IdeHome одного workspace как «выберите агента» обязательный gate). Кнопка/⋯ New workspace доступна.

Footer Settings: `openSettings()` → `/settings`, даже если selected пуст и URL `/`.

- [ ] **Step 2: Lint / typecheck / commit**

```bash
git commit -m "feat(studio): empty desk and window settings path"
```

---

## Приёмка Phase 1 (desk-спека, без модалки ноды)

- Toggle; два included workspace: секции обеих; в центре табы обоих (без cross-split).
- Выкл → вкл: tabs + dirty на месте (`harnesys.ide-workspaces`).
- Выкл всех → `/`, park не стёрт.
- Deep link на выключенный workspace: add, остальные selection на месте.
- `/:ws/schedule/:id` и webhook: шапка + journal; config modal только из UI.
- `/:ws/spawn/:threadId/:spawnId` синхронизирован с active spawn.
- Primary automation thread по `/thread/...` redirect на automation URL.
- `/w/...` redirect; `?agent=` / `?scheduler=` / `?webhook=` не пишутся.
- `/settings` открывается без workspace в path (nav ещё смешанный).
- `bun run lint` / `typecheck` зелёные.

**Не в этой фазе:** `workspace.db`, pairing, store isolation, модалка General/Capabilities.
