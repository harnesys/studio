# Apps

Host layer over `harnesys`. SoT contract: `docs/` in monorepo root.

Stand is rewritten natively to types and API from docs (`RuntimeState`, Snapshot, `SessionEvent`, `AgentRun`, `Command`).

| directory | npm name | role | artifact |
|---|---|---|---|
| `server/` | `@harnesys/server` | host API: HTTP+WS, sqlite, cron, webhooks | `build/harnesys-host` |
| `webui/` | `@harnesys/webui` | SPA (`src/`, vite) + web gateway (`server/`: static, proxy `/api`, token-gate) | `dist`, `build/harnesys-web` |
| `cli/` | `@harnesys/cli` | supervisor `harnesys`: up/down/status/restart/logs/update, `host pair`, systemd | `build/harnesys` |
| `desktop/` | `@harnesys/desktop` | Tauri wrapper, frontend taken from webui (`tauri.conf.json` → `../webui`) | — |

API contract: `packages/studio-shared` (`@harnesys/studio-shared`, barrel `types.ts`) — common for server and webui.

Dev from root: `bun run dev` (vite :5173 + `bun --watch` :47474), `dev:server`, `dev:webui`, `dev:desktop`.

## Server

Clean Architecture:

```
server/src/
  domain/         # ports, errors
  application/    # use case classes
  adapters/       # HTTP, SQLite, FS
  composition/    # assembly
  index.ts        # Main: listen (API+WS only; no SPA)
```

Dev ports: UI Vite `:5173`, host API `:47474`. Host does not serve SPA. Bundle assets: `apps/server/assets` (skills, presets) — resolved as `import.meta.dir/../../../assets` from `src/adapters/store`.

Domain ports and errors — in `src/domain`.

| suffix | role |
|---|---|
| `.port.ts` | port |
| `.use-case.ts` | one operation, one class + Request/Response + InputPort in same file |
| `.controller.ts` | HTTP, one file per resource |
| `.adapter.ts` | port implementation |
| `.error.ts` | domain errors |

Application does not know Hono and SQLite path. Persist — repositories + `UnitOfWork` over SQLite (`~/.harnesys/studio.db`); attachments — files under workspace. Runtime import: package `harnesys`.

## Client (webui/src)

FSD. Import only downwards: `app → pages → widgets → features → entities → shared`.
Slice outside only via its `index.ts`.

| layer | what to put | what not to put |
|---|---|---|
| `pages/` | route: composition, URL, feature calls | dialogs, field schemas, CRUD hooks of action |
| `features/` | one user action | entity catalog, desk selection, shared UI |
| `entities/` | collection of one domain and store | dialogs, agent/thread selection, HTTP Studio |
| `shared/` | ui-kit, api-client, overlay, config | domain logic, specific form schemas |

Feature sample:

```
features/<action>/
  index.ts                 # public API only
  README.md                # 5–12 lines: why, API, server
  model/<name>-dialogs.ts  # open / confirm
  model/<name>.ts          # schema, draft, merge
  ui/<name>-fields.tsx     # fields
  ui/<name>-dialogs.tsx    # dialogs
```

Page calls only `openEditModelDialog(row)` / `confirmDetachModel(name)` from `index.ts`, then mutation.

Forms — `react-hook-form` + `Controller` + `@hookform/resolvers/zod` + zod in `model/`. Controls — `shared/ui` (`Field`, `Input`, `ToggleGroup`).

Store — one domain per file (`entities/*/model/*.store.ts`). Agent / thread / inspector selection — `features/desk`. Action on multiple entities — feature. Workspace / surface / settings — in URL.

Identifiers — UUID only.

## Skills / docs for zone

- UI feature: FSD + sample of neighboring feature. Root `docs/01`–`23` do not open without runtime task.
- Server use case: this file + neighboring `*.use-case.ts`.
- Runtime / session / HITL: `docs/` in root.
