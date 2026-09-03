# Run lifecycle rework: journal-first с queued-статусом

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ран это строка в БД и журнал событий; `send` создает ран в `queued`, клеймер исполняет через claim, recover/`/resume`/`ActiveRunRegistry`/`drainAgentRun` удалены.

**Architecture:** Единственный владелец состояния рана: таблица `runs` через порт `RunLifecycleStore`; журнал событий: `run_events` через порт `RunEventStore`. Исполнение: `RunClaimer` (claim = CAS `queued → running` + lease + `epoch+1`) запускает stateless `RunEngine.execute(runId)`. Все команды (send, respond, reject, retry, cancel) это записи журнала и CAS-переходы; исполнение всегда начинается забором lease. Studio реализует порты на SQLite и оборачивает `RunEventFeed` в SSE.

**Tech Stack:** TypeScript, Bun, drizzle-orm (better-sqlite3), React + zustand (клиент), biome (линт), Ajv.

**Spec:** `docs/superpowers/specs/2026-09-03-run-lifecycle-design.md` (итерация 3, journal-first). План спорит из спеки; исполнитель читает оба документа.

## Global Constraints

- Тесты временно запрещены: не создавать `*.test.ts` / `*.spec.ts` (AGENTS.md). Верификация каждого таска: `bunx tsc --noEmit` + `bun run lint` + ручная проверка на стенде в контрольных точках фаз.
- Файл не больше 300 строк (AGENTS.md). Новые файлы проектировать под лимит; существующие превышающие (graph.ts 845, tool-call.ts 500) только уменьшать.
- Запрещены индексные типы доступа: `T['field']`, `Parameters<typeof fn>[0]`. Именованные типы рядом с записью.
- Слайс FSD снаружи только через `index.ts`; глобальный импорт адаптера из слоя ядра запрещен.
- Каждый коммит собирается: `bun run lint` (biome, весь монорепо) и `bunx tsc` на затронутых tsconfig.
- Никакой обратной совместимости и миграторов: dev-БД пересоздается, старые ветки кода удаляются, не хранятся.
- Стиль прозы: без em-dash с пробелами, без `—` вместо запятой, без филлеров (`по сути`, `важно отметить`). Заголовки называют артефакт.
- Библиотека (`packages/harnesys`) источник правды; studio (`apps/studio`) адаптируется.

## Карта файлов (финальное состояние)

Библиотека, новые:

```
packages/harnesys/src/ports/run-lifecycle-store.ts    RunLifecycleStatus, RunRecord, RunLifecycleStore
packages/harnesys/src/ports/run-event-store.ts        RunEventStore, PendingSessionEvent, SessionEventFeedType
packages/harnesys/src/ports/run-targets.ts            RunTarget, RunTargets
packages/harnesys/src/adapters/in-memory-run-store.ts InMemoryRunLifecycleStore, InMemoryRunEventStore, createRunEventBus
packages/harnesys/src/application/run-event-feed.ts   createRunEventFeed, RunEventFeed
packages/harnesys/src/application/run-engine.ts       createRunEngine (переписан), restoreReActOutput
packages/harnesys/src/application/run-claimer.ts      createRunClaimer
packages/harnesys/src/application/ask-schema.ts       askUserSchema, ASK_SCHEMA_KEYS
packages/harnesys/src/application/tool-message.ts     buildToolMessage
packages/harnesys/src/application/tool-approve.ts     чекпоинт узла + approve-пул (вынесен из tool-call.ts)
```

Библиотека, переписываются:

```
packages/harnesys/src/application/session.ts          SessionHandle на записях журнала
packages/harnesys/src/ports/session.ts                SessionHandle, SessionEvent (+seq/runId/clientEventId, run.started, hitl.answer; без AgentRun/resumed)
packages/harnesys/src/application/graph.ts            без user.message-коммитов, без entry-валидации, restore budget, output из opts
packages/harnesys/src/application/tool-call.ts        gate='ask' бросает AskUserInterrupt, approve-логика вынесена
packages/harnesys/src/domain/errors.ts                codedRunError
```

Библиотека, удаляются: `run-engine-stream.ts` (SessionEventLog), `AgentRun`, `recover()`.

Studio server, новые:

```
apps/studio/server/adapters/store/sqlite/schema/runs.ts        runsTable
apps/studio/server/adapters/store/sqlite/schema/run-events.ts  runEventsTable
apps/studio/server/adapters/store/sqlite/repos/sqlite-run-lifecycle.adapter.ts
apps/studio/server/adapters/store/sqlite/repos/sqlite-run-events.adapter.ts
apps/studio/server/adapters/studio-run-targets.adapter.ts      RunTargets: threadId → RunTarget
apps/studio/server/adapters/ask-ticker.adapter.ts              TTL needs_input → cancelled
```

Studio server, переписываются: `send-thread-run.use-case.ts`, `respond-run.use-case.ts`, `cancel-run.use-case.ts`, `stream-run-events.use-case.ts`, `get-thread.use-case.ts`, `thread.controller.ts`, `composition/studio.ts`, `publish-desk-thread.ts`.

Studio server, удаляются: `active-runs.adapter.ts`, `drain-agent-run.ts`, `resume-thread-run.use-case.ts`, маршрут `/api/threads/:id/resume`, `schema/events.ts`.

Studio client: новый `features/send-message/model/run-stream-client.ts`; переписываются `send-message.ts`, `hitl-actions.ts`, `pending-hitl.ts`, `session.store.ts`; удаляются `follow-live.ts`, `drain-run-stream.ts`, `resume-paused.ts`.

## Термин плана

Клеймер, claim, lease, epoch, журнал, CAS: определения в спеке, разделы «Lease и fencing» и «Исполнение». `PendingSessionEvent` = `SessionEvent` без `seq`/`runId` (присваивает `append`). Coded error = `Error` с полем `code` (помощник `codedRunError` из `domain/errors.ts`).

---

# Фаза 1: ядро библиотеки

Зависимости внутри фазы: порты → in-memory адаптеры → фид → движок → клеймер → SessionHandle. После фазы 1 библиотека самодостаточна (in-memory адаптеры для `runtime.run()`), studio еще на старом коде и собирается.

### Task 1: Порты run lifecycle

**Files:**
- Create: `packages/harnesys/src/ports/run-lifecycle-store.ts`
- Create: `packages/harnesys/src/ports/run-event-store.ts`
- Create: `packages/harnesys/src/ports/run-targets.ts`
- Modify: `packages/harnesys/src/domain/errors.ts` (добавить `codedRunError`)

**Interfaces:**
- Produces: `RunLifecycleStatus`, `RunRecord`, `RunLifecycleStore`, `PendingSessionEvent`, `RunEventStore`, `RunTarget`, `RunTargets`, `codedRunError(code, message)`. Эти имена используют все следующие таски.

- [ ] **Step 1: `domain/errors.ts`, добавить в конец файла**

```ts
export type CodedError = Error & { code: string };

export function codedRunError(code: string, message: string): CodedError {
  return Object.assign(new Error(message), { code }) as CodedError;
}
```

- [ ] **Step 2: `ports/run-lifecycle-store.ts`**

```ts
export type RunLifecycleStatus =
  | 'queued'
  | 'running'
  | 'needs_input'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const RUN_NON_TERMINAL: RunLifecycleStatus[] = ['queued', 'running', 'needs_input'];

export type RunRecord = {
  runId: string;
  threadId: string;
  status: RunLifecycleStatus;
  interruptId?: string;
  parentRunId?: string;
  attempt: number;
  leaseInstanceId?: string;
  leaseExpiresAt?: number;
  leaseEpoch: number;
  lastSeq: number;
  createdAt: string;
  updatedAt: string;
};

export type RunCreateInput = {
  runId: string;
  threadId: string;
  parentRunId?: string;
};

export type RunTransitionPatch = {
  from: RunLifecycleStatus;
  to: RunLifecycleStatus;
  interruptId?: string | null;
  advanceAttempt?: boolean;
  events?: PendingSessionEvent[];
};

export interface RunLifecycleStore {
  /** Создает ран queued; initial-события (user) той же транзакцией.
   *  Повторный clientEventId в events возвращает существующий ран (идемпотентный send). */
  create(run: RunCreateInput, events?: PendingSessionEvent[]): Promise<RunRecord>;
  get(runId: string): Promise<RunRecord | null>;
  /** Не-терминальный корневой ран потока (parentRunId IS NULL). */
  activeByThread(threadId: string): Promise<RunRecord | null>;
  /** Саб-раны родителя (0.6.0, barrier). */
  childrenByParent(parentRunId: string): Promise<RunRecord[]>;
  /** CAS queued → running + lease + epoch+1. null = гонку проиграли. */
  claim(runId: string, instanceId: string, ttlMs: number): Promise<RunRecord | null>;
  /** Атомарный CAS from → to; epoch+1 когда from === 'running'; events той же транзакцией.
   *  Coded: 'run_terminal' | 'already_resumed' | 'unknown_interrupt' | 'lease_stale' | 'already_queued'. */
  transition(
    runId: string,
    expectedEpoch: number,
    patch: RunTransitionPatch,
  ): Promise<RunRecord>;
  /** Продление: только владелец с текущим epoch; иначе false. */
  renewLease(runId: string, instanceId: string, ttlMs: number): Promise<boolean>;
  /** Клеймер: queued-раны, limit + курсор createdAt. */
  listClaimable(opts?: { limit?: number; before?: string }): Promise<RunRecord[]>;
  /** GC: needs_input старше TTL (сравнение делает стор). */
  listExpiredAsks(opts?: { limit?: number; before?: string; olderThanMs?: number }): Promise<RunRecord[]>;
}
```

Коды ошибок `transition` (адаптер обязан маппить одинаково): текущий статус `completed` → `run_terminal`; текущий `queued` при `to: 'queued'` → `already_queued`; статус не совпал с `from` → `already_resumed` (единственный вызывающий с этой семантикой: respond); `interruptId` в записи не совпал с ожидаемым при `to: 'queued'` → `unknown_interrupt`; `expectedEpoch` не совпал → `lease_stale`. Порядок проверки: run_terminal, already_queued, lease_stale, from, unknown_interrupt.

- [ ] **Step 3: `ports/run-event-store.ts`**

```ts
import type { SessionEvent } from './session.ts';

export type PendingSessionEvent = Omit<SessionEvent, 'seq' | 'runId'>;
```

Запрещено: индексный тип `Omit` здесь допустим, это объявление порта. Ниже интерфейс:

```ts
export interface RunEventStore {
  /** Присваивает seq (монотонный в ране), пишет, обновляет runs.lastSeq. Одна транзакция.
   *  Coded 'lease_stale' если ран не в running или epoch чужой. seq присваивается до публикации. */
  append(runId: string, expectedEpoch: number, events: PendingSessionEvent[]): Promise<SessionEvent[]>;
  tail(runId: string, fromSeq: number): Promise<SessionEvent[]>;
  latestSeq(runId: string): Promise<number>;
  /** Вся лента треда в порядке записи (для getThread). */
  listByThread(threadId: string): Promise<SessionEvent[]>;
}
```

Замечание: `SessionEvent` в фазе 1 еще без `seq`/`runId` (Task 8 расширяет union, Task 9 добавляет поля). Порты пишутся сразу под финальную форму; `Omit` не ломает компиляцию, пока полей нет. Не добавлять промежуточных заглушек.

- [ ] **Step 4: `ports/run-targets.ts`**

```ts
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { PathsConfig } from './paths.ts';
import type { PermissionMap } from './permissions.ts';
import type { RuntimeState } from './runtime-state.ts';

export type RunTarget = {
  state: RuntimeState;
  agent: AgentDefinition;
  permissions?: PermissionMap;
  paths?: PathsConfig;
};

export interface RunTargets {
  /** Контекст исполнения резолвится в момент claim, не в момент send. */
  resolve(threadId: string): Promise<RunTarget | null>;
}
```

- [ ] **Step 5: Верификация**

Run: `cd packages/harnesys && bunx tsc --noEmit -p tsconfig.json` (если в пакете нет tsconfig: `bunx tsc --noEmit ../../apps/studio/server/../tsconfig.json` не нужен, проверить корневой `bun run lint`).
Expected: компиляция без ошибок, новых ошибок линта нет.

- [ ] **Step 6: Commit**

```bash
git add packages/harnesys/src/ports/run-lifecycle-store.ts packages/harnesys/src/ports/run-event-store.ts packages/harnesys/src/ports/run-targets.ts packages/harnesys/src/domain/errors.ts
git commit -m "feat(harnesys): run lifecycle ports (lifecycle store, event store, targets)"
```

### Task 2: In-memory адаптеры и шина событий

**Files:**
- Create: `packages/harnesys/src/adapters/in-memory-run-store.ts`

**Interfaces:**
- Consumes: порты из Task 1.
- Produces: `InMemoryRunLifecycleStore`, `InMemoryRunEventStore`, `RunEventBus` (`publish(runId, events)`, `subscribe(runId): AsyncIterable<SessionEvent>` без буфера). Нужны `runGraph` (существующий one-shot API), ручным прогонам и федерации-позже; SQLite-адаптер в Task 4 повторяет ту же семантику.

- [ ] **Step 1: Реализация.** Один файл, классы и фабрика шины. Контракт транзакций один-в-один с SQLite-адаптером (Task 4), поэтому здесь полная семантика:

