# Pairing and multi-host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pairing добавляет строки в `window.hosts`. Стол держит ноды разных host. Inbox/events: fan-out merge окна. Офлайн одного host не блокирует другой. Публичный origin host для webhook URL.

**Architecture:** Тот же Bearer, что Phase 5. Remote host выдаёт pairing code; window redeem на `baseUrl` remote, получает `credential`, пишет `window.hosts`. Клиентский API: `nodeId → host` из кэша списков нод. Не второй auth. Id ноды по-прежнему назначает **тот** host; URL без host сегмента.

**Tech Stack:** Hono pair routes, client host router, существующий `WorkspaceFields` / `HostPairFields`.

**Spec:** packaging-federation (компоненты, inbox). Desk URL без изменений.

**Sequence:** Phase 6.

## Global Constraints

- Тесты запрещены. `bun run lint` / `typecheck`.
- Не тащить mesh, shared-агенты, tunnel UI, Tauri dmg.
- Adopt/copy папки на втором host = новый id.
- Inbox не SQL join на одном host «все машины».
- Не поднимать чужой стенд; для приёмки двух host нужен второй процесс на другом порте **по просьбе хозяина**.

---

## File map

| файл | ответственность |
|---|---|
| `apps/studio/server/src/application/pairing/pairing-code.ts` | 6 цифр, 10 мин, одна попытка |
| `apps/studio/server/src/adapters/http/pairing.controller.ts` | start/redeem |
| `apps/studio/client/src/features/create-workspace/model/hosts.store.ts` | заменить LS stub на `window.hosts` |
| `apps/studio/client/src/shared/api/client.ts` | fetch на `baseUrl` владельца |
| `apps/studio/client/src/shared/api/desk.ts` | N EventSource |
| `apps/studio/client/src/pages/settings/` | список hosts, revoke (Window) |
| `apps/studio/client/src/features/manage-webhook/` | absolute URL от origin host |

---

## Types

```ts
export type PairingStartResponse = {
  expiresAt: string;
};

export type PairingRedeemRequest = {
  code: string;
};

export type PairingRedeemResponse = {
  hostId: string;
  name: string;
  listen: string;
  credential: string;
};

export type WindowHostRecord = {
  id: string;
  name: string;
  baseUrl: string;
  credential: string;
};
```

Код на host хранить в памяти процесса (не в db ноды). Одна активная попытка.

---

### Task 1: Pair HTTP

**Files:** pairing use cases + controller

```
POST /api/host/pair/start     Bearer host.token (доверенное окно/CLI на этой машине)
→ { expiresAt } и код печатается в log / возвращается доверенному клиенту

POST /api/host/pair/redeem    без Bearer, body { code }
→ 200 PairingRedeemResponse | 401 invalid | одноразовый
```

`start` с local window (уже paired) или loopback. Redeem с чужого окна: только code. Успех: credential = `host.token` этого host (или отдельный window token; для v1 тот же `host.token`, как local копия в Phase 3). Packaging: «удалённый только после approve» = нужен start на доверенной стороне перед redeem. 10 минут TTL, одна попытка.

Не добавлять CLI в этой фазе: `POST start` с уже paired local window достаточен; CLI обёртка Phase 7.

- [ ] **Commit** `feat(studio): host pairing redeem issues window credential`

---

### Task 2: `window.hosts` вместо localStorage stub

**Files:** `hosts.store.ts`, `workspace-fields.tsx`, `PUT /api/window/hosts` или писать hosts внутри `writeWindow`

Убрать fake `setTimeout` `pairHost`. Реальный redeem: `POST ${address}/api/host/pair/redeem`. По успеху append `WindowHostRecord`, persist через host **local** `writeWindow` (desk+hosts живут на машине окна).

Показать «Connect a new host» в форме New workspace снова. Remote path: текст, create идёт на API того host (`POST ${baseUrl}/api/workspaces`).

List нод: fan-out `GET ${host.baseUrl}/api/workspaces` с credential этого host; кэш в памяти окна. Selection ids глобально уникальны (инвариант Phase 3).

- [ ] **Commit** `feat(studio): window.hosts pairing replaces localStorage stub`

---

### Task 3: API router окна

**Files:** `shared/api/client.ts`, entities hooks

```ts
export type NodeRoute = { nodeId: string; hostId: string; baseUrl: string; credential: string };

export function routeForNode(nodeId: string): NodeRoute | undefined;
```

`apiJson` для workspace-scoped path использует `baseUrl` + Bearer credential **владельца**. Local Vite proxy подходит только для local host: remote fetch абсолютный URL (CORS: host должен отдавать CORS для origin окна, либо Phase 7 web proxy). В Phase 6 для dogfood: remote host `listen 0.0.0.0`, CORS allow window origin.

Не вставлять host в path ресурса стола.

Offline: fetch fail → host status `offline`; ноды этого host в UI помечены; остальные запросы идут.

- [ ] **Commit** `feat(studio): client routes node calls to owning host`

---

### Task 4: Inbox/events fan-out

**Files:** `desk-sync.tsx`, `desk.ts`

На каждый `window.hosts` online: `EventSource` на `${baseUrl}/api/desk/watch` с auth (EventSource не умеет header: либо query `?token=` только для SSE, либо fetch+stream. Предпочтение: query token **только** на `/api/desk/watch`, не на остальные API). Merge `applyDeskEvent` как сейчас. Inbox: `useWaitingThreads(selectedIds)` по уже залитым stores.

Недоступный host: секция inbox помечает группу, rows не терять из последнего кэша (не очищать store нод этого host при offline).

- [ ] **Commit** `feat(studio): desk events fan-out per window host`

---

### Task 5: Public origin webhook

**Files:** create-webhook response, UI display

Host знает публичный origin: поле `host.publicOrigin?: string` в config (env `PUBLIC_URL` как в packaging compose). UI показывает `publicOrigin + endpoint`, не `window.location`. Если publicOrigin пуст: показать относительный `endpoint` + listen host, всё ещё не origin Vite.

- [ ] **Commit** `feat(studio): webhook URL uses host public origin`

---

### Task 6: Window settings hosts

**Files:** `/settings` новая категория `hosts` (Window): список, status, удалить (revoke local copy, не wipe remote).

Phase 2 запрещал заглушку; теперь реальный список.

- [ ] **Commit** `feat(studio): window settings host registry`

---

## Приёмка Phase 6

- Два host в `window.hosts`, ноды обоих в табах, API на владельца.
- Офлайн одного: UI status, второй работает, inbox его нод не протирается.
- Pairing: код 6 цифр, 10 мин, одна попытка.
- Webhook URL без `5173`/`window.location`.
- Deep link `/:nodeId/thread/...` резолвит host через таблицу id.
- `bun run lint` / `typecheck`.

**Не в этой фазе:** dmg, systemd, Docker images, онбординг ROADMAP.
