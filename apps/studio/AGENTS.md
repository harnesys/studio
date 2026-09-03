# Studio

Стенд поверх `harnesys`. SoT контракта: `docs/` в корне монорепо. Roadmap: `docs/ROADMAP.md`.

**Studio переписывается нативно** на типы и API из docs (`RuntimeState`, Snapshot, `SessionEvent`, `AgentRun`, `Command`).

## Сервер

Clean Architecture:

```
server/
  domain/         # порты, ошибки
  application/    # use case-классы
  adapters/       # HTTP, SQLite, FS
  composition/    # сборка
  index.ts        # Main: listen, static
```

Записи для сервера и клиента — `shared/types.ts`. Доменные порты и ошибки — в `server/domain`.

| суффикс | роль |
|---|---|
| `.port.ts` | порт |
| `.use-case.ts` | одна операция, один класс + Request/Response + InputPort в том же файле |
| `.controller.ts` | HTTP, один файл на ресурс |
| `.adapter.ts` | реализация порта |
| `.error.ts` | доменные ошибки |

Application не знает Hono и путь к SQLite. Persist — репозитории + `UnitOfWork` над SQLite (`~/.harnesys/studio.db`); вложения — файлы под workspace. Импорт runtime: пакет `harnesys` (сейчас stub).

## Клиент

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
- Runtime / session / HITL: `docs/` в корне + `docs/ROADMAP.md`. Studio принимает типы Harnesys нативно.