`InMemoryRunLifecycleStore`:
- поле `runs: Map<string, RunRecord>`, поле `eventsByClient: Map<string /*threadId:clientEventId*/, string /*runId*/>`.
- `create`: если `events` содержит событие с `clientEventId` и мапа уже знает такой ключ → вернуть существующий ран (не создавать новый, события не дублировать). Иначе записать ран: `status:'queued'`, `attempt:1`, `leaseEpoch:0`, `lastSeq:0`, `createdAt/updatedAt: new Date().toISOString()`; события `events` складывает в связанный `InMemoryRunEventStore` (конструктор принимает его инстанс) с присвоением seq через его `appendLocked` (см. ниже), не через публичный `append` (ран еще не в running).
- `get`, `activeByThread`: фильтр по статусам `RUN_NON_TERMINAL` и `parentRunId === undefined`, последний по `createdAt`.
- `childrenByParent`: фильтр `parentRunId`.
- `claim`: если `status !== 'queued'` → `null`; иначе `status:'running'`, `leaseInstanceId: instanceId`, `leaseExpiresAt: Date.now() + ttlMs`, `leaseEpoch + 1`, вернуть копию.
- `transition(runId, expectedEpoch, patch)`: прочитать ран; нет → `codedRunError('unknown_run', ...)`; статус `completed` → `run_terminal`; `patch.to === 'queued'` и статус уже `queued` → `already_queued`; `expectedEpoch !== record.leaseEpoch` → `lease_stale`; `record.status !== patch.from` → `already_resumed`; для `to: 'queued'` с ожидаемым interruptId: если `patch.events` не содержит `hitl.answer` и `record.interruptId` задан и не совпадает ни с чем → сверка: respond всегда кладет `interruptId` в patch.events[0] (как `hitl.answer.interruptId`), сравнить `record.interruptId` с ним, несовпадение → `unknown_interrupt`. Упрощение допустимое: адаптер проверяет `record.interruptId !== patch.events?.[0]?.interruptId` когда событие несет `interruptId`. Затем: записать `to`, `interruptId` из patch (null → удалить), `advanceAttempt → attempt + 1`, `from === 'running' → leaseEpoch + 1` и сброс lease, события через `appendLocked`, вернуть копию.
- `renewLease`: `leaseInstanceId === instanceId && leaseEpoch === текущий` (проверка владельца и epoch; чужой → `false`), обновить `leaseExpiresAt`.
- `listClaimable`: статусы `queued`, сортировка по `createdAt` asc, `limit` (дефолт 50), курсор `before` = createdAt строго больше.
- `listExpiredAsks`: статус `needs_input` и `Date.now() - updatedAt > (olderThanMs ?? 7*24*3600*1000)`, та же пагинация по `updatedAt`.

`InMemoryRunEventStore`:
- поле `events: Map<string /*runId*/, SessionEvent[]>`, поле `nextSeq: Map<string, number>`.
- публичный `append(runId, expectedEpoch, events)`: найти ран в связанном lifecycle-сторе; нет или статус не `running` или `leaseEpoch !== expectedEpoch` → `codedRunError('lease_stale', ...)`. Затем `appendLocked`.
- `appendLocked(runId, events)`: присвоить `seq = nextSeq + 1..`, `runId`; положить; обновить `runs.lastSeq`; вернуть присвоенные.
- `tail(runId, fromSeq)`: события с `seq > fromSeq`. `latestSeq`: максимум или 0.
- `listByThread`: события всех ранов треда в порядке вставки (общий счетчик вставки внутри стора).

`createRunEventBus()`:
- `publish(runId, events)`: разбудить подписчиков, передав массив.
- `subscribe(runId)`: асинхронный генератор: очередь + wake, как `run-engine-stream.ts` сегодня (переиспользовать паттерн, файл потом удалится в Task 9).

- [ ] **Step 2: Верификация.** `bunx tsc --noEmit` + `bun run lint`. Ручная проверка: в `bun` repl/скрипте под `$CLAUDE_JOB_DIR/tmp` создать store'ы, прогнать create → claim → append → transition, убедиться в кодах ошибок (скрипт временный, не коммитить).
- [ ] **Step 3: Commit**

```bash
git add packages/harnesys/src/adapters/in-memory-run-store.ts
git commit -m "feat(harnesys): in-memory run lifecycle/event stores and event bus"
```

### Task 3: RunEventFeed

**Files:**
- Create: `packages/harnesys/src/application/run-event-feed.ts`

**Interfaces:**
- Consumes: `RunEventStore`, `RunLifecycleStore`, `RunEventBus` (Task 2).
- Produces: `RunEventFeed` = `{ subscribe(runId, fromSeq): AsyncIterable<SessionEvent>; publish(runId, events): void; }`. `createRunEventFeed(deps: { events; lifecycle; bus })`. Движок (Task 7) вызывает `publish` после `append`; клеймер и SSE читают `subscribe`.

- [ ] **Step 1: Реализация**

```ts
import type { RunEventBus } from '../adapters/in-memory-run-store.ts';
import type { RunLifecycleStore } from '../ports/run-lifecycle-store.ts';
import type { RunEventStore, PendingSessionEvent } from '../ports/run-event-store.ts';
import type { SessionEvent } from '../ports/session.ts';

export type RunEventFeed = {
  /** Живые события после fromSeq; завершается на needs_input и терминальных статусах. */
  subscribe(runId: string, fromSeq: number): AsyncIterable<SessionEvent>;
  /** Вызывает владелец записи (движок) после успешного append. */
  publish(runId: string, events: SessionEvent[]): void;
};

const BUFFER_LIMIT = 500;

export function createRunEventFeed(deps: {
  events: RunEventStore;
  lifecycle: RunLifecycleStore;
  bus: RunEventBus;
}): RunEventFeed {
  const buffers = new Map<string, SessionEvent[]>();

  function pushBuffer(runId: string, events: SessionEvent[]): void {
    const buf = buffers.get(runId) ?? [];
    buf.push(...events);
    const trimmed = buf.length > BUFFER_LIMIT ? buf.slice(buf.length - BUFFER_LIMIT) : buf;
    buffers.set(runId, trimmed);
  }

  return {
    publish(runId, events) {
      pushBuffer(runId, events);
      deps.bus.publish(runId, events);
    },
    async *subscribe(runId, fromSeq) {
      // 1) добор истории из БД: источник правды, буфер только для живых
      const missed = await deps.events.tail(runId, fromSeq);
      let lastSeq = fromSeq;
      for (const ev of missed) {
        lastSeq = Math.max(lastSeq, ev.seq ?? lastSeq);
        yield ev;
      }
      // 2) живая подписка с дедупом по seq
      const live = deps.bus.subscribe(runId);
      const queue: SessionEvent[] = [];
      const it = live[Symbol.asyncIterator]();
      try {
        while (true) {
          const rec = await deps.lifecycle.get(runId);
          if (rec && rec.status !== 'running' && rec.status !== 'queued') {
            return; // needs_input и терминалы закрывают подписку
          }
          const next = await Promise.race([
            it.next(),
            new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
          ]);
          if (!next) continue; // idle-тик: перепроверить статус выше
          if (next.done) return;
          for (const ev of next.value as SessionEvent[]) {
            if ((ev.seq ?? 0) <= lastSeq) continue; // at-least-once, дедуп получателя
            lastSeq = ev.seq ?? lastSeq;
            yield ev;
          }
        }
      } finally {
        it.return?.(undefined);
      }
    },
  };
}
```

Уточнение по типу `PendingSessionEvent` импорта: не импортировать, если линтер ругается на неиспользуемый; в файле оставить только используемые импорты. Гарантия at-least-once и дедуп по `(runId, seq)` на получателе: зафиксировать в JSDoc `subscribe`.

- [ ] **Step 2: Верификация + Commit**

```bash
bunx tsc --noEmit && bun run lint
git add packages/harnesys/src/application/run-event-feed.ts
git commit -m "feat(harnesys): RunEventFeed helper over RunEventStore + bus"
```

### Task 4: SQLite-адаптер runs: схема и RunLifecycleStore

**Files:**
- Create: `apps/studio/server/adapters/store/sqlite/schema/runs.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/bootstrap.ts` (DDL `runs`)
- Create: `apps/studio/server/adapters/store/sqlite/repos/sqlite-run-lifecycle.adapter.ts`

**Interfaces:**
- Consumes: порт `RunLifecycleStore` (Task 1).
- Produces: `SqliteRunLifecycleStore implements RunLifecycleStore`, `runsTable`. Studio подключит в Task 11.

- [ ] **Step 1: `schema/runs.ts`** (drizzle, стиль соседних schema-файлов)

```ts
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const runsTable = sqliteTable(
  'runs',
  {
    runId: text('run_id').primaryKey(),
    threadId: text('thread_id').notNull(),
    status: text('status').notNull(),
    interruptId: text('interrupt_id'),
    parentRunId: text('parent_run_id'),
    attempt: integer('attempt').notNull().default(1),
    leaseInstanceId: text('lease_instance_id'),
    leaseExpiresAt: integer('lease_expires_at'),
    leaseEpoch: integer('lease_epoch').notNull().default(0),
    lastSeq: integer('last_seq').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    claimIdx: index('runs_claim_idx').on(table.status, table.createdAt),
    askTtlIdx: index('runs_ask_ttl_idx').on(table.status, table.updatedAt),
  }),
);

export type RunRow = typeof runsTable.$inferSelect;
export type RunInsert = typeof runsTable.$inferInsert;
```

- [ ] **Step 2: `bootstrap.ts`**: рядом с другими `CREATE TABLE` добавить

```sql
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  status TEXT NOT NULL,
  interrupt_id TEXT,
  parent_run_id TEXT,
  attempt INTEGER NOT NULL DEFAULT 1,
  lease_instance_id TEXT,
  lease_expires_at INTEGER,
  lease_epoch INTEGER NOT NULL DEFAULT 0,
  last_seq INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS runs_active_root_idx ON runs(thread_id)
  WHERE parent_run_id IS NULL AND status IN ('queued', 'running', 'needs_input');
CREATE INDEX IF NOT EXISTS runs_claim_idx ON runs(status, created_at);
CREATE INDEX IF NOT EXISTS runs_ask_ttl_idx ON runs(status, updatedAt);
```

Исправить имена колонок в индексах на snake_case: `created_at`, `updated_at`. Частичный уникальный индекс: SQLite поддерживает `WHERE` в индексах. Таблицу `events` из bootstrap удалить (Task 6 убирает запись в нее; dev-БД пересоздается, мигратора нет).

- [ ] **Step 3: `sqlite-run-lifecycle.adapter.ts`**

Драйвер: drizzle `better-sqlite3` синхронный, транзакция через `this.db.transaction((tx) => {...})`. Семантика кодов: как в Task 1 Step 2 (порядок проверки: `run_terminal`, `already_queued`, `lease_stale`, from-mismatch, `unknown_interrupt`).

