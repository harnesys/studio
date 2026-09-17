# Sidebar toggle and section groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Шапка стола совпадает с мокапом: click по аватару = toggle selection, секции сайдбара показывают группы всех включённых workspace, форма New workspace остаётся на текущем локальном API.

**Architecture:** Selection уже в `useWorkspaceTabsStore` (`harnesys.workspace-tabs`). Сейчас plain click делает exclusive `select` + navigate на `/w/:id`, multi только с shift/ctrl. Inbox уже группирует по `useSelectedWorkspaceIds`. Остальные секции читают `workspaceId` из URL. Phase 0 не трогает роутер, `studio.db` и pairing.

**Tech Stack:** React, Zustand, существующие виджеты сайдбара.

**Spec:** `docs/superpowers/specs/2026-09-17-multi-workspace-desk-design.md` (toggle). Packaging UX сайдбара в `docs/superpowers/specs/2026-09-16-packaging-federation-design.md` (группы), desk-спека побеждает shift/control.

**Sequence:** `docs/superpowers/plans/2026-09-17-multi-workspace-implementation-sequence.md` Phase 0.

## Global Constraints

- Тесты `*.test.ts` / `*.spec.ts` запрещены (`AGENTS.md`). Не создавать vitest / RTL / playwright.
- Приёмка шага: `bun run lint` и `bun run typecheck` из корня репо. Ручная проверка / agent-browser только по явному разрешению в ходе.
- Публичный API `packages/harnesys` не менять.
- Именованные типы, не индекс `T['field']`.
- FSD: импорт слайса только из `index.ts`.
- Не делать Phase 1+ «заодно»: никаких новых роутов, `workspace.db`, destructive General, реального pairing.
- Не поднимать второй dev-сервер, если `:3000` / `:5173` уже слушают.

---

## File map

| файл | ответственность |
|---|---|
| `apps/studio/client/src/widgets/workspace-sidebar/model/workspace-tabs.store.ts` | `toggle` как единственный клик; `add`; selected без live-fallback на URL |
| `apps/studio/client/src/widgets/workspace-sidebar/ui/workspace-header.tsx` | click = toggle; ⋯ overflow = toggle |
| `apps/studio/client/src/widgets/workspace-sidebar/ui/workspace-sidebar.tsx` | секции получают `workspaceIds` из selection |
| `apps/studio/client/src/widgets/workspace-sidebar/ui/agents-section.tsx` | группы по selection |
| `apps/studio/client/src/widgets/workspace-sidebar/ui/automations-section.tsx` | группы по selection |
| `apps/studio/client/src/widgets/workspace-sidebar/ui/files-section.tsx` | корень = workspace на каждый selected id |
| `apps/studio/client/src/widgets/workspace-sidebar/ui/git-section.tsx` | группа = workspace |
| `apps/studio/client/src/features/create-workspace/ui/workspace-fields.tsx` | host select: только local; без пункта Connect a new host |
| `docs/superpowers/specs/2026-09-16-packaging-federation-design.md` | UX: click toggle, без shift/control |

Паттерн групп: `InboxSection` + `WorkspaceGroupLabel` в `ui/workspace-group.tsx`.

---

### Task 1: Toggle без модификаторов

**Files:**
- Modify: `apps/studio/client/src/widgets/workspace-sidebar/model/workspace-tabs.store.ts`
- Modify: `apps/studio/client/src/widgets/workspace-sidebar/ui/workspace-header.tsx`

**Interfaces:**
- Consumes: `WORKSPACE_TABS_STORAGE_KEY`, `useWorkspaces`
- Produces:

```ts
type WorkspaceTabsState = {
  selected: string[];
  toggle: (id: string) => void;
  add: (id: string) => void;
};
```

`select(id)` (exclusive replace) удалить. `add` нужен Phase 1 для deep link; в Phase 0 им пользуется seed при пустом LS.

- [ ] **Step 1: Store**

В `workspace-tabs.store.ts` заменить state:

```ts
type WorkspaceTabsState = {
  selected: string[];
  toggle: (id: string) => void;
  add: (id: string) => void;
};

export const useWorkspaceTabsStore = create<WorkspaceTabsState>((set, get) => ({
  selected: loadSelected(),
  toggle: (id) => {
    const current = get().selected;
    const next = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id];
    persistSelected(next);
    set({ selected: next });
  },
  add: (id) => {
    const current = get().selected;
    if (current.includes(id)) {
      return;
    }
    const next = [...current, id];
    persistSelected(next);
    set({ selected: next });
  },
}));
```

