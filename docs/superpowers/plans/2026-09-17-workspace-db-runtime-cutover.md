# `workspace.db` and N node-runtime cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Domain каждой ноды живёт в `<workspace>/.harnesys/workspace.db`. Host супервизор N runtime. Cutover: останов → перенос → старт. Крон и HITL ноды A не трогают run B.

**Architecture:** Не dual-write на живых run. `createStudioStore` становится фабрикой на путь файла. `wireRuntime` / memory / tickers / claimer создаются **на ноду**. HTTP резолвит node id → runtime. `WorkspaceHarnesysRegistry` остаётся кэшем handle, но каждый handle получает **свой** lifecycle/events/claimer. `workspaces` таблицы в файле ноды нет. Host-global FS (`~/.harnesys/skills|plugins|presets`) перестаёт быть live-слоем: seed в `<workspace>/.harnesys/...` при cutover/create; bundled overlay остаётся.

**Tech Stack:** better-sqlite3 / drizzle на N файлов, существующие ticker adapters.

**Spec:** node-design Persist (нода); packaging always-on.

**Sequence:** Phase 4b.

## Global Constraints

- Тесты запрещены. `bun run lint` / `typecheck`.
- `workspace.db` открывает только server/host процесс.
- Горячий dual-write двух sqlite запрещён. Dual-read только как ручной мост разработки, не модель cutover.
- Копия папки ≠ тот же id.
- Secret store: ключ с node id. Окно в keychain не ходит.
- Публичный API harnesys не менять: подать другой store в те же порты.
- Не начинать Phase 5 в этом плане.
- Не поднимать второй стенд во время cutover хозяина: сказать, что нужен рестарт **его** процесса, не поднимать свой.

---

## File map

| файл | ответственность |
|---|---|
| `apps/studio/server/src/composition/create-store.ts` | `createStudioStore({ dbPath })` |
| `apps/studio/server/src/composition/node-supervisor.ts` | Map nodeId → `NodeRuntime` |
| `apps/studio/server/src/composition/studio.ts` | boot из `host.nodes` |
| `apps/studio/server/src/composition/wire-runtime.ts` | per-db, не один db на процесс |
| `apps/studio/server/src/composition/wire-schedules.ts` | ticker на ноду |
| `apps/studio/server/src/application/nodes/cutover-studio-db.ts` | перенос строк |
| `apps/studio/server/src/adapters/store/studio-layout.ts` | пути plugin/skills на ноду |
| `apps/studio/server/src/adapters/secret-store-macos.adapter.ts` | account `nodeId:...` |
| `docs/ROADMAP.md`, packaging spec | `studio.db` → N `workspace.db` + пути |

---

## Types

```ts
export type NodeRuntime = {
  node: HostNodeRecord;
  store: StudioStore;
  runtime: StudioRuntime;
  memory: StudioMemoryPorts;
  stop: () => void;
};

export type NodeSupervisor = {
  get(id: string): NodeRuntime | undefined;
  list(): NodeRuntime[];
  start(node: HostNodeRecord): NodeRuntime;
  stop(id: string): void;
};
```

HTTP: `c.req.param('workspaceId')` → `supervisor.get(id)`; 404 если нет в `host.nodes`; 503 если `status === 'unavailable'`.

---

### Task 1: Store factory и schema без каталога соседей

**Files:** `create-store.ts`, schema `workspaces.ts`

Файл ноды: `join(studioDir(node.path), 'workspace.db')`. Bootstrap schema тот же, **без** таблицы `workspaces` как списка машины (не создавать её в новом файле, или оставить одну служебную строку identity — предпочтение: **не класть каталог соседей**). Domain rows: колонка `workspace_id` может остаться константой = node id (меньше правок repos); не хранить другие id.

`createSqliteConnection(dbPath)` на каждый файл. `externalDb` для ticker skip больше не использовать как «нет тикера»: тикер запускается per node в supervisor.

- [ ] **Commit** `feat(studio): studio store opens workspace.db by path`

---

### Task 2: Node supervisor + tickers

**Files:** new `node-supervisor.ts`, `studio.ts`, `wire-runtime.ts`, `wire-schedules.ts`, `wire-webhooks.ts`, `wire-memory.ts`, `create-host.ts`

Сейчас `wireRuntime` создаёт один `SqliteRunLifecycleStore(db)` и один claimer на 5s на всю таблицу `runs`. После: каждый `NodeRuntime` имеет свой db, свой claimer, свой `startAskTicker` / `startWaitTicker`, свой `FireDueSchedulesUseCase` на `store.scheduleRepo`.

`ScheduleFireQueue` per node. Knowledge indexer / `KnowledgeWatchBridge` / `FilesWatcherAdapter` уже keyed by workspaceId: привязать к store этой ноды, не к общему db.

`WorkspaceHarnesysRegistry`: либо один registry с `get` → runtime wiring **этой** ноды, либо map registry на ноду. Не передавать shared `WorkspaceRuntimeWiring` от чужого sqlite.