```ts
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type {
  RunCreateInput,
  RunLifecycleStatus,
  RunLifecycleStore,
  RunRecord,
  RunTransitionPatch,
} from 'harnesys';
import { codedRunError } from 'harnesys';
import type { PendingSessionEvent } from 'harnesys';
import type { StudioDb } from '../connection.ts';
import { runsTable } from '../schema/runs.ts';

const NON_TERMINAL: RunLifecycleStatus[] = ['queued', 'running', 'needs_input'];

function rowToRecord(row: typeof runsTable.$inferSelect): RunRecord {
  return {
    runId: row.runId,
    threadId: row.threadId,
    status: row.status as RunLifecycleStatus,
    interruptId: row.interruptId ?? undefined,
    parentRunId: row.parentRunId ?? undefined,
    attempt: row.attempt,
    leaseInstanceId: row.leaseInstanceId ?? undefined,
    leaseExpiresAt: row.leaseExpiresAt ?? undefined,
    leaseEpoch: row.leaseEpoch,
    lastSeq: row.lastSeq,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

Публичные методы:

- `create(run, events?)`: транзакция. Если среди `events` есть с `clientEventId`: `SELECT run_id FROM run_events WHERE thread_id = ? AND client_event_id = ? LIMIT 1` (join не нужен, колонка в run_events) → нашли: вернуть `get(тот runId)`, ничего не создавать. Не нашли: `INSERT INTO runs` (`status:'queued'`, `attempt:1`, `leaseEpoch:0`, `lastSeq:0`); события через injected `RunEventStore`-метод `appendLocked` (см. Task 5: адаптер events экспортирует внутренний `appendWithinTx(tx, runId, events, initialSeq = 0)`, lifecycle-адаптер получает его конструктором). Нарушение уникального индекса `runs_active_root_idx` (sqlite error `SQLITE_CONSTRAINT_UNIQUE`) → `codedRunError('thread_busy', 'thread already has an active run')`.
- `get`: `SELECT ... WHERE run_id = ?` → `rowToRecord` или `null`.
- `activeByThread`: `WHERE thread_id = ? AND parent_run_id IS NULL AND status IN (NON_TERMINAL) ORDER BY created_at DESC LIMIT 1`.
- `childrenByParent`: `WHERE parent_run_id = ? ORDER BY created_at`.
- `claim`: `UPDATE runs SET status='running', lease_instance_id=?, lease_expires_at=?, lease_epoch=lease_epoch+1, updated_at=? WHERE run_id=? AND status='queued'`; `changes > 0` → вернуть `get(runId)`, иначе `null`.
- `transition`: транзакция: `SELECT` текущего; цепочка проверок Task 1; для `from === 'running'`: `leaseEpoch + 1`, `lease_instance_id = NULL`, `lease_expires_at = NULL`; `advanceAttempt` → `attempt + 1`; события `appendWithinTx(tx, runId, patch.events ?? [], row.lastSeq)`; `UPDATE ... SET status, interrupt_id, attempt, lease_epoch, last_seq, updated_at`; вернуть свежий `get`.
- `renewLease`: `UPDATE runs SET lease_expires_at=?, updated_at=? WHERE run_id=? AND lease_instance_id=? AND lease_epoch=(SELECT lease_epoch FROM runs WHERE run_id=?)`; `changes > 0`.
- `listClaimable(opts)`: `WHERE status='queued' [AND created_at > before] ORDER BY created_at ASC LIMIT limit ?? 50`.
- `listExpiredAsks(opts)`: `WHERE status='needs_input' AND updated_at < ?` (порог считает адаптер: `now - (olderThanMs ?? ASK_TTL_DEFAULT_MS)`), `ORDER BY updated_at ASC LIMIT`. `ASK_TTL_DEFAULT_MS = 7 * 24 * 3600 * 1000` экспортировать отсюда (Task 27 переиспользует).

Время: `leaseExpiresAt` и пороги TTL вычисляет адаптер (`Date.now()`), вызывающий код время не сравнивает.

- [ ] **Step 4: Верификация + Commit**

```bash
bunx tsc --noEmit -p apps/studio/tsconfig.json && bun run lint
git add apps/studio/server/adapters/store/sqlite
git commit -m "feat(studio): sqlite runs schema and RunLifecycleStore adapter"
```

### Task 5: SQLite-адаптер run_events

**Files:**
- Create: `apps/studio/server/adapters/store/sqlite/schema/run-events.ts`
- Create: `apps/studio/server/adapters/store/sqlite/repos/sqlite-run-events.adapter.ts`

**Interfaces:**
- Consumes: порт `RunEventStore` (Task 1), `runsTable` (Task 4).
- Produces: `SqliteRunEventStore implements RunEventStore` + внутренний `appendWithinTx(tx, runId, events, fromSeq)` (используют lifecycle-адаптер Task 4 и сам store в `append`).

- [ ] **Step 1: `schema/run-events.ts`**

```ts
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const runEventsTable = sqliteTable(
  'run_events',
  {
    runId: text('run_id').notNull(),
    seq: integer('seq').notNull(),
    threadId: text('thread_id').notNull(),
    type: text('type').notNull(),
    timestamp: integer('timestamp').notNull(),
    metadata: text('metadata'),
    clientEventId: text('client_event_id'),
  },
  (table) => ({
    pk: index('run_events_pk').on(table.runId, table.seq), // фактически ключ ленты
    clientIdx: index('run_events_client_idx').on(table.threadId, table.clientEventId),
  }),
);

export type RunEventRow = typeof runEventsTable.$inferSelect;
```

Bootstrap DDL:

```sql
CREATE TABLE IF NOT EXISTS run_events (
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  thread_id TEXT NOT NULL,
  type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  metadata TEXT,
  client_event_id TEXT,
  PRIMARY KEY (run_id, seq)
);
CREATE INDEX IF NOT EXISTS run_events_client_idx ON run_events(thread_id, client_event_id);
```

- [ ] **Step 2: `sqlite-run-events.adapter.ts`**

Запись события: вся полезная нагрузка в `metadata` (JSON), `type` отдельной колонкой. `clientEventId` берется из `metadata.clientEventId` и дублируется в колонку (для дедупа send/respond), из metadata не удаляется. Конвертация row → `SessionEvent`: `JSON.parse(metadata)`,spread, добавить `type`, `seq`, `runId`. Это единственный маппер журнала в studio; библиотечный `eventToSessionEvent` остается конвертером домен-события графа в `SessionEvent` (не row-маппер).

```ts
import { and, eq, gt } from 'drizzle-orm';
import type { PendingSessionEvent, RunEventStore, SessionEvent } from 'harnesys';
import { codedRunError } from 'harnesys';
import type { StudioDb } from '../connection.ts';
import { runEventsTable, type RunEventRow } from '../schema/run-events.ts';
import { runsTable } from '../schema/runs.ts';

type SqliteTx = Parameters<Parameters<StudioDb['transaction']>[0]>[0];

function rowToEvent(row: RunEventRow): SessionEvent {
  const meta = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
  return { ...(meta as object), type: row.type, seq: row.seq, runId: row.runId } as SessionEvent;
}

export class SqliteRunEventStore implements RunEventStore {
  constructor(private readonly db: StudioDb) {}

  /** Внутренняя запись внутри внешней транзакции; возвращает присвоенные seq. */
  appendWithinTx(
    tx: SqliteTx,
    runId: string,
    threadId: string,
    fromSeq: number,
    events: PendingSessionEvent[],
  ): SessionEvent[] {
    const now = Date.now();
    const assigned: SessionEvent[] = [];
    let seq = fromSeq;
    for (const pending of events) {
      seq += 1;
      const { clientEventId, ...rest } = pending as { clientEventId?: string };
      const full = { ...rest, seq, runId } as SessionEvent;
      const meta = { ...rest } as Record<string, unknown>;
      tx.insert(runEventsTable)
        .values({
          runId,
          seq,
          threadId,
          type: pending.type,
          timestamp: now,
          metadata: JSON.stringify(meta),
          clientEventId: clientEventId ?? null,
        })
        .run();
      assigned.push(full);
    }
    if (events.length > 0) {
      tx.update(runsTable)
        .set({ lastSeq: seq, updatedAt: new Date().toISOString() })
        .where(eq(runsTable.runId, runId))
        .run();
    }
    return assigned;
  }

  async append(runId: string, expectedEpoch: number, events: PendingSessionEvent[]): Promise<SessionEvent[]> {
    return this.db.transaction((tx): SessionEvent[] => {
      const row = tx.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
      if (!row || row.status !== 'running' || row.leaseEpoch !== expectedEpoch) {
        throw codedRunError('lease_stale', `run ${runId} not executable by epoch ${expectedEpoch}`);
      }
      return this.appendWithinTx(tx, runId, row.threadId, row.lastSeq, events);
    });
  }

  async tail(runId: string, fromSeq: number): Promise<SessionEvent[]> {
    const rows = this.db
      .select()
      .from(runEventsTable)
      .where(and(eq(runEventsTable.runId, runId), gt(runEventsTable.seq, fromSeq)))
      .all();
    return rows.map(rowToEvent);
  }

  async latestSeq(runId: string): Promise<number> {
    const row = this.db.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
    return row?.lastSeq ?? 0;
  }

  async listByThread(threadId: string): Promise<SessionEvent[]> {
    const rows = this.db
      .select()
      .from(runEventsTable)
      .where(eq(runEventsTable.threadId, threadId))
      .all();
    return rows.sort((a, b) => a.seq - b.seq || a.timestamp - b.timestamp).map(rowToEvent);
  }
}
```

Дедуп `clientEventId` при append (respond-путь, Task 4 делает send-путь в `create`): перед вставкой `hitl.answer` с `clientEventId` в транзакции: `SELECT seq FROM run_events WHERE thread_id=? AND client_event_id=?` → нашли: не вставлять, вернуть существующее событие из row. Реализация: в `appendWithinTx` перед каждым `insert` для событий с `clientEventId` выполнить lookup, при совпадении пропустить вставку и не инкрементировать seq (вернуть существующий row как event). Требование идемпотентности: повтор respond не создает второе `hitl.answer`.

- [ ] **Step 3: Верификация + Commit**

```bash
bunx tsc --noEmit -p apps/studio/tsconfig.json && bun run lint
git add apps/studio/server/adapters/store/sqlite
git commit -m "feat(studio): sqlite run_events store with seq assignment and clientEventId dedup"
```

### Task 6: RunEngine без памяти

Старый `run-engine.ts` (385 строк) переписывается целиком. Движок теряет поля `interrupt`/`applied`/`events`/`idleWaits`/`queue`, теряет `start()`/`recover()`/`command()` как публичный контракт; становится интерпретатором одного сегмента: `execute(runId, opts)`.

**Files:**
- Modify: `packages/harnesys/src/application/run-engine.ts` (переписать)
- Modify: `packages/harnesys/src/application/run-engine-events.ts` (добавить маппинг `run.started`/`hitl.answer`)
- Delete-prepare: использование `createSessionEventLog` внутри движка заменяется на feed (Task 3); сам файл `run-engine-stream.ts` удалит Task 9 после отвязки graph-run.

**Interfaces:**
- Consumes: `RunLifecycleStore`, `RunEventStore`, `RunEventFeed` (Tasks 1-3), `GraphOpts` (существующий).
- Produces: тип

```ts
export type RunEngineDeps = {
  lifecycle: RunLifecycleStore;
  events: RunEventStore;
  feed: RunEventFeed;
  instanceId: string;
  leaseTtlMs?: number; // дефолт 15000
  renewMs?: number;    // дефолт 5000
};

export type RunEngine = {
  /** Один сегмент: ран должен быть running с нашим lease (клеймер уже отработал claim). */
  execute(runId: string, opts: RunTargetOpts): Promise<void>;
};

export type RunTargetOpts = {
  state: RuntimeState;
  agent: AgentDefinition;
  permissions?: PermissionMap;
  paths?: PathsConfig;
};
```

Семантика сегмента (это контракт для клеймера Task 7):
1. `stop()` прерывает текущий сегмент (AbortController), остановка таймера продления.
2. Вход: `transition(running → running)`-запретов нет; движок читает record: статус `running`, `leaseInstanceId === instanceId`, иначе `codedRunError('lease_stale', ...)`.
3. Продление: `setInterval(renewMs)` → `renewLease(runId, instanceId, leaseTtlMs)`; `false` → прервать сегмент исключением `lease_stale` (ран продан другому инстансу).
4. Если в record есть `interruptId`: сегмент начинается с resume-узла (`cursor.interrupt.nodeId` из снапшота), `resumePayload`/`rejected` берутся из `hitl.answer` журнала (`events.tail(runId, from)` где последнее событие типа `hitl.answer`), tool-сообщения строит `buildToolMessage` (Task 15).
5. Все события графа: `eventToSessionEvent(ev)` → `PendingSessionEvent`; в конец каждого батча движок дописывает `pendingRunEvents` (см. ниже); `feed.publish(runId, await events.append(runId, epoch, batch))`.
6. Пауза: граф бросает `AskUserInterrupt` внутри сегмента (узел графа коммитит снапшот `needs_input` сам, как сегодня); движок ловит: `transition(running → needs_input, { interruptId из cursor.interrupt, events: [ask-событие] })`; вернуть.
7. Конец сегмента (граф дошел до терминала): `transition(running → completed | failed, { events: [терминальное событие] })`. Статус берется из снапшота (`status` поля), как сегодня `finishFromSnapshot`.
8. Исключение сегмента: `transition(running → failed, { events: [error-событие] })`; если transition сам падает `lease_stale` (нас уже заменили): глотнуть, сегмент и так прерван.
9. `close()`: abort + clearInterval.

- [ ] **Step 1: Событие `run.started`.** Маппинг в `run-engine-events.ts`: тип `run.started` не является домен-событием графа; движок создает его как `PendingSessionEvent` напрямую:

```ts
const started: PendingSessionEvent = { type: 'run.started', attempt: record.attempt } as PendingSessionEvent;
```

Форма `SessionEvent` для него появится в Task 8 (`{ type: 'run.started'; attempt: number }`); здесь двигаться блокировано типами, поэтому шаг 1 объединен с шагом 2: писать код движка сразу под финальные события, временно закомментированные места не оставлять.

- [ ] **Step 2: Переписать `run-engine.ts`.** Скелет (полный код, не псевдокод; оптимизация под 300 строк):

```ts
import type { AgentDefinition } from '../domain/agent-definition.ts';
import { AskUserInterrupt } from '../domain/errors.ts';
import { codedRunError } from '../domain/errors.ts';
import type { RunLifecycleStore, RunRecord } from '../ports/run-lifecycle-store.ts';
import type { PendingSessionEvent, RunEventStore } from '../ports/run-event-store.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { PathsConfig } from '../ports/paths.ts';
import { eventToSessionEvent } from './run-engine-events.ts';
import type { RunEngineDeps, RunTargetOpts } from './run-engine-types.ts'; // см. ниже
import { type GraphOpts, startGraph } from './graph.ts';

export type { RunEngineDeps, RunTargetOpts };

const TERMINAL_FROM_SNAPSHOT = new Set(['completed', 'cancelled', 'failed', 'budget_exceeded', 'timed_out', 'dead_lettered']);

