# Node catalog isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Providers, models, mode presets и установки плагинов адресуются id ноды. Две ноды на одном host не делят один writable bag на уровне API. Физические файлы ещё `studio.db` и `~/.harnesys/plugins`.

**Architecture:** В том же sqlite добавить принадлежность ноде и **скопировать** текущий host-global bag в каждую существующую ноду. Плагины: инвертировать модель `enabledWorkspaceIds` → install на ноде. Bundled overlay не трогать. Content-addressed кэш плагинов не вводить. Публичный API `packages/harnesys` не менять: порты уже без workspace; Studio передаёт scoped repos.

**Tech Stack:** Drizzle sqlite, существующие use cases, HTTP под `/api/workspaces/:id/...`.

**Spec:** `docs/superpowers/specs/2026-09-17-workspace-node-design.md` владение.

**Sequence:** Phase 4a.

## Global Constraints

- Тесты запрещены. `bun run lint` / `typecheck`. Перед кодом: согласование библиотеки (ниже Task 0) — редизайн ядра не открывать.
- Копия bag на cutover логики 4a: дальше записи расходятся внутри `studio.db`.
- Не move FS `~/.harnesys/plugins` в папку ноды (это 4b). API уже не enable-on-host.
- Именованные типы: `LlmProvider` + `workspaceId: string`, не индекс.
- Не поднимать второй стенд.

---

## File map

| файл | ответственность |
|---|---|
| `apps/studio/server/src/adapters/store/sqlite/schema/llm-providers.ts` | колонка `workspace_id` |
| `schema/llm-models.ts` | остаётся FK provider (provider уже scoped) |
| `schema/mode-presets.ts` | `workspace_id` |
| `schema/plugins.ts` | `workspace_id`; убрать `enabled_workspace_ids` как модель |
| `domain/llm-provider.port.ts` | методы с `workspaceId` |
| `domain/plugin.port.ts` | install list по ноде |
| `adapters/http/provider/provider.controller.ts` | nested routes |
| `adapters/http/mode-preset/mode-preset.controller.ts` | nested |
| `adapters/http/plugins/plugins.controller.ts` | install/list на ноде |
| `apps/studio/client/src/shared/api/providers.ts` (и panes) | `workspaceId` в каждом вызове |
| `bootstrap.ts` | backfill copy |

---

## Library checkpoint (сделать до кода)

Порты `RunLifecycleStore`, `RunEventStore`, `createRuntime` — один store на handle. Studio сегодня передаёт один sqlite во все `RuntimeHandle`. 4a **не** меняет это. 4b передаст per-node store в тот же порт.

Прочитать: `packages/harnesys/src/ports/run-lifecycle-store.ts`, `packages/harnesys/src/application/run-claimer.ts`. Если нет требования «единственный process-global store» в публичных типах, ядро не трогать. Если найдётся публичная функция, которая ходит в один фиксированный db, **стоп и вопрос**, не патчить молча.

---

### Task 0: Checkpoint

- [ ] **Step 1:** Прочитать порты. Зафиксировать в комментарии к PR / в конце задачи: «публичный API harnesys не менялся; Studio scoped repos».
- [ ] Нет commit с изменением `packages/harnesys`, если checkpoint чистый.

---

### Task 1: Providers и models на ноду

**Files:** schema, repos, use cases, HTTP, client API, `ModelsPane` в модалке

**Interfaces:**

```ts
export type LlmProviderRepository = {
  list(workspaceId: string): LlmProvider[];
  findById(workspaceId: string, id: string): LlmProvider | undefined;
  findByName(workspaceId: string, name: string): LlmProvider | undefined;
  insert(rec: LlmProviderInsert): LlmProvider;
  update(workspaceId: string, id: string, patch: LlmProviderPatch): LlmProvider;
  delete(workspaceId: string, id: string): void;
};
```

`LlmProviderInsert` включает `workspaceId: string`. Unique `(workspace_id, name)`.

HTTP (старые `/api/providers` удалить, не оставлять host-global):

