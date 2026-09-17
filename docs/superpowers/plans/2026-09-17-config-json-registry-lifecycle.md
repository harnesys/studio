# `config.json` registry and node lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `~/.harnesys/config.json` становится каталогом локальных нод (`host.nodes`) и persist стола (`window.desk`). Id назначает host. Scan диска не source of truth.

**Architecture:** Один файл, две секции. Пока один процесс, запись всё равно через два модуля: host-секция и window-секция не затирают чужое. Таблица `workspaces` в `studio.db` перестаёт быть SoT списка: остаётся FK-родителем domain-строк до Phase 4b. Create: UUID на host, path уникален на этом host, adopt папки с `.harnesys/` = новый id.

**Tech Stack:** Bun `fs`, JSON, существующий `CreateWorkspaceUseCase`.

**Spec:** `docs/superpowers/specs/2026-09-17-workspace-node-design.md` Persist (машина).

**Sequence:** Phase 3.

## Global Constraints

- Тесты запрещены. `bun run lint` / `typecheck`.
- Один `config.json`, не `host.json` / `window.json` / отдельный `host.token`.
- Окно не сканирует диск вместо реестра.
- Id выдаёт host (`crypto.randomUUID()` как сейчас в create). Окно id не генерирует.
- Destructive wipe db+каталог не в этой фазе (набросок UI можно, confirm wipe — Phase 4b).
- Не менять публичный API `packages/harnesys`.
- Не поднимать второй стенд.

---

## File map

| файл | ответственность |
|---|---|
| `apps/studio/server/src/domain/machine-config.ts` | типы секций (named) |
| `apps/studio/server/src/adapters/machine-config/machine-config.file.ts` | atomic read/write, writers |
| `apps/studio/server/src/application/nodes/node-registry.ts` | SoT `host.nodes` |
| `apps/studio/server/src/application/workspaces/create-workspace.use-case.ts` | create/adopt через registry |
| `apps/studio/server/src/application/workspaces/list-workspaces.use-case.ts` | list из `host.nodes` |
| `apps/studio/server/src/application/workspaces/update-workspace.use-case.ts` | name/path в registry |
| `apps/studio/server/src/composition/studio.ts` | boot: migrate table → `host.nodes` |
| `apps/studio/client/src/features/desk/model/desk-chrome.ts` (или window persist) | selection+park в API window.desk |
| `apps/studio/server/src/adapters/http/...` | GET/PUT window desk, node status |
| `docs/superpowers/specs/2026-09-16-packaging-federation-design.md` | `host.token` файл → `config.json` |

Клиентский LS `harnesys.workspace-tabs` / `harnesys.ide-workspaces` мигрирует в `window.desk` после появления API.

---

## Types

`apps/studio/server/src/domain/machine-config.ts` (и зеркало в `apps/studio/shared` если клиент читает desk через API):

```ts
export type HostNodeRecord = {
  id: string;
  path: string;
  name: string;
};

export type HostNodeStatus = 'ready' | 'unavailable';

export type HostSection = {
  listen: string;
  token: string;
  nodes: HostNodeRecord[];
};

export type WindowHostRecord = {
  id: string;
  baseUrl: string;
  credential: string;
};

export type IdeTabKind =
  | 'thread'
  | 'file'
  | 'spawn'
  | 'diff'
  | 'schedule'
  | 'webhook';

export type PersistedIdeTab = {
  id: string;
  kind: IdeTabKind;
  workspaceId: string;
  agentId?: string;
  threadId?: string;
  spawnId?: string;
  scheduleId?: string;
  webhookId?: string;
  path?: string;
  dirty?: boolean;
};

export type PersistedIdeWorkspace = {
  tabs: PersistedIdeTab[];
  activeId: string | null;
};

export type WindowDesk = {
  selectedNodeIds: string[];
  park: Record<string, PersistedIdeWorkspace>;
};

export type WindowSection = {
  hosts: WindowHostRecord[];
  desk: WindowDesk;
};

export type MachineConfig = {
  host: HostSection;
  window: WindowSection;
};
```

`HostNodeRecord` не содержит соседний каталог. `workspace.db` в Phase 3 можно не создавать (заготовка каталога `.harnesys/` уже есть через mcp.json / gitignore). Stub sqlite — решение: **не** создавать пустой `workspace.db` в Phase 3, чтобы не плодить второй store до 4b. Каталог `.harnesys/` как сейчас.

Default listen: `127.0.0.1:3000`. Token: сгенерировать `crypto.randomUUID()` при первом write, если пусто (Phase 5 начнёт требовать Bearer; до того поле лежит в файле).

`window.hosts[0]` заготовка local:

```ts
{
  id: 'local',
  baseUrl: 'http://127.0.0.1:3000',
  credential: host.token
}
```

Писать при первой инициализации. Phase 5 использует ту же строку.

---

### Task 1: File IO и писатели секций

**Files:**
- Create: `apps/studio/server/src/domain/machine-config.ts`
- Create: `apps/studio/server/src/adapters/machine-config/machine-config.file.ts`
- Modify: `apps/studio/server/src/adapters/store/studio-layout.ts` путь `config.json` рядом с home

**Interfaces:**

```ts
export type MachineConfigPort = {
  read(): MachineConfig;
  writeHost(patch: Partial<HostSection>): MachineConfig;
  writeWindow(patch: Partial<WindowSection>): MachineConfig;
};
```

- [ ] **Step 1**