export function createRunEngine(deps: RunEngineDeps): RunEngine {
  const leaseTtl = deps.leaseTtlMs ?? 15_000;
  const renewMs = deps.renewMs ?? 5_000;
  let abort: AbortController | null = null;
  let renewTimer: ReturnType<typeof setInterval> | null = null;

  function stop(): void {
    abort?.abort();
    if (renewTimer) {
      clearInterval(renewTimer);
      renewTimer = null;
    }
  }

  async function flush(
    runId: string,
    epoch: number,
    pending: PendingSessionEvent[],
  ): Promise<void> {
    if (pending.length === 0) {
      return;
    }
    const stored = await deps.events.append(runId, epoch, pending);
    deps.feed.publish(runId, stored);
    pending.length = 0;
  }

  async function execute(runId: string, opts: RunTargetOpts): Promise<void> {
    const record = await deps.lifecycle.get(runId);
    if (!record || record.status !== 'running' || record.leaseInstanceId !== deps.instanceId) {
      throw codedRunError('lease_stale', `run ${runId} not owned by ${deps.instanceId}`);
    }
    const epoch = record.leaseEpoch;
    abort = new AbortController();
    renewTimer = setInterval(() => {
      void deps.lifecycle.renewLease(runId, deps.instanceId, leaseTtl).then((ok) => {
        if (!ok) {
          abort?.abort(new codedRunError('lease_stale', 'lease lost'));
        }
      });
    }, renewMs);

    try {
      // resume-контекст из журнала
      const answer = await findLastAnswer(runId); // tail-скан, см. ниже
      const snap = await opts.state.load();
      const cursor = (snap?.cursor ?? {}) as Record<string, unknown>;
      const interrupt = cursor.interrupt as Record<string, unknown> | undefined;
      const startNodeId = answer ? String(interrupt?.nodeId ?? '') : undefined;

      // run.started — граница попыток, пишет клеймер, не граф
      await flush(runId, epoch, [runStarted(record)]);

      const graphOpts: GraphOpts = {
        agent: opts.agent,
        input: answer ? null : restoreInitialInput(snap),
        state: opts.state,
        permissions: opts.permissions,
        paths: opts.paths,
        signal: abort.signal,
        startNodeId,
        rejected: answer?.rejected === true,
        resumePayload: answer?.payload,
      };
      await runSegment(runId, epoch, graphOpts);
    } finally {
      stop();
    }
  }
  // runSegment: цикл for await по startGraph, маппинг eventToSessionEvent,
  // батчи events в flush, обработка AskUserInterrupt и конца сегмента — по семантике 4-9 выше.
  // findLastAnswer: deps.events.tail(runId, 0), последний { type: 'hitl.answer' }.
  // restoreInitialInput: null (graph при resume не пишет user.message заново — Task 13 убирает).
  // runStarted: { type: 'run.started', attempt } as PendingSessionEvent.
  return { execute, stop, close: stop } as RunEngine & { stop(): void; close(): void };
}
```

Детали `runSegment` (обязательные, порядок именно такой):
- итерация: `ev` → `eventToSessionEvent(ev)`; `null` → пропустить; иначе push в `pending` (локальный массив) и при `pending.length >= 16` или событии `tool` фазы `completed|failed|skipped` → `flush`.
- `mapped.type === 'done'`: запомнить `text`; после цикла `transition(running → completed, { events: [{ type: 'run.completed', text }] })`, статус перехода сверить с снапшотом (`snap.status`).
- `mapped.type === 'error'`: код `cancelled` (сигнал aborted) → `transition(running → cancelled, { events: [mapped] })`; иначе `failed` с тем же событием.
- `AskUserInterrupt` пойман графом внутри себя (graph.ts коммитит снапшот needs_input сам, yielding `interrupt.triggered` → mapped `ask`): движок на событии `ask` делает `transition(running → needs_input, { interruptId: mapped.askId, events: [mapped] })` и завершает сегмент `return`.
- переполнение flush: `append` падает `lease_stale` → прервать цикл, сегмент завершен без перехода (нас перехватили).
- исключение графа (не interrupt): `transition(running → failed, { events: [{ type: 'error', code: ..., message: ... }] })`.

`run-engine-types.ts` (новый файл, держит `RunEngineDeps`/`RunTargetOpts`/`RunEngine`) нужен, чтобы цикл импортов graph → engine не замкнулся: graph.ts не импортирует движок, движок импортирует graph; типы вынести отдельно.

- [ ] **Step 3: `graph.ts` не меняется в этом таске** кроме одного: сейчас graph.ts на прерывании сам коммитит снапшот с `cursor.interrupt` и делает `break` (строки 640-688). Это остается: снапшот и курсор пишет граф (владелец состояния узлов), статус-транзакцию и ask-событие пишет движок (владелец `runs`).
- [ ] **Step 4: Верификация.** `bunx tsc` + `bun run lint`. Компиляция сломается в `graph-run.ts`/`session.ts` (используют старый `createRunEngine`): допустимо, чинится в Task 7/8 этого же плана до коммита фазы. Правило «каждый коммит собирается»: таск 6 коммитить вместе с Task 7 (один коммит, два таска) либо скрыть старый экспорт. Решение: Tasks 6-7-8 = один коммит `feat(harnesys): journal-first engine, claimer, session handle`.
- [ ] **Step 5: Commit** (совместно с Task 7 и 8, см. там).

### Task 7: RunClaimer

**Files:**
- Create: `packages/harnesys/src/application/run-claimer.ts`

**Interfaces:**
- Consumes: `RunLifecycleStore` (`claim`, `listClaimable`, `renewLease`), `RunTargets`, `RunEngine` (Task 6).
- Produces:

```ts
export type RunClaimer = {
  /** Будить обход немедленно (после send/respond/retry). */
  kick(): void;
  /** Остановить клеймер (остановка процессов-ранов не гарантирована: они прерываются stop() движка). */
  stop(): void;
};

export function createRunClaimer(deps: {
  lifecycle: RunLifecycleStore;
  targets: RunTargets;
  engine: RunEngine;
  instanceId: string;
  leaseTtlMs?: number;
  sweepMs?: number; // дефолт 5000
}): RunClaimer;
```

- [ ] **Step 1: Реализация**

```ts
export function createRunClaimer(deps: {...}): RunClaimer {
  const leaseTtl = deps.leaseTtlMs ?? 15_000;
  const sweepMs = deps.sweepMs ?? 5_000;
  let stopped = false;
  let sweeping = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const executing = new Set<string>();

  async function sweep(): Promise<void> {
    if (stopped || sweeping) return;
    sweeping = true;
    try {
      const claimable = await deps.lifecycle.listClaimable({ limit: 10 });
      for (const rec of claimable) {
        if (stopped) return;
        await tryClaim(rec.runId);
      }
    } finally {
      sweeping = false;
    }
  }

  async function tryClaim(runId: string): Promise<void> {
    if (executing.has(runId)) return;
    const rec = await deps.lifecycle.get(runId);
    if (!rec || rec.status !== 'queued') return;
    const target = await deps.targets.resolve(rec.threadId);
    if (!target) {
      // нет контекста исполнения (поток удален): ран остается queued до GC
      return;
    }
    const claimed = await deps.lifecycle.claim(runId, deps.instanceId, leaseTtl);
    if (!claimed) return;
    executing.add(runId);
    void deps.engine.execute(runId, target)
      .catch(() => {}) // движок уже записал failed/cancelled в журнал
      .finally(() => {
        executing.delete(runId);
        void sweep(); // освободился слот: вдруг есть еще queued
      });
  }

  timer = setInterval(() => void sweep(), sweepMs);

  return {
    kick() { void sweep(); },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      deps.engine.stop();
    },
  };
}
```

Ограничение параллелизма: `executing` Set допускает несколько одновременных ранов одного инстанса (нужно для саб-ранов 0.6.0). При желании ограничить: добавить `maxConcurrent` в deps (не в фазе 1, YAGNI).

- [ ] **Step 2: Верификация + Commit** (объединенный с Task 6 и 8):

```bash
bunx tsc --noEmit -p apps/studio/tsconfig.json && bun run lint
git add packages/harnesys/src/application/run-engine.ts packages/harnesys/src/application/run-engine-types.ts packages/harnesys/src/application/run-claimer.ts packages/harnesys/src/application/run-engine-events.ts
git commit -m "feat(harnesys): journal-first RunEngine and RunClaimer"
```

### Task 8: SessionHandle на записях журнала + типы SessionEvent

`ports/session.ts` переписывается: `AgentRun` удаляется, `SessionHandle` это фасад записи. `SessionEvent` получает `seq`/`runId` и новые варианты.

**Files:**
- Modify: `packages/harnesys/src/ports/session.ts` (переписать)
- Modify: `packages/harnesys/src/application/session.ts` (переписать)
- Modify: `packages/harnesys/src/application/create-runtime.ts` (сессия получает deps журнала)
- Modify: `packages/harnesys/index.ts` (экспорты: убрать `AgentRun`, добавить новые типы)

**Interfaces:**
- Produces:

```ts
export type SessionEvent =
  | { type: 'user'; text: string; attachments?: Attachment[]; origin?: string; clientEventId?: string; seq?: number; runId?: string }
  | { type: 'text-delta'; text: string; id?: string; seq?: number; runId?: string }
  | { type: 'reasoning-delta'; text: string; id?: string; seq?: number; runId?: string }
  | { type: 'reasoning-start'; id: string; seq?: number; runId?: string }
  | { type: 'reasoning-end'; id: string; seq?: number; runId?: string }
  | { type: 'tool'; phase: 'streaming' | 'requested' | 'completed' | 'failed' | 'skipped'; toolCallId: string; name: string; input?: unknown; output?: unknown; delta?: string; seq?: number; runId?: string }
  | { type: 'source'; source: unknown; seq?: number; runId?: string }
  | { type: 'file'; file: unknown; seq?: number; runId?: string }
  | { type: 'ask'; askId: string; schema: JsonSchema; source: 'permission' | 'approve' | 'middleware' | 'interrupt' | 'ask_user'; prompt?: string; tool?: { name: string; input: unknown; toolCallId: string }; seq?: number; runId?: string }
  | { type: 'hitl.answer'; interruptId: string; payload?: unknown; rejected?: boolean; note?: string; clientEventId?: string; seq?: number; runId?: string }
  | { type: 'run.started'; attempt: number; seq?: number; runId?: string }
  | { type: 'done'; text?: string; seq?: number; runId?: string }
  | { type: 'error'; code: string; message: string; seq?: number; runId?: string };