`createStudio()`: read `host.nodes`, `start` каждую ready ноду. Unavailable: не открывать db, HTTP 503.

- [ ] **Step 1: Supervisor start/stop.**
- [ ] **Step 2: HTTP deps резолвят store через supervisor, не closure на один `store`.** `registerStudioHttp` принимает supervisor.
- [ ] **Step 3: Lint / typecheck / commit** `feat(studio): host supervises N node runtimes`

Пока cutover не сделан, supervisor может открывать ещё `studio.db` только в dev-мосте; в каноне плана после Task 3 — только `workspace.db`.

---

### Task 3: Cutover (restart)

**Files:** `application/nodes/cutover-studio-db.ts`; npm script `apps/studio/server` `cutover`

Алгоритм (остановленный host):

1. Read `host.nodes`. Если пусто, выйти.
2. Открыть `~/.harnesys/studio.db` read-only.
3. Для каждого node:
   - если `workspace.db` уже есть и не пустой — skip (идемпотентность).
   - создать файл, bootstrap schema.
   - domain с `workspace_id = node.id` → insert в новый db (agents, threads, schedules, webhooks, memory, knowledge, plugin_server_state, plans via thread, …).
   - runs / run_events / snapshots / attachments: join через `threads.workspace_id`.
   - catalogs 4a (providers/models/presets/plugins с этим workspace_id) → файл ноды.
4. FS seed:
   - user skills: если есть `~/.harnesys/skills` и нет `<ws>/.harnesys/skills` overlay кроме уже существующего workspace skills, **скопировать** host skills в ноду как seed (не symlink live).
   - presets user: копия в `<ws>/.harnesys/presets` если ввели этот путь; иначе rows уже в db.
   - plugins: скопировать checkout `~/.harnesys/plugins/<name>` → `<ws>/.harnesys/plugins/<name>` для установок этой ноды; `plugins-data` аналогично. Обновить `path` / `data_path` в строке ноды.
5. Bundled skills/presets: не копировать, overlay из `bundledSkillsPath()` / `bundledPresetsPath()`.
6. `skillRegistryRoots`: `[bundled, workspaceSkillsPath]` без `systemSkillsPath` как live. `pluginsPath` для ноды = под `.harnesys` workspace.
7. Rename `studio.db` → `studio.db.bak`. Host не открывает bak.
8. Печать списка перенесённых node id.

Boot host после cutover: если `studio.db` ещё на месте и у нод нет `workspace.db`, **не стартовать** API, лог: запустить cutover. Если bak и все db на месте: ок.

Не удалять `studio.db.bak` в этом плане (ручной 4c: удалить когда dogfood ок). Задача 7 ниже: опционально delete bak.

- [ ] **Commit** `feat(studio): cutover studio.db into per-node workspace.db`

---

### Task 4: Secrets и plugin keychain

**Files:** `MacosSecretStoreAdapter`, `domain/secret-store.port.ts`

Сейчас `account = pluginId:key`. Сделать `account = ${nodeId}:${pluginId}:${key}`. Port:

```ts
get(nodeId: string, pluginId: string, key: string): ...
```

Если это ломает публичный контракт только Studio, менять Studio adapter и callers. Cutover: для каждой ноды copy Keychain item со старого account на новый, если есть.

- [ ] **Commit** `feat(studio): secret store keys include node id`

---

### Task 5: Снять с host / wipe

**Files:** delete use case, General pane confirm

- Снять с host: `supervisor.stop(id)`, `removeFromHost`, domain файл не удалять.
- Удалить данные: отдельный confirm «удалить `<path>/.harnesys/workspace.db`»; опционально второй confirm на всю папку пользователя (по умолчанию папка остаётся). Каскад rows не нужен: файл удалили.

- [ ] **Commit** `feat(studio): node wipe confirms workspace.db`

---

### Task 6: Документы

**Files:** `docs/ROADMAP.md`, `docs/superpowers/specs/2026-09-16-packaging-federation-design.md`

Данные = N `workspace.db` в каталогах нод + `config.json`. Два процесса не делят одну sqlite: host держит db нод, окно без sqlite. Бэкап: эти файлы, не один studio.db. Docker volume: bind mount каталогов нод + `~/.harnesys/config.json`.

- [ ] **Commit** `docs: persist is workspace.db per node`

---

### Task 7: Удаление `studio.db.bak`

После ручной проверки двух нод на стенде хозяина: удалить bak. Не автоматизировать в boot.

---

## Приёмка Phase 4b

- Две локальные ноды: два файла `workspace.db`; providers разные.
- Падение/удаление одного файла не открывает второй как пустой host bag.
- Schedule ticker ноды A не fire-ит schedules B (разные db, разные loops).
- Host жив, UI может быть открыт как сейчас (ещё один процесс).
- Cutover повторяемый; host не пишет в `studio.db`.
- `bun run lint` / `typecheck`.

**Не в этой фазе:** Bearer, Vite≠static host, pairing, Tauri.
