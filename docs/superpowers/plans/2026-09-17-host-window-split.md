# Host / window process split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Host (API, WS, tickers, sqlite) и window (UI) — разные процессы. Auth тот же, что расширит Phase 6: `window.hosts[]` размера 1. Статику host не раздаёт.

**Architecture:** Dev как prod: Vite = window, `bun server/src/index.ts` = host. Production: убрать `serveStatic(client/dist)` из `server/src/index.ts`. Token: `host.token` проверяет Bearer; окно шлёт `window.hosts[0].credential` (для local копия token из Phase 3). Писатели config: host-процесс только `writeHost`, window только `writeWindow` (окно пишет desk через API host, host выполняет `writeWindow` по запросу с валидным credential — исключение: desk хранится в том же файле, мутирует секция window по HTTP, не host ticker).

**Tech Stack:** Hono middleware, `apiJson` Authorization, `/health`.

**Spec:** packaging-federation (процессы); sequence Phase 5 = реестр host размера 1.

**Sequence:** Phase 5.

## Global Constraints

- Тесты запрещены. `bun run lint` / `typecheck`.
- Отдельного loopback-протокола нет. Не изобретать второй заголовок «X-Local».
- `workspace.db` только у host.
- Не делать pairing remote, Tauri, Docker в этой фазе.
- Не убивать чужой стенд. Если `:3000`/`:5173` заняты хозяином, работать по ним: после смены auth хозяин перезапустит **свой** `dev.ts`.
- Webhook fire `POST /api/workspaces/:id/hooks/:webhookId` без Bearer (ingress). `/health` без Bearer.

---

## File map

| файл | ответственность |
|---|---|
| `apps/studio/server/src/adapters/http/auth.middleware.ts` | Bearer = `host.token` |
| `apps/studio/server/src/index.ts` | не раздавать `client/dist` |
| `apps/studio/server/src/adapters/http/health.controller.ts` | `GET /health` |
| `apps/studio/client/src/shared/api/client.ts` | `Authorization` |
| `apps/studio/client/src/shared/api/host-credential.ts` | credential из boot |
| `apps/studio/dev.ts` | без изменений модели (уже 2 процесса); не проксировать как «host отдаёт SPA» |
| `apps/studio/client/vite.config.ts` | proxy `/api` `/ws` как сейчас |
| packaging / ROADMAP | вычеркнуть «два процесса с одной базой» |

---

## Types

```ts
export type HostAuth = {
  token: string;
};

export type WindowHostRecord = {
  id: string;
  baseUrl: string;
  credential: string;
};
```

Local: `id: 'local'`, `baseUrl: 'http://127.0.0.1:' + port`, `credential === host.token` после init Phase 3. Если в config ещё пусто, host при старте генерирует token и дописывает `window.hosts[0]` только если секция window пустая (первый boot). Дальше host не перетирает `window.desk`.

---

### Task 1: `/health` и auth middleware

**Files:** new health controller, middleware, `register-http.ts`

```ts
export function requireHostToken(token: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const expected = `Bearer ${token}`;
    if (header !== expected) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  };
}
```

Исключения: `GET /health`, `POST /api/workspaces/:id/hooks/:webhookId`. LSP websocket: тот же token query или header, как удобнее существующему `bun-websocket.ts` (не оставлять открытым).

Desk SSE `/api/desk/watch`: с Bearer.

- [ ] **Commit** `feat(studio): host bearer token and /health`

---

### Task 2: Host не раздаёт SPA

**Files:** `apps/studio/server/src/index.ts`

Удалить блок `if (env.production) { serveStatic dist }`. Host = API+WS. Кто отдаёт UI в prod до Phase 7: Vite preview / отдельный static later. Dev уже Vite.

Документировать в README studio одну строку: UI на `:5173`, API на `:3000`.

- [ ] **Commit** `fix(studio): host process does not serve client dist`

---

### Task 3: Client credential

**Files:** `shared/api/client.ts`, boot

Window не читает `config.json` с диска в браузере (нет fs). Курица-яйцо:

1. `GET /api/window/bootstrap` **только с loopback**, без Bearer → `{ hosts, desk }` (credential в `hosts[0]`).
2. Клиент кладёт credential в память (`host-credential.ts`) и дальше шлёт `Authorization: Bearer` на все `/api/*` (тот же контур, что Phase 6 для remote).
3. WS / `<img src>`: `?token=` (браузер не ставит Authorization на WebSocket и media).
4. Vite proxy inject Bearer — **опциональный** dogfood, не единственный путь. Не класть token в `VITE_*`.

- [ ] **Commit** `feat(studio): client sends host bearer from loopback bootstrap`

---

### Task 4: Писатели config

Host boot: `writeHost` для listen/token/nodes. HTTP `PUT /api/window/desk` → `writeWindow`. Ticker/host code path не вызывает `writeWindow`. Проверить grep `writeWindow` / `writeHost`.

Atomic write уже из Phase 3.

- [ ] **Commit** если нужны правки границ.

---

### Task 5: Docs

Packaging/ROADMAP: два процесса, **разные** db-файлы нод на host, окно без sqlite. Не «одна база на два процесса».

- [ ] **Commit** `docs: host and window are separate processes`

---

## Приёмка Phase 5

- UI закрыт (убит Vite): host на `:3000` жив, `/health` 200, tickers живы.
- Запрос к `/api/workspaces` без Bearer: 401 (напрямую на `:3000`). Через Vite dev: 200.
- Host не отдаёт `index.html` из `client/dist`.
- `window.hosts.length === 1` (local).
- `bun run lint` / `typecheck`.

**Не в этой фазе:** pairing второго host, dmg, CLI `harnesys up`.