```

`resumed` удаляется (замена: `run.started`). `seq`/`runId` опциональны в типе (in-memory и оптимистичные события клиента без них), но `append` всегда присваивает — контракт подписчика: дедуп по `(runId, seq)` только когда поля есть.

```ts
export type SessionHandle = {
  /** Создает ран queued с user-событием; идемпотентен по clientEventId.
   *  Coded: 'thread_busy' (есть активный корневой ран), 'pending_ask' (needs_input). */
  send(input: SendInput, opts?: SendOpts & { clientEventId?: string }): Promise<{ runId: string }>;
  /** respond/reject: валидация payload по cursor.interrupt.resumeSchema, hitl.answer в журнал,
   *  ран → queued, kick. Coded: 'unknown_interrupt' | 'already_resumed' | 'run_terminal' | 'resume_validation_failed'. */
  respond(runId: string, askId: string, payload: unknown, opts?: { clientEventId?: string }): Promise<void>;
  reject(runId: string, askId: string, opts?: { note?: string; clientEventId?: string }): Promise<void>;
  /** cancel: transition → cancelled (из running под чужим epoch — fenced). */
  cancel(runId: string): Promise<void>;
  /** Живые события рана (feed.subscribe). */
  subscribe(runId: string, fromSeq?: number): AsyncIterable<SessionEvent>;
  /** Снимок рана из store. */
  runOf(runId: string): Promise<RunRecord | null>;
  /** Активный корневой ран треда. */
  activeRun(threadId: string): Promise<RunRecord | null>;
  /** Границы: retry и GC живут у клеймера/тикера хоста, здесь их нет. */
};
```

`RunClaimer` в `RuntimeContext`: `createRuntime(options)` получает `options.claimer?: RunClaimer`; `SessionHandle` вызывает `claimer?.kick()` после send/respond/reject. Создание клеймера — работа хоста (Task 12), не `createRuntime`.

- [ ] **Step 1: `ports/session.ts`** переписать по типам выше; `SendOpts = { signal?: AbortSignal; permissions?: PermissionMap; paths?: PathsConfig }` сохранить. `AgentRun` удалить.
- [ ] **Step 2: `application/session.ts`** переписать: `createSession(agent, opts, ctx)` где `ctx: RuntimeContext` дополнен полями

```ts
lifecycle: RunLifecycleStore;
events: RunEventStore;
feed: RunEventFeed;
claimer?: RunClaimer;
instanceId: string;
```

Логика методов (все без живого движка):

`send(input, opts)`:
```ts
const threadId = state.sessionId;
const active = await ctx.lifecycle.activeByThread(threadId);
if (active?.status === 'needs_input') throw codedRunError('pending_ask', ...);
if (active) throw codedRunError('thread_busy', ...);
const runId = crypto.randomUUID();
const pending: PendingSessionEvent = {
  type: 'user',
  text: normalized.text ?? '',
  attachments: normalized.attachments,
  origin: normalized.origin,
  clientEventId: opts?.clientEventId,
} as PendingSessionEvent;
await ctx.lifecycle.create({ runId, threadId }, [pending]);
ctx.claimer?.kick();
return { runId };
```

`respond(runId, askId, payload, opts)`:
```ts
const rec = await ctx.lifecycle.get(runId);
if (!rec) throw codedRunError('unknown_run', ...);
if (rec.status === 'completed') throw codedRunError('run_terminal', ...);
if (rec.status !== 'needs_input') throw codedRunError('already_resumed', ...);
if (rec.interruptId !== askId) throw codedRunError('unknown_interrupt', ...);
const snap = await state.load(); // state из RunTargets.resolve(threadId) — тот же путь, что у клеймера
const schema = (snap?.cursor as Record<string, unknown>)?.interrupt?.resumeSchema;
if (schema && !ajvValidate(schema, payload)) throw codedRunError('resume_validation_failed', ...);
await ctx.lifecycle.transition(runId, rec.leaseEpoch, {
  from: 'needs_input',
  to: 'queued',
  interruptId: null,
  events: [{ type: 'hitl.answer', interruptId: askId, payload, clientEventId: opts?.clientEventId } as PendingSessionEvent],
});
ctx.claimer?.kick();
```

`reject`: как respond, `events: [{ type: 'hitl.answer', interruptId: askId, rejected: true, note }]`.

`cancel(runId)`: `rec = get(runId)`; `transition(runId, rec.leaseEpoch, { from: rec.status, to: 'cancelled', events: [{ type: 'error', code: 'cancelled', message: 'run cancelled' }] })`. Из `running` это поднимет epoch (fencing), исполнитель следующий `append`/`renewLease` получит `lease_stale` и прервется.

`subscribe`/`runOf`/`activeRun`: прямые вызовы feed/store.

- [ ] **Step 3: `create-runtime.ts`**: `RuntimeContext` (в `application/session.ts`) расширить полями из Step 2; `createRuntime(options)` пробросить `options` → `runtimeCtx`; экспорт `RunClaimer`-типа из index. `RuntimeHandle.session()` сигнатура не меняется.
- [ ] **Step 4: `graph-run.ts` адаптировать** (one-shot API поверх журнала): `runGraph` создает ран через lifecycle (in-memory сторы из Task 2, `threadId = state.sessionId`), claim'ит сам (`lifecycle.claim(runId, 'oneshot', 15_000)`), запускает `engine.execute`, ждет конца (`while` poll `get(runId).status` до терминала или needs_input), возвращает `resultFromState` как сегодня. Это сохраняет `RuntimeHandle.run()/start()` для не-студийных хостов; `resume`-ветка `runGraph` удаляется (respond теперь путь SessionHandle).
- [ ] **Step 5: `index.ts`**: удалить экспорт `AgentRun`; добавить `RunLifecycleStore`, `RunRecord`, `RunLifecycleStatus`, `RunEventStore`, `PendingSessionEvent`, `RunTargets`, `RunTarget`, `RunEngine`, `RunEngineDeps`, `RunClaimer`, `RunEventFeed`, `createRunEventFeed`, `createRunClaimer`, `createRunEngine`, `InMemoryRunLifecycleStore`, `InMemoryRunEventStore`, `createRunEventBus`, `codedRunError`.
- [ ] **Step 6: Верификация + объединенный коммит Tasks 6-8**

```bash
bunx tsc --noEmit -p apps/studio/tsconfig.json && bun run lint
git add packages/harnesys
git commit -m "feat(harnesys): journal-first engine, claimer, session handle; drop AgentRun/recover"
```

Штатно компиляция `apps/studio` в этот момент упадет (studio еще использует `AgentRun`): допустимо только для `tsc` студии; `bunx tsc --noEmit` в пакете harnesys (есть свой tsconfig? проверить, если нет — временный tsconfig в `$CLAUDE_JOB_DIR/tmp`, не коммитить) и `bun run lint` обязаны пройти. Коммит-сообщение добавить строку `NOTE: studio compile fixed in phase 2`.

---

# Фаза 2: HTTP-слой studio

Studio переключается на журнал. После фазы 2 флоу send → SSE → ask → respond → run.started работает на сквозном пути (HITL-карточки упрощены: askUserSchema появится в фазе 3, сценарии с options работают через существующие схемы).

Предусловие: dev-БД пересоздана (bootstrap пересоздает `runs`/`run_events`, старые `events`/`snapshots` остаются, их читает `SqliteRuntimeState`).

### Task 9: Сборка composition: порты, клеймер, цели

**Files:**
- Create: `apps/studio/server/adapters/studio-run-targets.adapter.ts`
- Modify: `apps/studio/server/composition/studio.ts`
- Modify: `apps/studio/server/adapters/thread-runtime.registry.ts` (упрощение)

**Interfaces:**
- Consumes: порты и helper'ы библиотеки (фаза 1).
- Produces: собранный `RunClaimer`, `RunEventFeed`, `RunLifecycleStore`, `RunEventStore`, `StudioRunTargets`; доступ через состав `createStudioServices()` (существующая функция composition, фактическое имя сверить по файлу).

- [ ] **Step 1: `studio-run-targets.adapter.ts`**

```ts
import type { RunTarget, RunTargets } from 'harnesys';

export class StudioRunTargets implements RunTargets {
  constructor(
    private readonly deps: {
      threads: ThreadRepository;
      agents: AgentRepository;
      models: LlmModelRepository;
      providers: LlmProviderRepository;
      workspaces: WorkspaceRepository;
      workspaceHarnesys: WorkspaceHarnesysRegistry;
      runtimeStates: RuntimeStateRepository;
    },
  ) {}

  async resolve(threadId: string): Promise<RunTarget | null> {
    const thread = this.deps.threads.findById(threadId);
    if (!thread) return null;
    const agentRow = this.deps.agents.findById(thread.agentId);
    if (!agentRow) return null;
    // модель/провайдер существующие проверки из send use-case повторить здесь
    const workspace = this.deps.workspaces.findById(thread.workspaceId);
    if (!workspace) return null;
    const hx = await this.deps.workspaceHarnesys.get(workspace);
    // RuntimeHandle к моменту resolve уже собран; нужен agent definition
    const def = hx.agents().resolve(agentRow.id); // сверить фактический доступ к агенту; если недоступен — resolve через registry.threadOf + дефиниция из AgentRepository
    const state = this.deps.runtimeStates.forState(threadId);
    return { state, agent: def, permissions: permissionMapFor(resolveRunMode(thread.runMode)) };
  }
}
```

Фактические детали доступа к `AgentDefinition` сверить по `workspace-harnesys.registry.ts` (файл прочитать при исполнении; там есть путь от workspace к RuntimeHandle и агенту). `runMode` треда: если в треде нет режима, дефолт `'ask'` (как сегодня `resolveRunMode`). permissions резолвятся в момент claim: смена режима треда применяется к следующему сегменту.

- [ ] **Step 2: `composition/studio.ts`**: после существующих адаптеров добавить сборку

```ts
const eventBus = createRunEventBus();
const runLifecycle = new SqliteRunLifecycleStore(db);
const runEvents = new SqliteRunEventStore(db);
const runFeed = createRunEventFeed({ events: runEvents, lifecycle: runLifecycle, bus: eventBus });
const runTargets = new StudioRunTargets({ ... });
const engine = createRunEngine({ lifecycle: runLifecycle, events: runEvents, feed: runFeed, instanceId });
const claimer = createRunClaimer({ lifecycle: runLifecycle, targets: runTargets, engine, instanceId, sweepMs: 5_000 });
claimer // не stop() на shutdown studio: процесс студии держит клеймер всегда; при закрытии хоста вызвать claimer.stop() в существующем shutdown-хуке, если он есть
```

`instanceId`: `env.STUDIO_INSTANCE_ID ?? 'studio-local'` (константа в `config/env.ts`; федерация позже заменит на uuid инстанса).

RuntimeContext для `createRuntime` в `workspace-harnesys.registry.ts` дополнить полями `lifecycle/events/feed/claimer/instanceId` (тот же состав, что собран выше): `WorkspaceHarnesysRegistry` получает их в конструкторе.

- [ ] **Step 3: `thread-runtime.registry.ts`**: кеш `SessionHandle` остается (объект без состояния теперь, дешево). Метод `forget` остается.
- [ ] **Step 4: Верификация + Commit**

```bash
bunx tsc --noEmit -p apps/studio/tsconfig.json && bun run lint
git add apps/studio/server
git commit -m "feat(studio): wire run lifecycle ports, claimer, run targets"
```

### Task 10: Send use-case на журнал

**Files:**
- Modify: `apps/studio/server/application/threads/send-thread-run.use-case.ts` (переписать)

**Interfaces:**
- Consumes: `SessionHandle.send`, `activeRun`, `claim` (фазы 1-2), `clientEventId` из body.
- Produces: HTTP-контракт `POST /api/threads/:id/runs` → `202 {runId, status:'queued'}` | `409 {pendingAskId}` | `409 {runId}`. `AcceptedRunResponse` в `shared/types.ts` расширить: `{ runId: string; status: 'queued' }`.

- [ ] **Step 1: Логика use-case.** Вся подготовка input (buildSendInput, decorateText, attachments) остается. Замена тела `execute`:

```ts
const handle = await this.registry.threadOf(thread.id, hx, agentRow.id, workspace.path);
const clientEventId = request.clientEventId ?? crypto.randomUUID();
try {
  const { runId } = await handle.send(input, { clientEventId });
  this.publishThread(thread.id);
  return { runId, status: 'queued' as const };
} catch (error) {
  const code = (error as { code?: string }).code;
  if (code === 'pending_ask') {
    const active = await handle.activeRun(thread.id);
    throw new ConflictError(JSON.stringify({ pendingAskId: active?.interruptId, runId: active?.runId }));
  }
  if (code === 'thread_busy') {
    const active = await handle.activeRun(thread.id);
    throw new ConflictError(JSON.stringify({ runId: active?.runId }));
  }
  throw error;
}
```

Форма 409: `ConflictError` со JSON-телом в `message` — проверить `studio.error.ts`/`error-mapper` (если есть): правильнее отдать structured body. Если в http-слое есть конструктор для structured 409, использовать его; конфликт-ошибка с `code` полем: расширить `studio.error.ts` классом

```ts
export class RunConflictError extends Error {
  constructor(readonly body: { runId?: string; pendingAskId?: string }) {
    super('run conflict');
    this.name = 'RunConflictError';
  }
}
```

и в thread.controller маппить в 409 с JSON. Это контрак SmallPlan: `send` 409 несет `pendingAskId` (needs_input) или `runId` (running/queued).

`clientEventId` в запросе: `SendThreadRunRequest` + `clientEventId?: string`; `sendThreadRunBody` (zod) + поле. Клиент начнет слать в Task 24; сервер готов принять и без него (uuid на сервере).

- [ ] **Step 2: Верификация + Commit**

```bash
bunx tsc --noEmit -p apps/studio/tsconfig.json && bun run lint
git add apps/studio/server apps/studio/shared
git commit -m "feat(studio): send creates queued run via journal, 409 with run/pendingAsk"
```

### Task 11: Respond/Reject/Cancel use-cases на журнал; удаление resume

**Files:**
- Modify: `apps/studio/server/application/threads/respond-run.use-case.ts` (переписать)
- Modify: `apps/studio/server/application/threads/cancel-run.use-case.ts` (переписать)
- Delete: `apps/studio/server/application/threads/resume-thread-run.use-case.ts`
- Modify: `apps/studio/server/adapters/http/thread/thread.controller.ts` (маршруты)

**Interfaces:**
- Consumes: `SessionHandle.respond/reject/cancel`, `RunLifecycleStore` для retry.
- Produces: HTTP-контракт из спеки: respond/reject → `202 {runId}` | `400 resume_validation_failed` | `409 unknown_interrupt | run_terminal | already_resumed | lease_stale`; cancel → `202 {ok:true}` | `409 run_terminal`.

- [ ] **Step 1: `respond-run.use-case.ts`.** Зависимость меняется: `activeRuns: ActiveRunRegistry` → `sessions: { handleOf(threadId): Promise<SessionHandle> }` (через `ThreadRuntimeRegistry` после lookup треда по `runId`... ThreadId неизвестен из runId: добавить в `RunLifecycleStore`... нет: `respond` знает runId, тред по нему находит `lifecycle.get(runId)?.threadId`). Use-case:

```ts
async respond(request: RespondRunRequest): Promise<{ runId: string }> {
  const rec = await this.lifecycle.get(request.runId);
  if (!rec) throw new NotFoundError('run not found');
  const handle = await this.sessions.forThread(rec.threadId); // SessionHandle треда
  try {
    await handle.respond(request.runId, request.askId, request.payload);
  } catch (error) {
    throw mapCoded(error); // 400/409 по коду из спеки
  }
  this.publishDesk(rec.threadId);
  return { runId: request.runId };
}
```

`mapCoded(error)`: `resume_validation_failed` → `ValidationError`; `unknown_interrupt`/`already_resumed`/`run_terminal`/`lease_stale` → `RunConflictError({ code })`. Реализация: общий helper в `application/threads/map-coded-error.ts` (создать, 20 строк), используют respond/reject/cancel/retry.

- [ ] **Step 2: `cancel-run.use-case.ts`**: `lifecycle.get(runId)` → 404 если нет; `handle.cancel(runId)`; `mapCoded`; `202 {ok:true}`. Отмена из `completed` → 409 `run_terminal` (CAS отработает).
- [ ] **Step 3: retry use-case** (Create: `retry-run.use-case.ts`):

```ts
async execute(request: { runId: string }): Promise<{ runId: string }> {
  const rec = await this.lifecycle.get(request.runId);
  if (!rec) throw new NotFoundError('run not found');
  const handle = await this.sessions.forThread(rec.threadId);
  // retry = transition → queued; для needs_input запрещен (ask должен быть отвечен или отменен)
  if (rec.status === 'needs_input') throw new RunConflictError({ code: 'ask_pending' });
  try {
    await this.lifecycle.transition(request.runId, rec.leaseEpoch, {
      from: rec.status, to: 'queued', advanceAttempt: true,
      events: [{ type: 'run.started' /* нет: run.started пишет клеймер */ }],
    });
  } catch (error) {
    throw mapCoded(error); // run_terminal | already_queued
  }
  this.kick(); // claimer.kick()
  return { runId: request.runId };
}
```

Уточнение: retry для `running` с валидным lease запрещен (инстанс жив и исполняет): проверка `rec.status === 'running' && lease не истек` → `RunConflictError({ code: 'lease_held' })`; lease истек (сравнение через `rec.leaseExpiresAt < Date.now()`, время сравнивает use-case только для этого ветвления, запись делает store) → разрешен. Событие retry: `run.retried` не вводим (спека iter 3 его не имеет; граница попыток = `run.started` с attempt в журнале). События в transition retry: пусто.

Доступ к claimer в use-case: composition передает `claimer` (или метод `kick` в `sessions.forThread`-порте). Проще: `RetryRunUseCase` получает `claimer: RunClaimer` из composition.

- [ ] **Step 4: Controller.** Удалить `POST /api/threads/:id/resume` и импорт `ResumeThreadRunInput`. Добавить `POST /api/runs/:id/retry`. Порядок проверки respond-кодов сохраняется; `trace` строки обновить.
- [ ] **Step 5: Верификация + Commit**

```bash
bunx tsc --noEmit -p apps/studio/tsconfig.json && bun run lint
git add apps/studio/server
git commit -m "feat(studio): respond/reject/cancel/retry on journal; drop /resume"
```

### Task 12: SSE на RunEventFeed + stream use-case

**Files:**
- Modify: `apps/studio/server/application/threads/stream-run-events.use-case.ts` (переписать)
- Modify: `apps/studio/server/adapters/http/thread/thread.controller.ts` (SSE: fromSeq, id: seq, run-paused)

**Interfaces:**
- Produces: `GET /api/runs/:id/events?fromSeq=N` → SSE с `id: <seq>`, кадр `event: run-paused` перед закрытием на needs_input и на терминале; `404` для неизвестного рана.

- [ ] **Step 1: Use-case.** Заменить `ActiveRunRegistry` на feed:

```ts
async execute(request: StreamRunEventsRequest & { fromSeq?: number }): Promise<AsyncIterable<SessionEvent>> {
  const rec = await this.lifecycle.get(request.runId);
  if (!rec) throw new NotFoundError('run not found');
  return this.feed.subscribe(request.runId, request.fromSeq ?? 0);
}
```

`subscribe` из `RunEventFeed` завершается на needs_input/терминале сам; use-case просто отдает итератор.

- [ ] **Step 2: Controller `streamSse`**: дополнить: каждый кадр `id: String(ev.seq ?? 0)`; перед `return` (закрытие) определить причину: если последний `rec.status` (перечитать) `needs_input` → послать `event: run-paused\ndata: {"runId":...,"status":"needs_input"}\n\n`; терминалы → `event: run-paused` с `status`. Клиент различает финиш и разрыв по этому кадру (спека, раздел SSE).

- [ ] **Step 3: Верификация + Commit**

```bash
bunx tsc --noEmit -p apps/studio/tsconfig.json && bun run lint
git add apps/studio/server
git commit -m "feat(studio): SSE over RunEventFeed with fromSeq and run-paused frames"
```

### Task 13: getThread из run_events + activeRun; удаление ActiveRunRegistry

**Files:**
- Modify: `apps/studio/server/application/threads/get-thread.use-case.ts`
- Create: `apps/studio/server/application/threads/active-run-record.ts`
- Delete: `apps/studio/server/adapters/active-runs.adapter.ts`
- Delete: `apps/studio/server/application/threads/drain-agent-run.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/schema/index.ts`, `bootstrap.ts` (схема events: таблицу оставить в БД, из bootstrap DDL удалить; студия больше не пишет в нее)
- Modify: все импортеры `ActiveRunRegistry` (grep по `server/`)

**Interfaces:**
- Produces: `ThreadRecord.activeRun: { runId: string; status: RunLifecycleStatus; leaseExpired?: boolean } | null` (тип в `shared/types.ts`), `ThreadRecord.events: SessionEvent[]` из `run_events` (`listByThread`).

- [ ] **Step 1: get-thread.** Блок чтения `eventsTable` заменить:

```ts
const [events, active] = await Promise.all([
  this.runEvents.listByThread(thread.id),
  this.lifecycle.activeByThread(thread.id),
]);
```

`activeRun` построить:

```ts
function activeRunOf(active: RunRecord | null): ThreadActiveRun | null {
  if (!active) return null;
  const leaseExpired =
    active.status === 'running' && active.leaseExpiresAt !== undefined && active.leaseExpiresAt < Date.now();
  return { runId: active.runId, status: active.status, leaseExpired: leaseExpired || undefined };
}
```

(Время здесь читается для отображения; запись/сравнение lease делает store.)

- [ ] **Step 2: Удалить `rowToSessionEvent` из get-thread** (маппер теперь один: `SqliteRunEventStore.rowToEvent`). Файл get-thread сокращается; проверить, не превышен ли лимит 300 строк.
- [ ] **Step 3: grep `ActiveRunRegistry` по `apps/studio/server/`**: `send-thread-run`, `resume-thread-run` (уже удален), `cancel-run` (Task 11 переписал), `stream-run-events` (Task 12), `wire-controllers.ts`, `composition/studio.ts`. Убрать все использования: `register/cancel/findByThread/subscribe/emit/finish` больше не существуют. `schedule-fire-queue.adapter.ts` (`onThreadIdle` слушатель): idle вычисляется по `lifecycle.activeByThread` — `wire-schedules.ts` подписчик `activeRuns.onThreadIdle` заменить: после каждого `publishThread` (изменение треда) проверять `activeByThread(threadId) === null` → вызвать `scheduleFireQueue.onThreadIdle(threadId)`. Реализация: helper `notifyIdleIfFree(lifecycle, queue, threadId)` вызываемый из publish-пути.
- [ ] **Step 4: Верификация + Commit**

```bash
bunx tsc --noEmit -p apps/studio/tsconfig.json && bun run lint
git add apps/studio/server apps/studio/shared
git commit -m "feat(studio): thread events from run_events, activeRun field; delete ActiveRunRegistry and drain"
```

### Task 14: publish-desk-thread инкрементальный

**Files:**
- Modify: `apps/studio/server/application/threads/publish-desk-thread.ts`

**Interfaces:**
- Consumes: `getThread` (Task 13).
- Produces: инкрементальный паблиш; инвалидация кеша: терминальные события, `hitl.answer`, retry, компакция.

- [ ] **Step 1:** Прочитать текущий файл; если он уже читает `getThread` целиком, добавить memo по `threadId → { lastSeq, publishedAt }`: если `lifecycle` не менял `lastSeq` треда с прошлого паблиша и статус терминален с прошлого раза → skip. Проще и достаточно для фазы 2: полный `getThread` при каждом событии оставляем, но добавляем throttle 150 мс per thread (debounce) — полный инкрементальный паблиш перенести в фазу 5 вместе с `latestSeq`-полем. Решение (документирующее): **полный паблиш с debounce 150 мс; инкрементальность отложить в фазу 5**, иначе пересечение с GC-тикетом дублирует работу.
- [ ] **Step 2: Верификация + Commit**

```bash
bunx tsc --noEmit && bun run lint
git add apps/studio/server/application/threads/publish-desk-thread.ts
git commit -m "perf(studio): debounce desk thread publish"
```

---

# Фаза 3: HITL в библиотеке

После фазы 3: permission ask паркует ран вместо строковой ошибки, батч-approve переживает прерывания чекпоинтом, resume ReAct работает, все resume-пейлоады валидируются в одной точке.

### Task 15: Единый строитель tool-сообщений

**Files:**
- Create: `packages/harnesys/src/application/tool-message.ts`
- Modify: все места, где создается `{ role: 'tool', toolCallId, name, content }` (grep `role: 'tool'` по `application/`): `tool-call.ts` (несколько мест), `graph.ts`

**Interfaces:**
- Produces: `buildToolMessage(call: { toolCallId: string; name: string; content: string }): ToolMessage` и `buildToolMessageRaw(id, name, content)` — единственное место конструирования provider-сообщения роли tool.

- [ ] **Step 1: Реализация**

```ts
export type ToolMessage = {
  role: 'tool';
  toolCallId: string;
  name: string;
  content: string;
};