`useSelectedWorkspaceIds`: убрать fallback `return workspaceId ? [workspaceId] : []`. Фильтр = `selected.filter((id) => known.has(id))`. Пустой selected = пустые группы.

Одноразовый seed, если LS пуст и в URL есть workspace (чтобы первый заход после обновления не обнулил секции до клика):

```ts
export function seedWorkspaceSelection(workspaceId: string): void {
  const selected = useWorkspaceTabsStore.getState().selected;
  if (selected.length === 0) {
    useWorkspaceTabsStore.getState().add(workspaceId);
  }
}
```

Вызов: в `WorkspaceHeader` или `WorkspaceSidebar` один `useEffect` на `useStudioLocation().workspaceId`. Не делать live-fallback: после `toggle` последнего таба selected остаётся `[]`.

- [ ] **Step 2: Header click**

В `workspace-header.tsx` убрать `selectSingle` и проверку `shiftKey || metaKey || ctrlKey`.

```ts
const toggle = useWorkspaceTabsStore((state) => state.toggle);

onClick={() => {
  toggle(item.id);
}}
```

Overflow «More workspaces»: тот же `toggle(item.id)`, не exclusive select. `openWorkspace` / navigate **не** вызывать из клика таба (URL = Phase 1). New workspace в ⋯ оставить: после create `add(created.id)` вместо `openWorkspace(created.id)` если navigate ещё требует `/w/:id` (сейчас страница живёт только под `/w/:id`). Пока роутер старый: после create вызвать `add(created.id)` **и** `openWorkspace(created.id)`, иначе Studio упрётся в gate. Это исключение до Phase 1.

Удалить неиспользуемый `select` из импортов.

- [ ] **Step 3: Lint / typecheck**

```bash
bun run lint
bun run typecheck
```

Expected: 0. Починить оставшиеся импорты `select`.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/client/src/widgets/workspace-sidebar/model/workspace-tabs.store.ts \
  apps/studio/client/src/widgets/workspace-sidebar/ui/workspace-header.tsx
git commit -m "feat(studio): workspace tab click toggles selection"
```

---

### Task 2: Группы секций по selection

**Files:**
- Modify: `apps/studio/client/src/widgets/workspace-sidebar/ui/workspace-sidebar.tsx`
- Modify: `apps/studio/client/src/widgets/workspace-sidebar/ui/agents-section.tsx`
- Modify: `apps/studio/client/src/widgets/workspace-sidebar/ui/automations-section.tsx`
- Modify: `apps/studio/client/src/widgets/workspace-sidebar/ui/files-section.tsx` (и связанные `ExplorerContent` / title)
- Modify: `apps/studio/client/src/widgets/workspace-sidebar/ui/git-section.tsx`
- Modify: `apps/studio/client/src/features/desk/model/use-desk.ts` при необходимости хуков `useWorkspaceAgents` / schedules / webhooks на массив id

**Interfaces:**
- Consumes: `useSelectedWorkspaceIds()`, `WorkspaceGroupLabel`
- Produces: секции принимают `workspaceIds: string[]`, не один URL id

Паттерн (как `InboxSection`):

```ts
for (const id of workspaceIds) {
  const workspace = workspaces.find((item) => item.id === id);
  if (!workspace) continue;
  const items = allItems.filter((item) => item.workspaceId === id);
  // WorkspaceGroupLabel + rows
}
```

- [ ] **Step 1: Данные с selection**

В `workspace-sidebar.tsx` Agents / Automations / Git / Explorer больше не брать `useWorkspaceAgents(workspaceId)` и т.п. с URL. Собрать по `workspaceIds`. URL `workspaceId` оставить только там, где нужен focus (active thread, inspector) до Phase 1.

Добавить в `use-desk.ts` (рядом с `useWaitingThreads`):

```ts
export function useAgentsInWorkspaces(workspaceIds: string[]) {
  return useAgentStore(
    useShallow((state) =>
      state.items.filter((item) => workspaceIds.includes(item.workspaceId)),
    ),
  );
}
```

Аналогично schedules / webhooks, если текущие хуки принимают один id. Имена: `useAgentsInWorkspaces`, `useSchedulesInWorkspaces`, `useWebhooksInWorkspaces`. Не `T['workspaceId']`.

- [ ] **Step 2: Agents и Automations**

`AgentsSection` / `AutomationsSection`: проп `workspaceIds: string[]`. Внутри группы через `WorkspaceGroupLabel`. Сортировка внутри группы как сейчас. Меню ⋯ «settings» агента/schedule/webhook остаётся на сущности (модалка агента не Phase 0).

Пустой selected: пустое состояние секции (текст как у Inbox «No waiting items» по смыслу секции), не группы URL-workspace.

- [ ] **Step 3: Explorer и Git**

Explorer: для каждого id в `workspaceIds` отдельный блок, корень = имя workspace, дерево файлов через существующий API `listWorkspaceFiles(id)`. Деревья раскрываются независимо. Не делать один плоский список.

Git: группа = workspace, заголовок группы с веткой и счётом из текущего git status API на этот id. Суммарный счёт секции = сумма групп.

Если `files-section.tsx` / `git-section.tsx` раздуты далеко за 300 строк после групп, резать по ответственности (группа explorer vs дерево одного workspace), не по слою `types.ts`.

- [ ] **Step 4: Lint / typecheck**

```bash
bun run lint
bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/studio/client/src/widgets/workspace-sidebar \
  apps/studio/client/src/features/desk