Путь: `join(defaultHomePath(), 'config.json')`. Read: нет файла → defaults (listen из `env.port`, token generate, nodes `[]`, window.hosts local, desk empty). Parse JSON; неизвестные ключи верхнего уровня сохранять при write (не обязательно nested).

Atomic write: write `config.json.tmp` + `rename`. `writeHost`: read, replace только `host` (+ не трогать `window`). `writeWindow`: наоборот. Host-код не вызывает `writeWindow`. Client desk persist ходит в HTTP, который зовёт `writeWindow`.

- [ ] **Step 2: Lint / typecheck / commit** `feat(studio): machine config.json host and window writers`

---

### Task 2: Node registry = SoT

**Files:**
- Create: `apps/studio/server/src/application/nodes/node-registry.ts`
- Modify: `list/create/update` workspace use cases
- Modify: `composition/studio.ts` boot migrate

**Interfaces:**

```ts
export type NodeRegistry = {
  list(): HostNodeRecord[];
  get(id: string): HostNodeRecord | undefined;
  status(id: string): HostNodeStatus;
  create(input: { name: string; path: string }): HostNodeRecord;
  update(id: string, patch: { name?: string; path?: string }): HostNodeRecord;
  removeFromHost(id: string): void;
};
```

`status`: `inspect(path).exists` → `ready` иначе `unavailable`. Не auto-delete.

`create`:
- path уникален среди `host.nodes` (и среди `workspaces` table пока она жива).
- name уникален **на этом host**.
- id = `crypto.randomUUID()`.
- Папка с уже лежащим `.harnesys/`: всё равно новый id (adopt ≠ copy identity).
- Дописать `host.nodes`; insert в `workspaces` table с тем же id (FK до 4b).
- `ensureHarnesysIgnored` как сейчас.

`list` HTTP `GET /api/workspaces`: из `host.nodes`, не `workspaceRepo.list()` как SoT. Опционально поле `status`.

Boot migrate (один раз): если `host.nodes.length === 0` и `workspaceRepo.list().length > 0`, записать nodes из таблицы (id/path/name сохранить). После этого list всегда из config.

`delete` HTTP в Phase 3: `removeFromHost` = вон из `host.nodes` + stop не требуется (один runtime). Domain rows в `studio.db` пока не трогать **или** оставить текущий `DeleteWorkspaceUseCase` как «снять с host + стереть rows в studio.db, папка на диске остаётся» (сегодняшнее поведение). Wipe файлов пользователя не делать. Не сканировать диск, чтобы «найти потерянные» workspace.

- [ ] **Step 1: Registry + migrate на boot.**
- [ ] **Step 2: Create/list/update use cases.**
- [ ] **Step 3: Lint / typecheck / commit** `feat(studio): host.nodes is local workspace catalog`

---

### Task 3: Window desk persist

**Files:**
- Create server: `GET /api/window/desk`, `PUT /api/window/desk` (body `WindowDesk`)
- Modify: `apps/studio/client/src/widgets/workspace-sidebar/model/workspace-tabs.store.ts`
- Modify: `apps/studio/client/src/features/ide/model/ide-persist.ts`

- [ ] **Step 1: API**

Controller тонкий, зовёт `writeWindow({ desk })` / read `config.window.desk`. Нет auth до Phase 5.

- [ ] **Step 2: Client**

На старте: `GET /api/window/desk`. Если `selectedNodeIds.length > 0` или park не пуст, это правда; иначе мигрировать `localStorage` ключи `harnesys.workspace-tabs` и `harnesys.ide-workspaces` один раз, `PUT`, затем удалить ключи LS.

Дальше `toggle`/`add` и persist IDE пишут debounce PUT `window.desk` (selection + park). Host не читает desk.

- [ ] **Step 3: Lint / typecheck / commit** `feat(studio): persist desk chrome in config.json window.desk`

---

### Task 4: Lifecycle минимум в API

**Files:**
- Modify: workspace HTTP
- Modify: create-workspace form остаётся local

Операции:

| HTTP | смысл |
|---|---|
| PATCH name/path | registry + table replica |
| DELETE `/api/workspaces/:id` | снять с host (`removeFromHost`); rows в studio.db по текущему delete use case; папка остаётся |
| GET list + `status` | unavailable если path пропал |

Клиент: недоступная нода остаётся в списке (не вычищать). UI пометки достаточно `status` в JSON; большой chrome не обязателен.

- [ ] **Commit** `feat(studio): node lifecycle on host.nodes`

---

### Task 5: Packaging doc sync

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-packaging-federation-design.md`

Заменить «токен локального хоста лежит в `~/.harnesys/host.token`» на секцию `host.token` внутри `~/.harnesys/config.json`. Docker/CLI: данные = `config.json` + позже пути нод, не один volume `studio.db`. Не переписывать всю упаковку.

- [ ] **Commit** `docs: host token lives in config.json`

---

## Приёмка Phase 3

- Рестарт процесса: список локальных workspace из `host.nodes`.
- Новый workspace: id с сервера, запись в config, path уникален.
- Папка без директории: нода в списке, `unavailable`, не удалена.
- Adopt существующего `.harnesys/` в папке: новый id.
- Reload окна: selection и park из `window.desk`.
- Grep: list API не использует диск как SoT.
- `bun run lint` / `typecheck`.

**Не в этой фазе:** модалка Capabilities, `workspace.db`, process split, wipe каталога.