export function buildToolMessage(call: { toolCallId: string; name: string; content: string }): ToolMessage {
  return { role: 'tool', toolCallId: call.toolCallId, name: call.name, content: call.content };
}
```

- [ ] **Step 2: Замена.** grep `role: 'tool'` в `packages/harnesys/src/application/` → заменить литералы на `buildToolMessage(...)`. Объектных литералов роли tool вне `tool-message.ts` остаться не должно.
- [ ] **Step 3: Верификация + Commit**

```bash
bunx tsc --noEmit && bun run lint
git add packages/harnesys/src/application/tool-message.ts packages/harnesys/src/application/tool-call.ts packages/harnesys/src/application/graph.ts
git commit -m "refactor(harnesys): single tool message builder"
```

### Task 16: ask-schema: опции в схеме

**Files:**
- Create: `packages/harnesys/src/application/ask-schema.ts`
- Modify: `packages/harnesys/src/domain/errors.ts` (`AskUserInterrupt` теряет `options`/`multi`)
- Modify: `packages/harnesys/src/application/tool-call.ts` (бросок interrupt с опциями: схема из `askUserSchema`)
- Modify: `packages/harnesys/src/application/graph.ts` (interrupt-ветка: metadata без options/multi)
- Modify: `packages/harnesys/src/application/run-engine-events.ts` (слитие meta.options при чтении старых строк — оставить)

**Interfaces:**
- Produces: `askUserSchema(input: { options?: Array<{ id: string; label: string }>; multi?: boolean; allowText?: boolean }): JsonSchema`, `ASK_SCHEMA_KEYS = ['options', 'multi', 'allowText'] as const`.

- [ ] **Step 1: Реализация `ask-schema.ts`**

```ts
import type { JsonSchema } from '../domain/json-schema.ts';

export const ASK_SCHEMA_KEYS = ['options', 'multi', 'allowText'] as const;

export type AskUserSchemaInput = {
  options?: Array<{ id: string; label: string }>;
  multi?: boolean;
  allowText?: boolean;
};

export function askUserSchema(input: AskUserSchemaInput): JsonSchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  if (input.options?.length) {
    properties.optionIds = {
      type: 'array',
      items: { type: 'string', enum: input.options.map((o) => o.id) },
      ...(input.multi ? {} : { maxItems: 1 }),
    };
    required.push('optionIds');
  }
  if (input.allowText !== false) {
    properties.text = { type: 'string' };
  }
  const schema: Record<string, unknown> = { type: 'object', properties };
  if (required.length > 0) {
    schema.required = required;
  }
  if (input.options?.length) {
    schema.options = input.options; // служебные ключи: Ajv strict:false игнорирует; клиент читает для рендера
    schema.multi = input.multi === true;
  }
  return schema as JsonSchema;
}
```

- [ ] **Step 2: `AskUserInterrupt`**: поля `options`/`multi` удалить из класса и конструктора; конструктор принимает `resumeSchema?: JsonSchema` как сейчас. Броски с опциями (grep `new AskUserInterrupt` по `application/`): вместо `options`/`multi` передавать `resumeSchema: askUserSchema({ options, multi, allowText: true })`.
- [ ] **Step 3: graph.ts interrupt-ветка**: metadata события `interrupt.triggered` больше не содержит `options`/`multi` (схема уже с ними). `run-engine-events.ts` слияние `meta.options` при чтении оставить: старые строки БД (пересозданная dev-БД, но in-memory журналы) читаются без разрыва.
- [ ] **Step 4: `resumeSchema()`-вырезание в run-engine (старом) уже удалено с Task 6** (новый движок не вырезает опции: валидируется по полной схеме? Нет: `respond` в `session.ts` валидирует по `cursor.interrupt.resumeSchema`; служебные ключи (`options`, `multi`) в схеме Ajv strict:false игнорирует автоматически. Проверка: `ajv.validate(schema, payload)` при schema с ключом `options` вне properties: Ajv не валидирует неизвестные ключи, `strict: false` подавляет предупреждение. ОК.)
- [ ] **Step 5: Верификация + Commit**

```bash
bunx tsc --noEmit && bun run lint
git add packages/harnesys/src
git commit -m "feat(harnesys): askUserSchema puts options/multi into resumeSchema; drop interrupt fields"
```

### Task 17: Чекпоинт узла (обобщение approve)

Существующая approve-логика в `tool-call.ts` (строки ~293-430) уже пишет `$batchApprove_{nodeId}` = `{ done, results }` и переживает resume. Обобщение до `$nodeCheckpoint_{nodeId}` = `{ completed: Record<number, ToolCallResult> }` с переносом в отдельный файл.

**Files:**
- Create: `packages/harnesys/src/application/tool-approve.ts`
- Modify: `packages/harnesys/src/application/tool-call.ts` (approve-блок переехал; только вызов)

**Interfaces:**
- Produces: `executeApproveBatch(node, calls, ctx): Promise<ToolCallBatchOutcome>` где

```ts
export type ToolCallBatchOutcome = {
  results: ToolCallResult[];
  toolMessages: (ToolMessage | undefined)[];
};