git commit -m "feat(studio): sidebar sections group by workspace selection"
```

---

### Task 3: New workspace без pairing CTA

**Files:**
- Modify: `apps/studio/client/src/features/create-workspace/ui/workspace-fields.tsx`
- Modify: `apps/studio/client/src/features/create-workspace/ui/workspace-details-dialog.tsx` только если submit ещё смотрит на `NEW_HOST_ID`

**Interfaces:**
- Consumes: `LOCAL_HOST`, `LOCAL_HOST_ID`
- Produces: форма host → name → folder; hostItems без `NEW_HOST_ID` и без remotes

- [ ] **Step 1: Host field**

В `workspace-fields.tsx` `hostItems` = один пункт `LOCAL_HOST`. Не рендерить `HostPairFields`. Select можно оставить (один пункт) как в мокапе «Хост». Файл `host-pair-fields.tsx` и `hosts.store.ts` не удалять: Phase 6. Не вызывать `pairHost`.

Submit create по-прежнему `POST /api/workspaces` `{ name?, path? }`. Remote path текстом не включать.

- [ ] **Step 2: Lint / typecheck и commit**

```bash
bun run lint
bun run typecheck
git add apps/studio/client/src/features/create-workspace
git commit -m "fix(studio): create workspace form stays on local host"
```

---

### Task 4: Packaging UX sync

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-packaging-federation-design.md` секция «UX: сайдбар и workspace»

- [ ] **Step 1: Текст**

Заменить абзац про «Мультиселект табов (shift/control)» на: клик по табу-аватару и пункт в ⋯ = toggle on/off, без shift/control. Канон: desk-спека `2026-09-17-multi-workspace-desk-design.md`. Остальной packaging (pairing в форме New workspace, артефакты) не переписывать: pairing CTA в форме отключён до Phase 6, это уже сказано в sequence.

Комментарий в `sidebar-mockup.html` про shift/control, если ещё врёт, поправить одной строкой под JS (`classList.toggle`).

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-09-16-packaging-federation-design.md sidebar-mockup.html
git commit -m "docs: workspace tabs are click toggle, not shift/control"
```

---

## Приёмка Phase 0

- Два+ workspace: click по второму аватару включает его, первый остаётся included; секции показывают обе группы.
- Click по included табу выключает его; его группа пропадает; park IDE не обязан (Phase 1).
- ⋯ overflow toggle работает так же.
- Модификаторы shift/ctrl/meta не нужны и не меняют модель.
- New workspace: поля host (This machine), name, folder; нет «Connect a new host».
- `bun run lint` и `bun run typecheck` зелёные.

**Не в этой фазе:** новые роуты, gate, park, schedule/webhook kinds, `config.json`, wipe ноды.

**Не проверял в плане:** текущую разметку Explorer/Git после групп на узком сайдбаре (ручная проверка на стенде хозяина).
