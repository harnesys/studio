# Apps

Хост-слой поверх `harnesys`. SoT контракта: `docs/` в корне монорепо.

Стенд переписывается нативно на типы и API из docs (`RuntimeState`, Snapshot, `SessionEvent`, `AgentRun`, `Command`).

| каталог | npm name | роль | артефакт |
|---|---|---|---|
| `server/` | `@harnesys/server` | host API: HTTP+WS, sqlite, крон, вебхуки | `build/harnesys-host` |
| `webui/` | `@harnesys/webui` | SPA (`src/`, vite) + веб-шлюз (`server/`: статика, прокси `/api`, token-гейт) | `dist`, `build/harnesys-web` |
| `cli/` | `@harnesys/cli` | супервизор `harnesys`: up/down/status/restart/logs/update, `host pair`, systemd | `build/harnesys` |
| `desktop/` | `@harnesys/desktop` | Tauri-оболочка, фронтенд берёт из webui (`tauri.conf.json` → `../webui`) | — |

Контракт API: `packages/studio-shared` (`@harnesys/studio-shared`, баррель `types.ts`) — общий для server и webui.

Дев из корня: `bun run dev` (vite :5173 + `bun --watch` :3000), `dev:server`, `dev:webui`, `dev:desktop`.

## Сервер

Clean Architecture:

```
server/src/
  domain/         # порты, ошибки
  application/    # use case-классы
  adapters/       # HTTP, SQLite, FS
  composition/    # сборка
  index.ts        # Main: listen (API+WS only; no SPA)
```

Dev ports: UI Vite `:5173`, host API `:3000`. Host does not serve the SPA. Бандл-ассеты: `apps/server/assets` (skills, presets) — резолвятся как `import.meta.dir/../../../assets` от `src/adapters/store`.

Доменные порты и ошибки — в `src/domain`.

| суффикс | роль |
|---|---|
| `.port.ts` | порт |
| `.use-case.ts` | одна операция, один класс + Request/Response + InputPort в том же файле |
| `.controller.ts` | HTTP, один файл на ресурс |
| `.adapter.ts` | реализация порта |
| `.error.ts` | доменные ошибки |

Application не знает Hono и путь к SQLite. Persist — репозитории + `UnitOfWork` над SQLite (`~/.harnesys/studio.db`); вложения — файлы под workspace. Импорт runtime: пакет `harnesys`.

## Клиент (webui/src)

FSD. Импорт только вниз: `app → pages → widgets → features → entities → shared`.
Слайс снаружи только через свой `index.ts`.

| слой | что класть | что не класть |
|---|---|---|
| `pages/` | маршрут: композиция, URL, вызов фич | диалоги, схемы полей, CRUD-хуки действия |
| `features/` | одно пользовательское действие | каталог сущности, селекцию desk, shared-UI |
| `entities/` | коллекция одного домена и стор | диалоги, выбор агента/треда, HTTP Studio |
| `shared/` | ui-кит, api-клиент, overlay, конфиг | доменную логику, схемы конкретной формы |

Образец фичи:

```
features/<действие>/
  index.ts                 # только публичный API
  README.md                # 5–12 строк: зачем, API, server
  model/<имя>-dialogs.ts   # open / confirm
  model/<имя>.ts           # схема, draft, merge
  ui/<имя>-fields.tsx      # поля
  ui/<имя>-dialogs.tsx     # диалоги
```

Страница зовёт только `openEditModelDialog(row)` / `confirmDetachModel(name)` из `index.ts`, потом мутацию.

Формы — `react-hook-form` + `Controller` + `@hookform/resolvers/zod` + zod в `model/`. Контролы — `shared/ui` (`Field`, `Input`, `ToggleGroup`).

Стор — один домен на файл (`entities/*/model/*.store.ts`). Выбор агента / треда / инспектора — `features/desk`. Действие на несколько сущностей — фича. Workspace / surface / settings — в URL.

Идентификаторы — только UUID.

## Skills / доки для зоны

- UI-фича: FSD + образец соседней фичи. Корневые `docs/01`–`23` не открывать без runtime-задачи.
- Server use case: этот файл + соседний `*.use-case.ts`.
- Runtime / session / HITL: `docs/` в корне.