export type ApproveNodeLike = {
  approve?: { tools: string[]; reason: string; resumeSchema: JsonSchema };
};
```

Ключ state: `NODE_CHECKPOINT_KEY = '$nodeCheckpoint_'` (конкатенация с `ctx.nodeId`). Форма: `{ completed: Record<number, ToolCallResult> }` — индексы вызовов → результаты. Формат шире старого `{ done, results }` (обе ветки: needsApprove и free) на случай комбинированных батчей, без мигратора.

- [ ] **Step 1: Перенос.** Код approve-блока из `tool-call.ts` перенести в `tool-approve.ts` с изменениями:
  - восстановление из `ctx.state[NODE_CHECKPOINT_KEY + ctx.nodeId]` → `completed: Record<number, ToolCallResult>`; вызов с сохраненным результатом не исполняется заново.
  - сохранение: перед броском `AskUserInterrupt` записать `{ completed: текущие результаты }` в state; после каждого успешного вызова needsApprove тоже.
  - при завершении батча: `delete ctx.state[key]`.
  - свободные (не approve) вызовы батча: исполняются в пуле параллельно, их результаты тоже в `completed` (чекпоинт актуален, если interrupt случился позже в этом же узле).
  - throw `AskUserInterrupt` — тот же контракт, что сегодня: пула не роняет `Promise.all` (текущее поведение approve-ветки сохранить: последовательный обход needsApprove до interrupt, свободные уже доиграли).
  - сообщения «rejected by user» и «denied by user» строит `buildToolMessage` (Task 15).
- [ ] **Step 2: `tool-call.ts`**: вместо approve-блока вызов `executeApproveBatch` когда `node.approve` задан; общий путь без approve не меняется. Файл должен сократиться ниже 400 строк.
- [ ] **Step 3: Верификация + Commit**

```bash
bunx tsc --noEmit && bun run lint
git add packages/harnesys/src/application/tool-approve.ts packages/harnesys/src/application/tool-call.ts
git commit -m "refactor(harnesys): node checkpoint generalize approve batching (tool-approve.ts)"
```

### Task 18: Permission ask паркует ран

**Files:**
- Modify: `packages/harnesys/src/application/tool-call.ts` (ветка `gate === 'ask'`)

**Interfaces:**
- Produces: permission ask с `source: 'permission'`, resume `{approved: boolean}`, reject-путь строит tool-сообщение «denied by user» + `tool.skipped`.

- [ ] **Step 1:** Ветку `permCheck.gate === 'ask'` (сейчас: результат `permission ask: ...`, isError, skipped) заменить на бросок:

```ts
if (permCheck.gate === 'ask') {
  const call = calls[idx] as { name: string; args: unknown; id: string };
  throw new AskUserInterrupt({
    prompt: `allow ${permCheck.operation}?`,
    source: 'permission',
    tool: { name: call.name, input: call.args, toolCallId: call.id },
    interruptId: `perm/${ctx.nodeExecutionId}/${idx}`,
    resumeSchema: askUserSchema({ options: [
      { id: 'approved', label: 'approve' },
      { id: 'denied', label: 'deny' },
    ], multi: false, allowText: false }),
  });
}
```

Resume-пейлоад permission: `{ approved: boolean }`. Схема с optionIds позволяет клиенту рендерить кнопки; сервер нормализует: `session.respond` принимает `{approved}` или `{optionIds: ['approved'|'denied']}`. Нормализация на клиенте (Task 24): кнопка approve шлет `{approved:true}`, deny `{approved:false}`. Поэтому схема выше: properties `approved: {type:'boolean'}` вместо optionIds:

```ts
resumeSchema: { type: 'object', properties: { approved: { type: 'boolean' } }, required: ['approved'] } as JsonSchema,
```

Финальная форма в коде — вторая (boolean), первая иллюстрация отвергнута: клиентские кнопки рисуются по `source: 'permission'`, не по схеме.

- [ ] **Step 2: Resume-обработка.** Пул `tool-approve.ts` при `resumePayload.approved === false` (permission-ветка): `buildToolMessage({...content: 'denied by user'})`, результат `{ isError: false, skipped: true }`. Различение permission-resume от approve-resume: interruptId префикс `perm/`.
- [ ] **Step 3: `mode='ask'` инструменты** (`write_file`, `edit_file`, `shell`, `http`) уже получают gate `ask` из `permissionMapFor` — парковка ран через interrupt происходит автоматически после Step 1. Строковых ошибок «permission ask» больше нет (grep удалить).
- [ ] **Step 4: Верификация + Commit**

```bash
bunx tsc --noEmit && bun run lint
git add packages/harnesys/src/application/tool-call.ts packages/harnesys/src/application/tool-approve.ts
git commit -m "feat(harnesys): permission gate parks run with permission ask interrupt"
```

### Task 19: Resume ReAct: восстановление output

**Files:**
- Modify: `packages/harnesys/src/application/run-engine.ts` (`execute`, resume-ветка)
- Modify: `packages/harnesys/src/application/graph.ts` (восстановление `output` при старте с узла)

**Interfaces:**
- Consumes: журнал (`hitl.answer`), снапшот (`$state.messages`).
- Produces: корректный resume сегмента с узла `tool:call` (1.1 из review): модель получает свой последний assistant-вызов и tool-результаты, а не начинает с чистого output.

- [ ] **Step 1: В run-engine `execute`** при `startNodeId` заданном: перед `startGraph` вычислить

```ts
const reactOutput = restoreReActOutput(opts.state); // читает $state.messages
```

и передать в `GraphOpts.outputHint` (новое поле `GraphOpts`, опциональное).

- [ ] **Step 2: `restoreReActOutput`** (в `run-engine.ts` или `graph-helpers.ts`, лучше второе):

```ts
export function restoreReActOutput(state: RuntimeState): unknown {
  // синхронно: state.load() асинхронный; функция принимает уже загруженный snapshot
}
```

Финальная форма: `restoreReActOutput(snapshot: Snapshot | null): { results: ToolCallResult[] } | null` — находит последнее assistant-сообщение с `toolCalls` в `snapshot.state.messages`, строит `output = { results: toolCalls.map(tc => ({ id: tc.toolCallId, name: tc.name, result: '', isError: false })) }`; результаты не важны: узел `tool:call` после resume выполняет только незавершенные вызовы (чекпоинт Task 17), а завершенные берет из чекпоинта. `output` нужен только как слот выражений графа (`$output.*`) при вычислении edges до первого завершения узла.

- [ ] **Step 3: graph.ts**: в начале `startGraph` при `opts.startNodeId` заданном: `let output = opts.outputHint ?? null` (сейчас `output = null`); слот доступен в `slots` сразу.
- [ ] **Step 4: Верификация + Commit**

```bash
bunx tsc --noEmit && bun run lint
git add packages/harnesys/src/application
git commit -m "feat(harnesys): restore react output on segment resume from tool:call"
```

### Task 20: Единая точка валидации resume; чистка graph.ts entry

**Files:**
- Modify: `packages/harnesys/src/application/graph.ts` (удалить Ajv-валидацию при entry, строки ~185-197)
- Modify: `packages/harnesys/src/application/session.ts` (валидация уже в respond, Task 8)

**Interfaces:**
- Consumes: `respond` валидирует payload до записи `hitl.answer` (фаза 1).
- Produces: graph доверяет журналу: при `startNodeId` + `resumePayload` Ajv-блок удален.

- [ ] **Step 1:** Удалить блок `if (opts.resumePayload !== undefined && !opts.rejected && interrupt?.resumeSchema) { ...ajv... }` из graph.ts. Импорт Ajv из graph.ts убрать, если больше не используется.
- [ ] **Step 2: Верификация + Commit**

```bash
bunx tsc --noEmit && bun run lint
git add packages/harnesys/src/application/graph.ts
git commit -m "refactor(harnesys): graph trusts journal; resume validation single point in respond"
```

### Task 21: Ручная проверка фазы 3 (стенд)

**Files:** нет. Проверка на живом стенде (порты 3000/5173, не поднимать вторые).

- [ ] **Step 1:** Попросить у пользователя скрин/подтверждение сценария: send c tool `write_file` в `mode='ask'` → карточка permission → approve → исполнение; deny → tool-сообщение «denied by user» + skipped.
- [ ] **Step 2:** Батч с `approve.tools` из 2+ вызовов: approve первого → interrupt второго (чекпоинт) → approve → оба результата. Перезагрузка страницы между прерываниями: чекпоинт восстановлен.
- [ ] **Step 3:** ask_user с options (где есть в агентах): карточка рендерит кнопки из schema.options.

---

# Фаза 4: Клиент

### Task 22: RunStreamClient машина состояний

**Files:**
- Create: `apps/studio/client/src/features/send-message/model/run-stream-client.ts`

**Interfaces:**
- Consumes: `getRunEventsStream(runId, fromSeq, signal)`, `readSse`, `getThread`, stores.
- Produces:

```ts
export type RunStreamState = 'connecting' | 'live' | 'paused' | 'reconnecting' | 'terminal' | 'offline';

export type RunStreamClient = {
  /** Идемпотентно: второй connect на тот же runId игнорируется (guard вне React-стейта). */
  connect(runId: string, fromSeq?: number): void;
  respond(askId: string, payload: unknown, opts?: { clientEventId?: string }): Promise<void>;
  reject(askId: string, note?: string): Promise<void>;
  cancel(): Promise<void>;
  /** Ручной retry после offline. */
  reconnect(): void;
  stop(): void;
  getState(): RunStreamState;
  onTransition(listener: (state: RunStreamState) => void): () => void;
};

export function createRunStreamClient(deps: {
  threadId: string;
  store: SessionStore; //zustand useSessionStore.getState()
  onEvent: (event: SessionEvent) => void;
  onTerminal: () => void; // одноразовый reconcile getThread
}): RunStreamClient;
```

- [ ] **Step 1: Реализация.** Класс без React. Состояния и переходы:

```
connect(runId, fromSeq)
  → connecting: fetchSse(getRunEventsStream(runId, fromSeq ?? lastSeqOf(runId)))
  → открыт: live (после первого run.started) / queued (кадры есть, run.started нет)
  → кадры: onEvent для каждого; seq трекинг в lastSeqByRun (Map в store)
  → event run-paused: paused (run еще не терминален) | terminal (терминальный статус в data)
  → обрыв соединения без run-paused:
      если статус рана needs_input → paused
      иначе → reconnecting (backoff 1s*2^n, максимум 30s, после 5 неудач offline)
  → terminal: один onTerminal() (reconcile getThread), состояние terminal; повторный connect нового рана создает нового клиента
respond/reject/cancel: POST-запросы через api; после 202 → connect(runId, lastSeq) переподключение
  → 409 already_resumed/lease_held: connect(runId, lastSeq) тоже (не ретраить)
offline → reconnect(): сброс счетчика, connect
```

Guard второго `connect`: поле `currentRunId`; `connect` с тем же runId в состоянии connecting/live/paused/reconnecting игнорирует. `abort` контроллер хранится, `stop()` рвет.

`lastSeqByRun`: Map в module-scope (вне React), `applyClientEvent` (Task 23) обновляет.

- [ ] **Step 2: Верификация + Commit**

```bash
bunx tsc --noEmit -p apps/studio/client/tsconfig.app.json && bun run lint
git add apps/studio/client/src/features/send-message/model/run-stream-client.ts
git commit -m "feat(studio-client): RunStreamClient state machine over transport adapter"
```

### Task 23: reconcileEvents по (runId, seq); session.store

**Files:**
- Modify: `apps/studio/client/src/entities/session/model/session.store.ts`

**Interfaces:**
- Produces: `reconcileEvents(threadId, events: SessionEvent[])` (замена `replaceEvents`): мердж по ключу; оптимистичные не затираются.

- [ ] **Step 1:** В store:

```ts
reconcileEvents(threadId, serverEvents) {
  const existing = get().eventsByThread[threadId] ?? [];
  const byKey = new Map<string, SessionEvent>();
  for (const ev of existing) {
    byKey.set(eventKey(ev), ev);
  }
  for (const ev of serverEvents) {
    byKey.set(eventKey(ev), ev); // сервер перезаписывает по ключу (runId, seq)
  }
  const merged = [...byKey.values()].sort(sortEvents);
  set(...eventsByThread: { [threadId]: merged }...);
}

