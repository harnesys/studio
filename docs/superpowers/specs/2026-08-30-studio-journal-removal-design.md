# Studio Journal Removal — Design Spec

> Удаление `Journal`/`JournalEntry`/`StreamEvent` из Studio. Клиент и сервер работают нативно с `SessionEvent`/`Snapshot`/`Event` из `harnesys`.

## Контекст

Серверная часть cutover (0.5.0) выполнена на ~90%: `RuntimeState`, `SessionEvent`, `session.send()`/`session.resume()` на месте. Клиентская часть не тронута — 30+ файлов зависят от `Journal`/`JournalEntry`/`StreamEvent`.

**Цель:** полное удаление journal-типов из Studio. Ни одного mapper-модуля между SessionEvent и старыми форматами (ROADMAP.md:11).

## Scope

### Сервер (cleanup)

| Файл | Действие |
|---|---|
| `server/application/schedules/schedule-fold.ts` | Переписать на `Event[]` (группировка по runId) |
| `server/application/schedules/schedule-peek.ts` | Переписать на `Event[]` (компактация run) |
| `server/application/threads/create-thread.use-case.ts` | Убрать `journal: { entries: [] }` из ответа |
| `server/application/schedules/create-schedule.use-case.ts` | Убрать `journal: { entries: [] }` из ответа |
| `server/adapters/store/sqlite/schema/journal-entries.ts` | Удалить |
| `server/adapters/store/sqlite/schema/journal-steps.ts` | Удалить |
| `server/adapters/store/sqlite/schema/index.ts` | Убрать реэкспорт journal |
| `server/adapters/store/sqlite/schema/attachments.ts` | Убрать FK на `journalEntriesTable` |
| `server/tests/sqlite-test-store.ts` | Переписать на `SqliteRuntimeState` |
| `server/adapters/http/thread/thread.controller.ts` | Убрать confirm/answer эндпоинты |
| `server/application/threads/get-thread.use-case.ts` | Добавить загрузку events в ответ |

### Клиент (новый стор + адаптация)

| Файл | Действие |
|---|---|
| `client/src/entities/journal/` | Удалить директорию |
| `client/src/entities/session/` | Создать: новый Zustand-стор |
| `client/src/entities/session/model/session.store.ts` | Новый стор на `SessionEvent[]` |
| `client/src/entities/session/model/usage.ts` | Перенести из journal (без изменений логики) |
| `client/src/entities/session/index.ts` | Barrel export |
| `shared/thread.ts` | Добавить `events: SessionEvent[]` в `ThreadRecord` |
| `shared/types.ts` | Убрать journal реэкспорты |
| `shared/harnesys-bridge.ts` | Убрать journal-типы |
| `shared/transcript.ts` | Без изменений (уже на SessionEvent) |
| `shared/api/threads.ts` | Убрать `confirmRun`, `answerRun`, `deleteThreadEntry` |
| `shared/api/index.ts` | Убрать реэкспорт удалённых функций |

### Клиент — виджеты и фичи (адаптация к новому стору)

| Группа файлов | Что меняется |
|---|---|
| `widgets/chat-transcript/` | `useSessionStore` вместо `useJournalStore`, `toTranscript(events, ...)` |
| `widgets/chat-composer/` | streaming/activeRun из нового стора, usage из events |
| `widgets/agent-inspector/` | events.length вместо journal.entries.length |
| `widgets/agent-threads/` | `removeForThreads` из нового стора |
| `features/send-message/` | SessionEvent вместо StreamEvent, HITL через ask events |
| `features/desk/` | `useThreadEvents` вместо `useThreadJournal`, `replaceEvents` |
| `features/switch-thread/` | `copyEvents` вместо `copyPrefix` |
| `features/compact-thread/` | stub (уже no-op) |
| `features/manage-agent/` | `replaceEvents` вместо `replaceJournal` |
| `features/manage-schedule/` | `replaceEvents` вместо `replaceJournal` |

## Дизайн

### 1. Клиентский стор: `useSessionStore`

```ts
type ActiveRun = {
  runId: string;
  controller: AbortController;
};

type RunFailure = {
  id: string;
  threadId: string;
  text: string;
};

type SessionStoreState = {
  events: Record<string, SessionEvent[]>;
  activeRuns: Record<string, ActiveRun>;
  failures: RunFailure[];
  contentEpoch: Record<string, number>;
};

type SessionStoreActions = {
  eventsOf: (threadId: string) => SessionEvent[];
  replaceEvents: (threadId: string, events: SessionEvent[]) => void;
  appendEvent: (threadId: string, event: SessionEvent) => void;
  startRun: (threadId: string, controller: AbortController, runId?: string) => void;
  finishRun: (threadId: string, runId?: string) => void;
  abortRun: (threadId: string) => void;
  setRunId: (threadId: string, runId: string) => void;
  runIdOf: (threadId: string) => string | undefined;
  isStreaming: (threadId: string) => boolean;
  setFailure: (failure: RunFailure) => void;
  removeForThreads: (threadIds: string[]) => void;
  copyEvents: (fromThreadId: string, toThreadId: string) => void;
};
```

`appendEvent` — иммутабельно добавляет event в массив. Для `text-delta` можно оптимизировать: если последний event тоже `text-delta`, склеить текст (но не обязательно для v1).