```
GET    /api/workspaces/:workspaceId/providers
POST   /api/workspaces/:workspaceId/providers
GET    /api/workspaces/:workspaceId/providers/export
POST   /api/workspaces/:workspaceId/providers/import
GET    /api/workspaces/:workspaceId/providers/:id
PATCH  /api/workspaces/:workspaceId/providers/:id
DELETE /api/workspaces/:workspaceId/providers/:id
POST   /api/workspaces/:workspaceId/providers/:id/discover
POST   /api/workspaces/:workspaceId/providers/:id/models
...
```

Bootstrap 4a: для каждого id из `host.nodes` (или `workspaces` table replica) вставить **копию** каждой текущей строки provider/model с новым UUID, `workspace_id = node id`. Затем удалить строки без `workspace_id`. Ключи API копируются (автономная нода).

Client: `listProviders(workspaceId)`, модалка передаёт id ноды.

- [ ] **Step 1: Schema + repo.** Drizzle generate/migrate как принято в `apps/studio/server` (`bun run db:generate` / migrate). Не плодить `*.test.ts`.
- [ ] **Step 2: HTTP nest + удалить global routes.**
- [ ] **Step 3: Client grep `/api/providers`.**
- [ ] **Step 4: Lint / typecheck / commit** `feat(studio): providers belong to workspace node`

---

### Task 2: Mode presets на ноду

**Files:** `mode-presets` schema, repo, `/api/mode-presets` → `/api/workspaces/:id/mode-presets`

Builtin seed: сейчас bootstrap пишет FS presets в одну таблицу. После 4a seed **в каждую ноду** (копия builtin + копия user rows). Unique имя в пределах ноды.

`ModePresetRepository.list(workspaceId: string)` и остальные методы с id ноды.

- [ ] **Commit** `feat(studio): mode presets belong to workspace node`

---

### Task 3: Plugins invert

**Files:** `plugins` schema, `sqlite-plugins.adapter.ts`, install/enable use cases, HTTP, client `manage-plugins`

**Было:** одна строка плагина на host, `enabledWorkspaceIds: string[]`.

**Стало:** строка установки на ноду: колонка `workspace_id`. Unique `(workspace_id, name)`. `enable` на ноде = наличие строки (или `enabled` boolean на строке ноды), не массив id.

HTTP:

```
GET    /api/workspaces/:workspaceId/plugins
POST   /api/workspaces/:workspaceId/plugins/install
DELETE /api/workspaces/:workspaceId/plugins/:name
POST   /api/workspaces/:workspaceId/plugins/:name/update
PUT    /api/workspaces/:workspaceId/plugins/:name/grants
...
```

Удалить `GET /api/plugins` без workspace и `POST /api/plugins/install` host-global. Registries/catalog (`/api/plugin-registries`) в 4a могут остаться host-wide **read** (каталог маркетплейса), install пишет в ноду. Не делать «enable this plugin for workspace X» поверх одной установки.

Backfill: для каждого плагина и каждого id из `enabledWorkspaceIds` создать строку ноды (тот же name/revision/path). Если `enabledWorkspaceIds` пуст, не копировать установку во все ноды (плагин был установлен, но нигде не включён). Grants: ключ workspace в JSON свернуть в одну ноду.

FS path пока `~/.harnesys/plugins/<name>`: две ноды могут ссылаться на один checkout. 4a API изолирует metadata; 4b разнесёт файлы. Комментарий в `studio-layout.ts`: runtime-слоем после 4b будет `<workspace>/.harnesys/plugins`.

`WorkspaceHarnesysRegistry` грузит плагины `list by workspaceId`, не filter enabled array.

- [ ] **Commit** `feat(studio): plugin installs are per node`

---

### Task 4: Client модалка честна

Grep client: каждый list/create provider/plugin/preset из модалки ноды передаёт `workspaceId`. Две ноды: создать провайдера в A, list B не содержит его (после copy+diverged writes).

- [ ] **Lint / typecheck / commit** если ещё не закрыто в Task 1–3.

---

## Приёмка Phase 4a

- Две ноды: модалка A меняет providers/plugins/presets; GET ноды B не меняется после write в A (после backfill копии уже независимы).
- Нет UI «providers этого хоста для всех workspace».
- Нет модели `enabledWorkspaceIds` в API.
- `packages/harnesys` public API без изменений (или отдельное согласование, если checkpoint нашёл блокер).
- `bun run lint` / `typecheck`.

**Не в этой фазе:** `workspace.db`, N ticker, move plugin checkout, process split.