function eventKey(ev: SessionEvent): string {
  if (ev.runId !== undefined && ev.seq !== undefined) return `${ev.runId}:${ev.seq}`;
  if (ev.clientEventId) return `ce:${ev.clientEventId}`;
  return `t:${timestampCounter++}`; // локальные без идентификаторов: порядок вставки
}
```

`sortEvents`: `(runId, seq)` известные раньше неизвестных, потом по seq, потом порядок вставки. Оптимистичное `user` несет `clientEventId` (Task 24), серверное эхо перезапишет по `ce:`-ключу.

`resumed`-событий больше нет; `run.started`/`hitl.answer` рендер: `run.started` не рендерится сообщением (участие в мердже достаточно); `hitl.answer` закрывает карточку.

- [ ] **Step 2: Верификация + Commit**

```bash
bunx tsc --noEmit -p apps/studio/client/tsconfig.app.json && bun run lint
git add apps/studio/client/src/entities/session
git commit -m "feat(studio-client): reconcile events by (runId, seq) with optimistic overlay"
```

### Task 24: send-message и hitl-actions через клиента; удаление старых потоков

**Files:**
- Modify: `apps/studio/client/src/features/send-message/model/send-message.ts` (переписать)
- Modify: `apps/studio/client/src/features/send-message/model/hitl-actions.ts` (переписать)
- Modify: `apps/studio/client/src/features/send-message/model/pending-hitl.ts` (небольшая правка: `hitl.answer` закрывает, `run.started` не сбрасывает)
- Delete: `apps/studio/client/src/features/send-message/model/follow-live.ts`
- Delete: `apps/studio/client/src/features/send-message/model/drain-run-stream.ts`
- Delete: `apps/studio/client/src/features/send-message/model/resume-paused.ts`
- Modify: `apps/studio/client/src/features/send-message/index.ts` (экспорты)
- Modify: `apps/studio/client/src/widgets/chat-transcript/ui/thread-panel.tsx` (вызов `followLiveThread` → клиент)
- Modify: `apps/studio/client/src/features/send-message/ui/hitl-prompt.tsx` (вызов `resumePausedThread` → respond/reject)
- Modify: `apps/studio/shared/api/threads.ts` (client: `clientEventId` в send; `retryRun`)
- Create: `apps/studio/client/src/shared/api/runs.ts` (respond/reject/cancel/retry типизированные)

**Interfaces:**
- Consumes: `createRunStreamClient` (Task 22), `reconcileEvents` (Task 23).
- Produces: единый путь: send → 202 → client.connect; respond → POST → client.connect(runId, lastSeq).

- [ ] **Step 1: `send-message.ts`** (структура):

```ts
export async function sendMessage(options: SendMessageOptions) {
  const store = useSessionStore.getState();
  const clientEventId = crypto.randomUUID();
  // оптимистичное user-событие с clientEventId
  store.appendEvent(threadId, { type: 'user', text: trimmed, ..., clientEventId });
  try {
    const accepted = await sendThreadRun({ ..., clientEventId });
    store.setRunId(threadId, accepted.runId);
    getClient(threadId).connect(accepted.runId); // реестр клиентов per thread
  } catch (error) {
    if (isConflict(error)) {
      const body = conflictBody(error); // { runId } | { pendingAskId }
      if (body?.runId) {
        store.setRunId(threadId, body.runId);
        getClient(threadId).connect(body.runId);
        return;
      }
      if (body?.pendingAskId) {
        // карточка уже в ленте, композер блокирован pendingHitl: ничего не слать
        return;
      }
    }
    store.appendEvent(threadId, { type: 'error', code: 'send_failed', message: ... });
  }
}
```

Реестр клиентов: `clientsByThread: Map<string, RunStreamClient>` module-scope; `getClient(threadId)` создает с deps (`onEvent` → `store.appendEvent` + `maybeMarkUnread` + обновление `lastSeq`; `onTerminal` → reconcile `getThread` → `reconcileEvents`).

- [ ] **Step 2: `hitl-actions.ts`**: `respondToAsk(threadId, askId, payload)` → `getClient(threadId).respond(askId, payload)`; `rejectAsk` аналогично. `ensureLiveRun` удален (клиент всегда подключен, пока ран активен). Восстановление подключения при загрузке треда: `thread-panel.tsx` вместо `followLiveThread`:

```ts
const active = record.activeRun; // из getThread (Task 13)
if (active && !TERMINAL_STATUSES.has(active.status)) {
  getClient(threadId).connect(active.runId);
}
```

- [ ] **Step 3: `pending-hitl.ts`**: закрытие карточки: `hitl.answer` с соответствующим `interruptId` или терминальное событие. `run.started` не закрывает.
- [ ] **Step 4: Кнопка «Повторить»** на failed-ране: компонент статуса рана (найти по grep `retry`/failed-указатель в `widgets/chat-transcript`): `POST /api/runs/:id/retry` → `getClient(threadId).connect(runId, lastSeq)`. 409 (`already_queued`) → просто connect.
- [ ] **Step 5: Удалить файлы** follow-live/drain-run-stream/resume-paused и их импорты; `index.ts` экспорт `sendMessage`, `respondToAsk`, `rejectAsk`, `retryRun`.
- [ ] **Step 6: Верификация + Commit**

```bash
bunx tsc --noEmit -p apps/studio/client/tsconfig.app.json && bun run lint
git add apps/studio/client apps/studio/shared
git commit -m "feat(studio-client): single RunStreamClient path; drop follow-live/drain/resume flows"
```

### Task 25: Композер, HitlPayload, tooltip

**Files:**
- Modify: `apps/studio/client/src/widgets/chat-composer/ui/chat-composer.tsx` (tooltip 3.10)
- Create: `apps/studio/shared/hitl-payload.ts` (union тип)

**Interfaces:**
- Produces: `HitlPayload = ConfirmPayload | AskPayload | PermissionPayload` (typed union для payload Confirm/Ask, 3.9); tooltip на disabled композере.

- [ ] **Step 1: `shared/hitl-payload.ts`**

```ts
export type ConfirmPayload = { approved: boolean };
export type AskPayload = { text?: string; optionIds?: string[] };
export type PermissionPayload = { approved: boolean };
export type HitlPayload = ConfirmPayload | AskPayload | PermissionPayload;

export function payloadForSource(source: string, input: { approved?: boolean; text?: string; optionIds?: string[] }): HitlPayload {
  if (source === 'permission' || source === 'approve') {
    return { approved: input.approved ?? false };
  }
  return { text: input.text, optionIds: input.optionIds };
}
```

Экспорт из `shared/types.ts`. `hitl-prompt.tsx`/`hitl-preview.tsx` используют union вместо `unknown`.
- [ ] **Step 2: tooltip**: у disabled send-кнопки при `pendingHitl` — title «Ответьте на вопрос агента» (фактическая формулировка по месту, 3.10).
- [ ] **Step 3: Верификация + Commit**

```bash
bunx tsc --noEmit && bun run lint
git add apps/studio/shared apps/studio/client
git commit -m "feat(studio): HitlPayload union and composer tooltip (3.9, 3.10)"
```

### Task 26: Ручная проверка фазы 4 (контрольная точка спеки)

Сценарий проверки после фазы 4 (из спеки, полный список):

- [ ] флоу send → SSE (`queued` индикатор → live) → ask → respond → `run.started` и хвост исполнения;
- [ ] reload на parked ране: карточка ask восстановлена, клиент подключен (activeRun из getThread);
- [ ] рестарт процесса studio: running с истекшим lease — `leaseExpired: true` в activeRun, кнопка «Повторить»; queued после рестарта дообирается клеймером;
- [ ] дабл-сабмит ответа: второй respond → 409 already_resumed → connect, карточка закрыта;
- [ ] дабл-сабмит send (два быстрых Enter): второй → 409 с runId → connect на тот же ран, дубля в ленте нет;
- [ ] гонка двух параллельных send из двух вкладок: один 202, другой 409;
- [ ] retry из failed: run.started с attempt=2, исполнение;
- [ ] дабл-клик retry: второй → 409 already_queued;
- [ ] cancel на живом ране: run.cancelled в ленте, исполнитель прерван.

---

# Фаза 5: GC и хвосты

### Task 27: Ask TTL тикер

**Files:**
- Create: `apps/studio/server/adapters/ask-ticker.adapter.ts`
- Modify: `apps/studio/server/composition/studio.ts` (запуск)

**Interfaces:**
- Consumes: `listExpiredAsks` (Task 4), `transition`.
- Produces: `startAskTicker({ lifecycle, kick, ttlMs? }) : { stop() }`.

- [ ] **Step 1: Реализация**

```ts
export function startAskTicker(deps: { lifecycle: RunLifecycleStore; kick: () => void; ttlMs?: number; intervalMs?: number }) {
  const ttl = deps.ttlMs ?? ASK_TTL_DEFAULT_MS;
  const interval = setInterval(async () => {
    try {
      const expired = await deps.lifecycle.listExpiredAsks({ limit: 50, olderThanMs: ttl });
      for (const rec of expired) {
        try {
          await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
            from: 'needs_input', to: 'cancelled',
            events: [{ type: 'error', code: 'ask_expired', message: 'ask expired' }],
          });
          deps.kick(); // паблиш деск-обновлений через существующий onPersist-путь: kick не нужен, паблиш ниже
        } catch { /* гонка с respond: transition отработал CAS, ок */ }
      }
    } catch { /* тикер переживает ошибки */ }
  }, deps.intervalMs ?? 60_000);
  return { stop: () => clearInterval(interval) };
}
```

Паблик деск после cancel: тикер не знает desk; вызвать существующий `publishThread` через callback `onCancelled(threadId)` из composition.
- [ ] **Step 2: Верификация + Commit**

```bash
bunx tsc --noEmit && bun run lint
git add apps/studio/server
git commit -m "feat(studio): ask ttl ticker cancels stale needs_input runs"
```

### Task 28: Точечные чистки (3.5-3.7)

**Files:**
- Modify: `packages/harnesys/src/application/graph.ts` (3.5 tokens без usage, 3.6 мертвый if, 3.7 resolveConcurrency дубль)

**Interfaces:** без изменений API.

- [ ] **Step 1:** Прочитать `review_consolidated.md` строки 3.5/3.6/3.7 с указаниями мест; применить точечно: `tokens` не растет при отсутствии `usage` в ответе модели; удалить мертвый fallback-`if`; убрать дублирующую проверку в `resolveConcurrency`.
- [ ] **Step 2: Верификация + Commit**

```bash
bunx tsc --noEmit && bun run lint
git add packages/harnesys/src/application/graph.ts
git commit -m "refactor(harnesys): token accounting, dead fallback, concurrency dedup (3.5-3.7)"
```

### Task 29: Удаление мертвых хвостов

**Files:**
- Delete: `packages/harnesys/src/application/run-engine-stream.ts`
- Delete: `apps/studio/server/adapters/store/sqlite/schema/events.ts` (после Task 13; схема не пишется)
- Grep-чистка: `resumed` (тип события), `AgentRun`, `SessionHandle.resume`, `/api/threads/:id/resume` (клиент `resumeThread` в `shared/api/threads.ts`), `follow-live`, `drain`, `ActiveRunRegistry` (остатки)

**Interfaces:** без изменений.

- [ ] **Step 1:** grep по монорепо: `resumed'|AgentRun|resumeThread|run-engine-stream|ActiveRunRegistry|drainAgentRun` → удалить все вхождения (код, не комментарии истории). `SessionEvent.resumed` уже удален в Task 8; здесь убрать упоминания в типах studio (`transcript.ts` рендер, если остался).
- [ ] **Step 2: `InMemoryRunEventStore.getCommittedEvents`** оставить (debug).
- [ ] **Step 3: Верификация + Commit**

```bash
bunx tsc --noEmit && bun run lint
git add -A
git commit -m "chore: remove run engine stream, legacy event schema, resume API references"
```

### Task 30: Финальная сверка со спекой

- [ ] **Step 1:** Пройтись по спеке раздел за разделом: «Удаления» (все пункты удалены), «HTTP-контракт» (маршруты совпадают), «События жизненного цикла» (все пишутся той же транзакцией), «Ресурсы» (буфер 500, TTL 7 дней), «Порядок работ» (все фазы).
- [ ] **Step 2:** Финальный сценарий спеки: прогнать контрольный список Task 26 повторно на пересозданной БД.
- [ ] **Step 3:** Commit оставшихся правок (если есть), финальное сообщение о завершении пользователю.

---

## Самопроверка плана (self-review)

**1. Спец-покрытие** (раздел спеки → таски):

- RunRecord/схема runs → Task 4; RunLifecycleStore → Tasks 1, 2, 4; RunEventStore → Tasks 1, 2, 5; RunTargets → Tasks 1, 9; RunEventFeed → Task 3; claim/fencing/lease → Tasks 2, 4, 6, 7; RunEngine без памяти → Task 6; RunClaimer/kick/sweep → Task 7; send как queued-запись → Tasks 8, 10; respond/reject через hitl.answer → Tasks 8, 11; retry → Task 11; cancel → Tasks 8, 11; clientEventId дедуп → Tasks 2, 4, 5, 10, 24; чекпоинт узла → Task 17; ask-schema → Task 16; permission ask → Task 18; reject-сообщения → Tasks 15, 18; resume ReAct → Task 19; единая валидация → Tasks 8, 20; события run.started/терминалов → Tasks 6, 8; SSE fromSeq/run-paused → Task 12; HTTP-контракт → Tasks 10, 11, 12; activeRun/leaseExpired → Task 13; GC ask TTL → Task 27; replay-буфер 500 → Task 3; client RunStreamClient → Task 22; reconcileEvents → Task 23; композер/HitlPayload → Task 25; publish debounce → Task 14; чистки 3.5-3.7, 3.10, 3.9 → Tasks 28, 25; удаление хвостов → Tasks 11, 13, 24, 29.

Пустых покрытий нет. Родительский инвариант (частичный уникальный индекс) → Task 4 Step 2. `childrenByParent`/barrier → Task 1 (порт), исполнение 0.6.0 (не-цель).

**2. Плейсхолдеры:** нет TBD/TODO; «сверить по файлу» в Task 9/24 относится к чтению фактических соседей при исполнении (файлы названы), не к отсутствию решения: решение описано, детали сверяются.

**3. Типы:** `RunRecord` (Task 1) = `SqliteRunLifecycleStore` (Task 4) = use-cases; `PendingSessionEvent` сквозной; `SessionEvent.seq/runId` опциональны в union, `append` присваивает всегда; `RunStreamClient` использует `getRunEventsStream`/`readSse` (существующие), `reconcileEvents` сигнатура согласована в Tasks 22-24; `buildToolMessage` в Tasks 15/17/18 согласован; `ASK_TTL_DEFAULT_MS` экспорт Task 4, использование Task 27.