Usage-метрики (`formatTokenCount`, `formatDuration`, `rollupUsage`, `estimateTokens`, `contextWindowForModel`) переезжают в `entities/session/model/usage.ts` без изменений логики.

### 2. ThreadRecord — events в ответе

```ts
type ThreadRecord = {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  workspaceId: string;
  kind: ThreadKind;
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
  unread: boolean;
  events: SessionEvent[];  // NEW
};
```

`GET /api/threads/:id` загружает events из таблицы `events` по `threadId`, маппит metadata JSON → `SessionEvent`, вкладывает в ответ.

Сервер хранит `SessionEvent` прямо в `metadata` events таблицы для событий, которые проецируются в SessionEvent (text-delta, tool, ask, done, error). `drainAgentRun` вызывает `commit` с events, metadata которых содержит сериализованный `SessionEvent`. При загрузке читаем metadata как `SessionEvent` — маппинг не нужен.

Events, которые не проецируются в SessionEvent (run.started, node.scheduled, state.committed и т.д.), хранятся с metadata без SessionEvent. При загрузке threads/:id фильтруем только те events, у которых metadata содержит SessionEvent.

### 3. SSE-поток (клиент)

`send-message.ts` и `drain-run-stream.ts`:

```ts
// Было:
const event = parseEvent(frame.data) as StreamEvent;
store.applyEvent(threadId, event);  // applyStreamEvent

// Стало:
const event = JSON.parse(frame.data) as SessionEvent;
store.appendEvent(threadId, event);
```

Terminal condition:
```ts
// Было:
isTerminalAgentEntry(event)  // event.type === 'entry' && isAgentEntry && status terminal

// Стало:
event.type === 'done' || event.type === 'error'
```

Reconcile после SSE:
```ts
// Было:
const record = await getThread(threadId);
store.replaceJournal(threadId, record.journal);

// Стало:
const record = await getThread(threadId);
store.replaceEvents(threadId, record.events);
```

### 4. HITL через SessionEvent

`pending-hitl.ts` ищет `ask` event вместо `AgentStep` со статусом `awaiting_*`:

```ts
type PendingHitl = {
  askId: string;
  schema: unknown;
  source: string;
  prompt?: string;
  tool?: { name: string; input: unknown; toolCallId: string };
};

function pendingHitl(events: SessionEvent[]): PendingHitl | null {
  // Ищем последний ask event, за которым не следует done/error
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.type === 'done' || ev.type === 'error') return null;
    if (ev.type === 'ask') return ev;
  }
  return null;
}
```

HITL actions (`hitl-actions.ts`): `confirmRun` и `answerRun` удаляются. HITL через `AgentRun.respond()`/`reject()` на сервере. Клиент отправляет `POST /api/threads/:id/resume` с payload.

### 5. Schedule code на SessionEvent

`schedule-fold.ts`: работает с `Event[]` (полные audit events из таблицы `events`), а не `SessionEvent[]`. Группируем events по `runId` — каждая группа = один schedule run. Фильтруем по `threadId`. Для компактации run: берём `model.completed` (текст), `tool.completed` (инструменты), `control.interrupt` (HITL), `run.failed` (ошибки).

`schedule-peek.ts`: компактация одного run из `Event[]`:
- `model.completed` metadata.text → текст агента
- `tool.completed` metadata → инструмент с результатом
- `control.interrupt` metadata → HITL prompt
- `run.failed` metadata → ошибка

### 6. Очистка

- Удалить `schema/journal-entries.ts`, `schema/journal-steps.ts`
- Убрать реэкспорт из `schema/index.ts`
- `attachments.ts`: `entryId` → обычный text без FK
- Удалить `entities/journal/` полностью
- Убрать `confirmRun`, `answerRun`, `deleteThreadEntry` из API клиента
- Убрать confirm/answer эндпоинты из `thread.controller.ts`
- `tests/sqlite-test-store.ts`: переписать на `SqliteRuntimeState`
- `bootstrap.ts`: оставить DROP journal (миграция), убрать CREATE journal если есть

## Execution order

1. **Schema cleanup** — удалить journal schema, починить attachments FK
2. **Server: ThreadRecord + events** — добавить events в GET /threads/:id, убрать journal из use cases
3. **Server: schedule code** — переписать schedule-fold/peek на SessionEvent
4. **Server: controller cleanup** — убрать confirm/answer эндпоинты
5. **Client: entities/session/** — создать новый стор
6. **Client: shared/** — обновить thread.ts, types.ts, api
7. **Client: features/send-message/** — SessionEvent вместо StreamEvent
8. **Client: features/desk/** — replaceEvents вместо replaceJournal
9. **Client: widgets/** — адаптировать к новому стору
10. **Client: остальные фичи** — switch-thread, manage-agent, manage-schedule
11. **Удалить entities/journal/** — после того как все импорты убраны
12. **Финальная проверка** — tsc, biome, grep на journal/StreamEvent

## Constraints

- Файл max 300 строк (AGENTS.md)
- Нет indexed access типов — именованные типы
- Biome lint/format
- Нет тестов (AGENTS.md)
- Memory system (episodic, semantic, knowledge, pins) работает
- Compact = no-op stub
