# Навигация IDE: маршруты, табы, инспектор, сайдбар — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести IDE студии на модель «URL = активный таб» с табами только `thread` и `file`, конфигами-модалками, лендингом агента, аккордеоном сайдбара и вебхуками как триггерами с тредами.

**Architecture:** Спека `docs/superpowers/specs/2026-09-05-ide-navigation-design.md`. Сервер: вебхук повторяет модель расписания (обязательный тред 1:1, запуск пишет ход в тред, CRUD по HTTP). Клиент: react-router v7 остаётся, `useIdeStore` хранит набор табов `thread | file`, URL `/w/:ws/thread/:id`, `/w/:ws/file/*`, `/w/:ws/agent/:id` (лендинг вне табов). Инспектор: Inspector / Memory для тредов, FileInspector для файлов. Сайдбар: аккордеон Agents / Explorer / Automations / Git с ресайзом.

**Tech Stack:** React 19, react-router v7, zustand, react-hook-form + zod, Hono + drizzle/better-sqlite3 (сервер), biome.

**Spec:** `docs/superpowers/specs/2026-09-05-ide-navigation-design.md`

## Global Constraints

- **Тесты запрещены** (`AGENTS.md`): не создавать `*.test.ts` / `*.spec.ts`, не ставить vitest/RTL/playwright. Проверка задачи: `bunx biome check apps/studio` (или из корня `bunx biome check .`) + ручной сценарий на живом стенде.
- Стенд держит хозяин: порты `3000` (API) и `5173` (Vite). Не поднимать второй Vite/API, не рестартить процессы. Если нужен рестарт сервера после серверных правок (задачи 1–3) или проверка в браузере — попросить хозяина в чате.
- Формат и линт: biome на весь монорепо, исправления только `biome check --write` в зоне задачи.
- FSD: импорт слайса снаружи только через его `index.ts`; импорт только вниз по слоям.
- Именованные типы вместо `T['field']` / `Parameters<typeof fn>[0]` (плагин `no-indexed-access-type`).
- Файлы ~300 строк, резать по ответственности.
- UI-строки студии — английские (как существующие лейблы), комментарии в коде не добавлять.
- Идентификаторы — UUID. Префикс маршрутов `/w/` сохраняется.
- `packages/harnesys` не трогать.

---

### Task 1: Сервер — схема и домен вебхука с тредом

**Files:**
- Modify: `apps/studio/server/adapters/store/sqlite/bootstrap.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/schema/webhooks.ts`
- Modify: `apps/studio/server/domain/webhook.port.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/repos/sqlite-webhook.repo.ts`
- Modify: `apps/studio/server/domain/thread.port.ts:1`
- Modify: `apps/studio/server/application/threads/delete-thread.use-case.ts`
- Modify: `apps/studio/shared/thread.ts:5`
- Modify: `apps/studio/shared/types.ts`

**Interfaces:**
- Produces: `Webhook.threadId: string`; `WebhookRepository.findByThreadId(threadId): Webhook | undefined`; `ThreadKind = 'chat' | 'schedule' | 'webhook'`; `WebhookRecord` и `CreateWebhookResponse` в `@studio/shared` (использует Task 3); `DeskEvent` пополняется `{type:'webhook'} | {type:'webhook-deleted'}` (использует Task 3).

- [ ] **Step 1: bootstrap.ts — расшить kind и добавить thread_id**

В массиве `statements` заменить CHECK у таблицы `threads` (строка 64):

```sql
CHECK(kind IN ('chat', 'schedule', 'webhook'))
```

В CREATE таблицы `webhooks` (строки 105–117) добавить колонку после `endpoint`:

```sql
      endpoint TEXT NOT NULL,
      thread_id TEXT NOT NULL REFERENCES threads(id),
      last_fired_at TEXT,
```

В конец массива `statements` добавить:

```sql
    `CREATE UNIQUE INDEX IF NOT EXISTS webhooks_thread_idx ON webhooks(thread_id);`,
```

После цикла `for (const statement of statements)` (строка 177) добавить миграцию старых баз: пересборка `threads` (SQLite не умеет менять CHECK) и добор колонки webhooks. Стиль — зеркалит блок `schedules` (строки 238–250):

```ts
  // Widen threads.kind CHECK for webhook threads (SQLite requires table rebuild).
  try {
    const master = db.all<{ sql: string }>(
      sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'threads'`,
    );
    const createSql = master[0]?.sql ?? '';
    if (createSql !== '' && !createSql.includes("'webhook'")) {
      db.run(sql.raw('PRAGMA foreign_keys = OFF;'));
      db.run(sql.raw(`CREATE TABLE threads_kind_migration (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
        title TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'chat',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_read_at TEXT NOT NULL,
        CHECK(kind IN ('chat', 'schedule', 'webhook'))
      );`));
      db.run(sql.raw('INSERT INTO threads_kind_migration SELECT * FROM threads;'));
      db.run(sql.raw('DROP TABLE threads;'));
      db.run(sql.raw('ALTER TABLE threads_kind_migration RENAME TO threads;'));
      db.run(sql.raw('PRAGMA foreign_keys = ON;'));
    }
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE webhooks ADD COLUMN thread_id text REFERENCES threads(id);'));
  } catch {}

  try {
    db.run(sql.raw('DELETE FROM webhooks WHERE thread_id IS NULL;'));
  } catch {}

  try {
    db.run(sql.raw('CREATE UNIQUE INDEX IF NOT EXISTS webhooks_thread_idx ON webhooks(thread_id);'));
  } catch {}
```

- [ ] **Step 2: drizzle-схема webhooks.ts**

В `schema/webhooks.ts` после `endpoint: text('endpoint').notNull(),` добавить:

```ts
    threadId: text('thread_id')
      .notNull()
      .references(() => threadsTable.id),
```

Импорт: `import { threadsTable } from './threads.ts';` (имя проверить по соседним схемам, файл лежит в той же папке).

В объекте третьего аргумента добавить:

```ts
    threadIdx: index('webhooks_thread_idx').on(table.threadId),
```

`index` уже импортирован.

- [ ] **Step 3: домен webhook.port.ts**

`Webhook` и `WebhookInsert` получают `threadId: string` (после `endpoint`). `WebhookRepository` дополняется:

```ts
  findByThreadId(threadId: string): Webhook | undefined;
```

- [ ] **Step 4: репозиторий sqlite-webhook.repo.ts**

В `toWebhook` добавить `threadId: row.threadId,` (после `endpoint`). В класс добавить метод (по образцу `findById`):

```ts
  findByThreadId(threadId: string): Webhook | undefined {
    const row = this.db
      .select()
      .from(webhooksTable)
      .where(eq(webhooksTable.threadId, threadId))
      .get();
    return row ? toWebhook(row) : undefined;
  }
```

- [ ] **Step 5: thread.port.ts и shared/thread.ts — kind**

`domain/thread.port.ts:1`:

```ts
export type ThreadKind = 'chat' | 'schedule' | 'webhook';
```

`shared/thread.ts:5`:

```ts
export const THREAD_KINDS = ['chat', 'schedule', 'webhook'] as const;
```

- [ ] **Step 6: delete-thread.use-case.ts — каскад вебхука**

`DeleteThreadDeps` дополнить `webhooks?: WebhookRepository;` (импорт из `../../domain/webhook.port.ts`). В `execute`:

- guard расширить:

```ts
    if (thread.kind === 'schedule' || thread.kind === 'webhook') {
      throw new ConflictError('trigger thread belongs to its trigger');
    }
```

- после блока `if (bound) { this.deps.schedules?.delete(bound.id); }` добавить:

```ts
    const boundWebhook = this.deps.webhooks?.findByThreadId(request.id);
    if (boundWebhook) {
      this.deps.webhooks?.delete(boundWebhook.id);
    }
```

- [ ] **Step 7: shared/types.ts — контракт вебхука**

Рядом с `CreateScheduleResponse` (строки 201–204) добавить:

```ts
export type WebhookRecord = {
  id: string;
  workspaceId: string;
  name: string;
  status: ScheduleStatus;
  targetAgentId: string;
  detail: string;
  endpoint: string;
  threadId: string;
  lastFiredAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateWebhookResponse = {
  webhook: WebhookRecord;
  thread: ThreadRecordType;
};
```

`DeskEvent` (строки 302–306) дополнить двумя вариантами:

```ts
  | { type: 'webhook'; webhook: WebhookRecord }
  | { type: 'webhook-deleted'; id: string }
```

- [ ] **Step 8: проверка и коммит**

`bunx biome check apps/studio/server`. Если линт ругается на неиспользуемый `findByThreadId` — это нормально (потребуется в Task 2), при необходимости добавить временный экспорт уже есть (метод публичный в классе, линт не ругается на методы).

Попросить хозяина перезапустить API-сервер и проверить миграцию: старая база должна открыться без ошибок, `sqlite3 ~/.harnesys/studio.db ".schema threads"` содержит `'webhook'`.

```bash
git add apps/studio/server apps/studio/shared
git commit -m "feat(studio): webhook thread binding — schema and domain"
```

---

### Task 2: Сервер — use-cases и контроллер вебхуков

**Files:**
- Create: `apps/studio/shared/webhook-prompt.ts`
- Create: `apps/studio/server/application/webhooks/bind-webhook-thread.ts`
- Modify: `apps/studio/server/application/webhooks/create-webhook.use-case.ts`
- Modify: `apps/studio/server/application/webhooks/update-webhook.use-case.ts`
- Modify: `apps/studio/server/application/webhooks/delete-webhook.use-case.ts`
- Create: `apps/studio/server/application/webhooks/fire-webhook.use-case.ts`
- Create: `apps/studio/server/adapters/http/webhook/webhook.controller.ts`
- Create: `apps/studio/server/adapters/http/webhook/webhook.body.ts`
- Create: `apps/studio/server/composition/wire-webhooks.ts`
- Modify: `apps/studio/server/composition/studio.ts`

**Interfaces:**
- Consumes: Task 1 (`threadId` в домене, `findByThreadId`).
- Produces: HTTP `GET/POST /api/workspaces/:id/webhooks`, `PATCH/DELETE /api/workspaces/:id/webhooks/:webhookId`, `POST /api/workspaces/:id/hooks/:webhookId` (запуск, 202). `CreateWebhookResponse` на create. DeskEvents `{type:'webhook'}`, `{type:'webhook-deleted'}`, `{type:'thread'}`.

- [ ] **Step 1: shared/webhook-prompt.ts**

По образцу `shared/schedule-prompt.ts` (там `SCHEDULE_HUMAN_ORIGIN` и `scheduledTaskText`):

```ts
export const WEBHOOK_HUMAN_ORIGIN = 'webhook';

export function webhookTaskText(name: string, payload?: string): string {
  const head = `[webhook:${name}]`;
  return payload?.trim() ? `${head} ${payload.trim()}` : `${head} triggered`;
}
```

- [ ] **Step 2: bind-webhook-thread.ts**

Зеркало `application/schedules/bind-schedule-thread.ts` (32 строки, читать рядом), занятость проверяется по вебхукам:

```ts
import { ValidationError } from '../../domain/studio.error.ts';
import type { Thread, ThreadRepository } from '../../domain/thread.port.ts';
import type { WebhookRepository } from '../../domain/webhook.port.ts';

export type BindWebhookThreadInput = {
  threads: ThreadRepository;
  webhooks: WebhookRepository;
  workspaceId: string;
  agentId: string;
  threadId: string;
  exceptWebhookId?: string;
};

/** Existing chat (or other) thread this webhook will fire into. */
export function requireBindableWebhookThread(input: BindWebhookThreadInput): Thread {
  const threadId = input.threadId.trim();
  if (!threadId) {
    throw new ValidationError('threadId cannot be empty');
  }
  const thread = input.threads.findById(threadId);
  if (!thread || thread.workspaceId !== input.workspaceId) {
    throw new ValidationError('thread not found');
  }
  if (thread.agentId !== input.agentId) {
    throw new ValidationError('thread belongs to another agent');
  }
  const occupied = input.webhooks.findByThreadId(thread.id);
  if (occupied && occupied.id !== input.exceptWebhookId) {
    throw new ValidationError('thread already has a webhook');
  }
  return thread;
}
```

- [ ] **Step 3: create-webhook.use-case.ts — переписать**

Образец: `application/schedules/create-schedule.use-case.ts` (транзакция, `threads.insert`, deskEvents, `CreateScheduleResponse`). Новый файл целиком:

```ts
import type { StudioDb } from '../../adapters/store/sqlite/connection.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WebhookRepository } from '../../domain/webhook.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { CreateWebhookResponse } from '../../../shared/types.ts';
import { GetThreadInput } from '../threads/get-thread.use-case.ts';
import { requireBindableWebhookThread } from './bind-webhook-thread.ts';
import { toWebhookRecord, type WebhookRecord } from './webhook-record.ts';

export type CreateWebhookRequest = {
  workspaceId: string;
  name: string;
  targetAgentId: string;
  detail?: string;
  threadId?: string;
};

export type CreateWebhookInput = {
  execute(request: CreateWebhookRequest): Promise<CreateWebhookResponse>;
};

export class CreateWebhookUseCase implements CreateWebhookInput {
  constructor(
    private readonly webhooks: WebhookRepository,
    private readonly threads: ThreadRepository,
    private readonly agents: AgentRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly deskEvents: DeskEventsPort,
    private readonly getThread: GetThreadInput,
    private readonly db?: StudioDb,
  ) {}

  async execute(request: CreateWebhookRequest): Promise<CreateWebhookResponse> {
    const name = request.name?.trim();
    if (!name) {
      throw new ValidationError('webhook name is required');
    }
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    const agent = this.agents.findById(request.targetAgentId);
    if (!agent || agent.workspaceId !== request.workspaceId) {
      throw new ValidationError('agent not found');
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const boundThread = request.threadId
      ? requireBindableWebhookThread({
          threads: this.threads,
          webhooks: this.webhooks,
          workspaceId: request.workspaceId,
          agentId: agent.id,
          threadId: request.threadId,
        })
      : null;
    const threadId = boundThread?.id ?? crypto.randomUUID();
    const dedicated = boundThread === null;

    const perform = (): WebhookRecord => {
      if (dedicated) {
        this.threads.insert({
          id: threadId,
          workspaceId: request.workspaceId,
          agentId: agent.id,
          title: name,
          kind: 'webhook',
          metadata: {},
          createdAt: now,
          updatedAt: now,
          lastReadAt: now,
        });
      }
      const webhook = this.webhooks.insert({
        id,
        workspaceId: request.workspaceId,
        name,
        status: 'active',
        targetAgentId: agent.id,
        detail: request.detail?.trim() || '',
        endpoint: `/api/workspaces/${request.workspaceId}/hooks/${id}`,
        threadId,
        lastFiredAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return toWebhookRecord(webhook);
    };

    const record = this.db ? this.db.transaction(perform) : perform();

    this.deskEvents.emit(request.workspaceId, { type: 'webhook', webhook: record });
    if (dedicated) {
      const thread = await this.getThread.execute({ id: threadId });
      this.deskEvents.emit(request.workspaceId, { type: 'thread', thread });
    }
    const thread = await this.getThread.execute({ id: threadId });
    return { webhook: record, thread };
  }
}
```

Замечания: тип `DeskEventsPort.emit` проверить по `domain/desk-events.port.ts`; если метод асинхронный — `void`. `webhook-record.ts` обновить: `WebhookRecord` переезжает в `shared/types.ts`, из `webhook-record.ts` реэкспортировать `export type { WebhookRecord } from '../../../shared/types.ts';` и добавить `threadId: webhook.threadId` в `toWebhookRecord`.

- [ ] **Step 4: update-webhook.use-case.ts — rebind треда**

В `UpdateWebhookRequest` добавить `threadId?: string`. В `execute` после валидации агента добавить ветку:

```ts
    if (request.threadId !== undefined && request.threadId !== current.threadId) {
      requireBindableWebhookThread({
        threads: this.threads,
        webhooks: this.webhooks,
        workspaceId: request.workspaceId,
        agentId: request.targetAgentId ?? current.targetAgentId,
        threadId: request.threadId,
        exceptWebhookId: current.id,
      });
      patch.threadId = request.threadId;
    }
```

`WebhookPatch` в домене дополнить `threadId: string;`. Конструктор use-case получает `threads: ThreadRepository` (пробросить в wire-webhooks). В конце после `update` — `this.deskEvents.emit(request.workspaceId, { type: 'webhook', webhook: toWebhookRecord(updated) });` (существующее поле deskEvents добавить в конструктор).

- [ ] **Step 5: delete-webhook.use-case.ts — удалить связный тред**

Deps: `webhooks`, `threads: ThreadRepository`, `workspaces`, `deskEvents`. Логика: найти вебхук, если его тред `kind === 'webhook'` — удалить тред (аттачменты треда не трогаем: у триггерных тредов вложений нет; если `attachments.listByThread` непуст — удалить через FS как в delete-thread, скопировать 5 строк оттуда), затем `webhooks.delete`, emit `{type:'webhook-deleted', id}`.

- [ ] **Step 6: fire-webhook.use-case.ts**

Зеркало `fire-due-schedules.use-case.ts` (`tryFire`), упрощённое — без cron:

```ts
import type { RunLifecycleStore } from 'harnesys';
import { WEBHOOK_HUMAN_ORIGIN, webhookTaskText } from '../../../shared/webhook-prompt.ts';
import type { ScheduleFireQueue } from '../../adapters/schedule-fire-queue.adapter.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WebhookRepository } from '../../domain/webhook.port.ts';
import { notifyIdleIfFree } from '../schedules/fire-due-schedules.use-case.ts';
import { publishDeskThread } from '../threads/publish-desk-thread.ts';
import type { GetThreadInput } from '../threads/get-thread.use-case.ts';
import type { SendThreadRunInput } from '../threads/send-thread-run.use-case.ts';
import { toWebhookRecord } from './webhook-record.ts';

export type FireWebhookInput = {
  execute(request: { webhookId: string; text?: string }): Promise<{ runId: string } | null>;
};

export class FireWebhookUseCase implements FireWebhookInput {
  constructor(
    private readonly webhooks: WebhookRepository,
    private readonly threads: ThreadRepository,
    private readonly sendThreadRun: SendThreadRunInput,
    private readonly lifecycle: RunLifecycleStore,
    private readonly queue: ScheduleFireQueue,
    private readonly deskEvents: DeskEventsPort,
    private readonly getThread: GetThreadInput,
  ) {}

  async execute(request: { webhookId: string; text?: string }) {
    const webhook = this.webhooks.findById(request.webhookId);
    if (!webhook) {
      throw new NotFoundError('webhook not found');
    }
    if (webhook.status !== 'active') {
      return null;
    }
    if (await this.lifecycle.activeByThread(webhook.threadId)) {
      this.queue.enqueue(webhook.threadId, webhook.id);
      return null;
    }
    const now = new Date().toISOString();
    const updated = this.webhooks.update(webhook.id, { lastFiredAt: now, updatedAt: now });
    this.deskEvents.emit(webhook.workspaceId, { type: 'webhook', webhook: toWebhookRecord(updated) });
    try {
      const accepted = await this.sendThreadRun.execute({
        threadId: webhook.threadId,
        text: webhookTaskText(webhook.name, request.text ?? webhook.detail),
        mode: 'ask',
        origin: WEBHOOK_HUMAN_ORIGIN,
      });
      this.threads.touch(webhook.threadId);
      publishDeskThread(this.getThread, this.deskEvents, webhook.threadId);
      return accepted;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'fire failed';
      if (
        error instanceof NotFoundError ||
        (error instanceof ValidationError && error.message === 'agent has no model')
      ) {
        this.webhooks.update(webhook.id, { status: 'failed', updatedAt: now });
        this.deskEvents.emit(webhook.workspaceId, {
          type: 'webhook',
          webhook: toWebhookRecord(this.webhooks.findById(webhook.id) ?? updated),
        });
      }
      throw new ValidationError(`webhook fire failed: ${message}`);
    }
  }
}
```

`notifyIdleIfFree` уже экспортируется из fire-due-schedules; импорт здесь не нужен — убрать из импортов.

- [ ] **Step 7: контроллер и body**

`adapters/http/webhook/webhook.body.ts`:

```ts
import { z } from 'zod';

import { SCHEDULE_STATUSES } from '../../../../shared/types.ts';

export const createWebhookBody = z.object({
  name: z.string().trim().min(1),
  targetAgentId: z.string().uuid(),
  detail: z.string().trim().optional(),
  threadId: z.string().uuid().optional(),
});

export const updateWebhookBody = z.object({
  name: z.string().trim().min(1).optional(),
  status: z.enum(SCHEDULE_STATUSES).optional(),
  targetAgentId: z.string().uuid().optional(),
  detail: z.string().trim().optional(),
  threadId: z.string().uuid().optional(),
});

export const fireWebhookBody = z.object({ text: z.string().trim().optional() }).optional();
```

`webhook.controller.ts` — копия структуры `schedule.controller.ts` (dep-типы `*Input`, register): GET список, POST create → 201 `CreateWebhookResponse`, PATCH update, DELETE → 204, и запуск:

```ts
    app.post('/api/workspaces/:id/hooks/:webhookId', async (c) => {
      const raw = await c.req.json().catch(() => undefined);
      const body = fireWebhookBody.parse(raw);
      const accepted = await this.deps.fireWebhook.execute({
        webhookId: c.req.param('webhookId'),
        text: body?.text,
      });
      return c.json(accepted ?? { status: 'queued-behind-active-run' }, 202);
    });
```

- [ ] **Step 8: wire-webhooks.ts и studio.ts**

`composition/wire-webhooks.ts` (зеркало `wire-schedules.ts`, но без тикера):

```ts
import { WebhookController } from '../adapters/http/webhook/webhook.controller.ts';
import { ScheduleFireQueue } from '../adapters/schedule-fire-queue.adapter.ts';
import { FireWebhookUseCase } from '../application/webhooks/fire-webhook.use-case.ts';
import { CreateWebhookUseCase } from '../application/webhooks/create-webhook.use-case.ts';
import { DeleteWebhookUseCase } from '../application/webhooks/delete-webhook.use-case.ts';
import { ListWebhooksUseCase } from '../application/webhooks/list-webhooks.use-case.ts';
import { UpdateWebhookUseCase } from '../application/webhooks/update-webhook.use-case.ts';
// типы deps как в wire-schedules.ts: app, db, webhooks, threads, agents, workspaces,
// attachments, attachmentsFs, lifecycle, deskEvents, sendThreadRun, getThread

export function wireWebhooks(deps: WireWebhooksDeps): ScheduleFireQueue {
  const queue = new ScheduleFireQueue();
  const fireWebhook = new FireWebhookUseCase({
    webhooks: deps.webhooks,
    threads: deps.threads,
    sendThreadRun: deps.sendThreadRun,
    lifecycle: deps.lifecycle,
    queue,
    deskEvents: deps.deskEvents,
    getThread: deps.getThread,
  });
  queue.setHandler((webhookId) =>
    fireWebhook.execute({ webhookId }).then(() => undefined),
  );
  new WebhookController({
    listWebhooks: new ListWebhooksUseCase(deps.webhooks, deps.workspaces),
    createWebhook: new CreateWebhookUseCase(
      deps.webhooks, deps.threads, deps.agents, deps.workspaces,
      deps.deskEvents, deps.getThread, deps.db,
    ),
    updateWebhook: new UpdateWebhookUseCase(
      deps.webhooks, deps.agents, deps.workspaces, deps.threads, deps.deskEvents,
    ),
    deleteWebhook: new DeleteWebhookUseCase(
      deps.webhooks, deps.threads, deps.workspaces, deps.deskEvents,
    ),
    fireWebhook,
  }).register(deps.app);
  return queue;
}
```

`composition/studio.ts`:

- рядом со `scheduleQueueRef` (строка 100) добавить `const webhookQueueRef: { current: ScheduleFireQueue | null } = { current: null };`
- в `onComplete` (строки 111–117) после существующего блока `if (queue !== null) {...}` добавить:

```ts
      const webhookQueue = webhookQueueRef.current;
      if (webhookQueue !== null) {
        notifyIdleIfFree(runLifecycle, webhookQueue, record.threadId);
      }
```

- после `scheduleQueueRef.current = scheduleQueue;` (строка 204) добавить:

```ts
  const webhookQueue = wireWebhooks({
    app,
    db,
    webhooks: webhookRepo,
    threads: threadRepo,
    agents: agentRepo,
    workspaces: workspaceRepo,
    attachments: attachmentRepo,
    attachmentsFs: attachments,
    lifecycle: runLifecycle,
    deskEvents,
    sendThreadRun: undefined as never,
    getThread: undefined as never,
  });
  webhookQueueRef.current = webhookQueue;
```

`sendThreadRun`/`getThread` в wire-webhooks берутся так же, как wireSchedules их подменяет: заглянуть в `wire-schedules.ts:40-51` — там они переданы как `undefined as never` и, судя по сигнатуре, собираются внутри; если внутри wire-schedules они реально пересобираются из других deps, повторить тот же приём. Если wireSchedules получает их снаружи (studio.ts:200-201 показывает `undefined as never`) — значит внутри есть собственная сборка; скопировать механизм.

- [ ] **Step 9: проверка и коммит**

`bunx biome check apps/studio/server`. Попросить хозяина перезапустить API и прогнать curl:

```bash
curl -s localhost:3000/api/workspaces/<ws>/webhooks
curl -s -X POST localhost:3000/api/workspaces/<ws>/webhooks -H 'content-type: application/json' \
  -d '{"name":"ci","targetAgentId":"<agent>"}'
curl -s -X POST localhost:3000/api/workspaces/<ws>/hooks/<webhookId> -d '{"text":"deploy done"}'
```

Ожидание: create возвращает `{webhook, thread}` с `thread.kind === 'webhook'`; fire кладёт `{runId}` и пользовательское событие появляется в треде (проверить `GET /api/threads/<threadId>`).

```bash
git add apps/studio/server apps/studio/shared
git commit -m "feat(studio): webhook CRUD http + fire into bound thread"
```

---

### Task 3: Клиент — API и стор вебхуков на сервере

**Files:**
- Create: `apps/studio/client/src/shared/api/webhooks.ts`
- Modify: `apps/studio/client/src/shared/api/index.ts`
- Modify: `apps/studio/client/src/entities/webhook/model/webhook.ts`
- Modify: `apps/studio/client/src/entities/webhook/model/webhook.store.ts`
- Modify: `apps/studio/client/src/entities/webhook/index.ts`
- Modify: `apps/studio/client/src/features/desk/model/hydrate-desk.ts`
- Modify: `apps/studio/client/src/features/desk/model/apply-desk-event.ts`

**Interfaces:**
- Consumes: Task 1–2 (HTTP эндпоинты, `WebhookRecord`, `CreateWebhookResponse`, DeskEvent).
- Produces: `Webhook` с `threadId`; `toClientWebhook(record: WebhookRecord): Webhook`; стор `useWebhookStore` (`items` стартует пустым, `replaceWorkspace`, `upsert`, `remove`, `byId`); api `listWebhooks`, `createWebhookRecord`, `updateWebhookRecord`, `deleteWebhookRecord`.

- [ ] **Step 1: shared/api/webhooks.ts**

Зеркало `shared/api/schedules.ts`:

```ts
import type { CreateWebhookResponse, WebhookRecord } from '@studio/shared';

import { apiJson } from './client';

export type CreateWebhookInput = {
  name: string;
  targetAgentId: string;
  detail?: string;
  threadId?: string;
};

export type UpdateWebhookInput = {
  name?: string;
  status?: WebhookRecord['status'];
  targetAgentId?: string;
  detail?: string;
  threadId?: string;
};

export function listWebhooks(workspaceId: string) {
  return apiJson<WebhookRecord[]>(`/api/workspaces/${workspaceId}/webhooks`);
}

export function createWebhookRecord(workspaceId: string, body: CreateWebhookInput) {
  return apiJson<CreateWebhookResponse>(`/api/workspaces/${workspaceId}/webhooks`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateWebhookRecord(workspaceId: string, webhookId: string, body: UpdateWebhookInput) {
  return apiJson<WebhookRecord>(`/api/workspaces/${workspaceId}/webhooks/${webhookId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteWebhookRecord(workspaceId: string, webhookId: string) {
  return apiJson<void>(`/api/workspaces/${workspaceId}/webhooks/${webhookId}`, {
    method: 'DELETE',
  });
}
```

Именованный тип статуса: если линт против `WebhookRecord['status']` — завести `WebhookStatus` в `shared/types.ts` (`export type WebhookStatus = ScheduleStatus;` рядом с `WebhookRecord`) и использовать его.

Добавить экспорт в `shared/api/index.ts`.

- [ ] **Step 2: entities/webhook — тип и стор**

`model/webhook.ts`: `Webhook` получает `threadId: string;` после `endpoint`. Seed-массив `seedWebhooks` удалить целиком. Добавить:

```ts
import type { WebhookRecord } from '@studio/shared';

export function toClientWebhook(record: WebhookRecord): Webhook {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    status: record.status,
    targetAgentId: record.targetAgentId,
    detail: record.detail,
    endpoint: record.endpoint,
    threadId: record.threadId,
    lastFiredAt: record.lastFiredAt ?? undefined,
  };
}
```

`model/webhook.store.ts`: стартовое `items: []`; удалить `create`; добавить `replaceWorkspace(workspaceId, list)` и `upsert(item)` (по образцу `schedule.store.ts` — прочитать соседний `entities/schedule/model/schedule.store.ts` и повторить форму); `remove` остаётся.

`index.ts`: экспортировать `toClientWebhook`, убрать `seedWebhooks`, `WebhookDraft` остаётся (используется модалкой Task 8).

- [ ] **Step 3: hydrate-desk.ts**

В `Promise.all` добавить `listWebhooks(workspaceId)`, после `replaceWorkspace` расписаний — `useWebhookStore.getState().replaceWorkspace(workspaceId, webhooks.map(toClientWebhook));`.

- [ ] **Step 4: apply-desk-event.ts**

Добавить два кейса (зеркало schedule) и расширить `dropOwnedThread`:

```ts
    case 'webhook-deleted': {
      const current = useWebhookStore.getState().byId(event.id);
      useWebhookStore.getState().remove(event.id);
      if (current) {
        dropOwnedTriggerThread(current.threadId);
      }
      return;
    }
    case 'webhook': {
      const previous = useWebhookStore.getState().byId(event.webhook.id);
      if (previous && previous.threadId !== event.webhook.threadId) {
        dropOwnedTriggerThread(previous.threadId);
      }
      useWebhookStore.getState().upsert(toClientWebhook(event.webhook));
      return;
    }
```

`dropOwnedThread` переименовать в `dropOwnedTriggerThread` с условием `if (thread?.kind !== 'schedule' && thread?.kind !== 'webhook') return;` и использовать в обоих кейсах.

- [ ] **Step 5: проверка и коммит**

`bunx biome check apps/studio/client`. Сид-вебхуки из сайдбара исчезнут (стартуем с сервера). Попросить хозяина проверить в браузере: вебхуки из БД видны в сайдбаре после перезагрузки.

```bash
git add apps/studio/client
git commit -m "feat(studio): webhooks from server — api, store, hydration, desk events"
```

---

### Task 4: Лендинг агента

**Files:**
- Create: `apps/studio/client/src/pages/agent-landing/index.ts`
- Create: `apps/studio/client/src/pages/agent-landing/ui/agent-landing-page.tsx`
- Modify: `apps/studio/client/src/app/routes/index.tsx:74`

**Interfaces:**
- Consumes: `useSelectedAgent` (features/desk), `useAgentThreads` (features/desk), `openNewThread` (features/switch-thread), `useIdeStore`, `useStudioNavigation` (старые пути до Task 5).
- Produces: маршрут `/w/:ws/agent/:agentId` рендерит `AgentLandingPage` (Task 5 переключит ссылки на него).

- [ ] **Step 1: страница**

Разметка — как `widgets/threads-list/ui/threads-list.tsx` (прочитать его перед написанием, он умрёт в Task 5 — взять оттуда рендер строки). Каркас:

```tsx
import { useNavigate } from 'react-router';
import { useSelectedAgent, useAgentThreads } from '@/features/desk';
import { openNewThread } from '@/features/switch-thread';
import { useSessionStore } from '@/entities/session';
import { setActiveThreadId } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { studioPath } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/shared/ui/sidebar';
import { WorkspaceSidebar } from '@/widgets/workspace-sidebar';

export function AgentLandingPage() {
  const agent = useSelectedAgent();
  const navigate = useNavigate();
  const threads = [...(agent ? useAgentThreads(agent.id) : [])].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  const openThread = (threadId: string) => {
    if (!agent) return;
    useIdeStore.getState().openThread(agent.workspaceId, agent.id, threadId);
    useDeskStore.getState().setFocusedThreadId(threadId);
    setActiveThreadId(agent.id, threadId);
    void navigate(studioPath.workspaceThread(agent.workspaceId, agent.id, threadId));
  };

  return (
    <SidebarProvider style={{ '--sidebar-width': '15rem' } as React.CSSProperties} className="h-svh overflow-hidden">
      <WorkspaceSidebar />
      <SidebarInset className="min-w-0 bg-background">
        <div className="flex h-11 shrink-0 items-center gap-2 px-3">
          <SidebarTrigger />
        </div>
        {/* шапка: name, role, status; кнопки New thread и Settings */}
        {/* список тредов: title, updatedAt, индикатор активного запуска, клик → openThread */}
      </SidebarInset>
    </SidebarProvider>
  );
}
```

Наполнение шапки и строки треда взять из `threads-list.tsx` (иконка `MessageSquareIcon`/`CalendarClockIcon` по `thread.kind`, статус `unread`, `formatDayTime(thread.updatedAt)` из `@/shared/lib/format-clock`). Кнопка `New thread`:

```tsx
void openNewThread(agent.id, agent.workspaceId).then((threadId) => {
  if (threadId) openThread(threadId);
});
```

`Settings` пока открывает `openEditAgentDialog(agent)` (manage-agent); заменяется на конфиг-модалку в Task 7.

- [ ] **Step 2: маршрут**

`routes/index.tsx:74` — `{ path: 'agent/:agentId', element: <AgentLandingPage /> }` вместо `ChatWorkspace`. Импорт `AgentLandingPage` из `@/pages/agent-landing`.

- [ ] **Step 3: проверка и коммит**

`bunx biome check apps/studio/client`. В браузере (через хозяина): `/w/<ws>/agent/<id>` показывает список тредов, клик открывает чат.

```bash
git add apps/studio/client
git commit -m "feat(studio): agent landing page with threads history"
```

---

### Task 5: Cutover — маршруты `/thread/:id`, `/file/*`, стор `thread | file`

Задача большая, шаги выполняются строго по порядку, в конце репозиторий компилируется.

**Files:**
- Rewrite: `apps/studio/client/src/shared/config/routes.ts`
- Rewrite: `apps/studio/client/src/shared/config/location.ts`
- Rewrite: `apps/studio/client/src/shared/config/navigation.ts`
- Modify: `apps/studio/client/src/shared/config/constants.ts`
- Modify: `apps/studio/client/src/app/routes/index.tsx`
- Modify: `apps/studio/client/src/features/ide/model/ide.store.ts`
- Rewrite: `apps/studio/client/src/features/ide/model/ide-sync.ts`
- Rewrite: `apps/studio/client/src/features/ide/model/open-ide.ts`
- Modify: `apps/studio/client/src/widgets/ide-tabs/ui/tab-meta.tsx`, `ui/ide-tabs.tsx`
- Rewrite: `apps/studio/client/src/widgets/ide-content/ui/ide-content.tsx`
- Rewrite: `apps/studio/client/src/features/desk/ui/desk-sync.tsx`
- Modify: `apps/studio/client/src/features/desk/model/use-desk.ts`
- Modify: `apps/studio/client/src/pages/workspace/ui/workspace-page.tsx`
- Modify: сайдбар: `widgets/workspace-sidebar/ui/workspace-sidebar.tsx`, `schedules-section.tsx`, `webhooks-section.tsx`, `files-section.tsx`; `widgets/agent-inspector/ui/threads-pane.tsx`; `widgets/agent-card/ui/agent-card.tsx`; `features/switch-thread/model/switch-thread.ts`; `widgets/ide-home/ui/ide-home.tsx`
- Move: `widgets/schedules-list/ui/schedule-settings.tsx` + `model/schedule-draft.ts` → `features/manage-schedule/`; `widgets/webhooks-list/ui/webhooks-list.tsx` (компонент `WebhookSettings`) → `features/manage-webhook/ui/webhook-settings.tsx`
- Delete: `pages/workspace/ui/chat-workspace.tsx`, `pages/workspace/ui/chat-frame.tsx`, `pages/workspace/ui/desk-idle.tsx`, `widgets/threads-list/`, `widgets/schedules-list/`, `widgets/webhooks-list/`, `widgets/files-main/`, `widgets/agent-threads/`, `widgets/thread-tabs/`

**Interfaces:**
- Produces: `studioPath.thread(ws, threadId, origin?)`, `studioPath.file(ws, path)`, `studioPath.agent(ws, agentId)`; `StudioLocation { surface: 'home'|'thread'|'file'|'agent'|'settings', threadId, filePath, threadOrigin, originEntityId, ... }`; `useStudioNavigation().openThread(threadId, origin?) / openFile(path) / openAgentLanding(agentId)`; `IdeTabKind = 'thread' | 'file'`; `useSelectedAgent()` вычисляет агента из активного треда.

- [ ] **Step 1: shared/config/routes.ts — новый файл целиком**

```ts
import { SETTINGS_CATEGORIES, type SettingsCategory } from './settings-nav';

export type StudioSurface = 'home' | 'thread' | 'file' | 'agent' | 'settings';

export type ThreadOrigin = 'agent' | 'scheduler' | 'webhook';

export type ThreadOriginRef = { kind: ThreadOrigin; id: string };

export type StudioLocation = {
  workspaceId: string | null;
  surface: StudioSurface;
  threadId: string | null;
  threadOrigin: ThreadOrigin | null;
  originEntityId: string | null;
  agentId: string | null;
  filePath: string | null;
  settingsCategory: SettingsCategory;
  settingsProviderId: string | null;
};

export const STUDIO_THREAD_PATTERN = '/w/:workspaceId/thread/:threadId';
export const STUDIO_FILE_PATTERN = '/w/:workspaceId/file/*';
export const STUDIO_AGENT_PATTERN = '/w/:workspaceId/agent/:agentId';

export const studioPath = {
  gate: '/',
  workspace: (workspaceId: string) => `/w/${workspaceId}`,
  thread: (workspaceId: string, threadId: string, origin?: ThreadOriginRef) => {
    const base = `/w/${workspaceId}/thread/${threadId}`;
    return origin ? `${base}?${origin.kind}=${origin.id}` : base;
  },
  file: (workspaceId: string, path: string) =>
    `/w/${workspaceId}/file${path.startsWith('/') ? path : `/${path}`}`,
  agent: (workspaceId: string, agentId: string) => `/w/${workspaceId}/agent/${agentId}`,
  settings: (workspaceId: string, category?: SettingsCategory, providerId?: string) => {
    if (category === 'providers' && providerId) {
      return `/w/${workspaceId}/settings/providers/${providerId}`;
    }
    if (category && category !== 'profile') {
      return `/w/${workspaceId}/settings/${category}`;
    }
    return `/w/${workspaceId}/settings`;
  },
};

export function parseSettingsCategory(value: string | undefined): SettingsCategory {
  if (value && (SETTINGS_CATEGORIES as readonly string[]).includes(value)) {
    return value as SettingsCategory;
  }
  return 'profile';
}

export function resolveStudioEntry(input: {
  selectedWorkspaceId: string | null;
  hasWorkspace: boolean;
  workspacesStatus: 'pending' | 'error' | 'success';
}): 'desk' | 'opening' | 'gate' {
  if (input.hasWorkspace) {
    return 'desk';
  }
  if (input.selectedWorkspaceId && input.workspacesStatus === 'pending') {
    return 'opening';
  }
  return 'gate';
}
```

- [ ] **Step 2: location.ts — новый файл целиком**

```ts
import { useMatch, useParams, useSearchParams } from 'react-router';

import { parseSettingsCategory, type StudioLocation, type StudioSurface, type ThreadOrigin } from './routes';

export function useStudioLocation(): StudioLocation {
  const params = useParams();
  const [search] = useSearchParams();
  const settingsWithProvider = useMatch('/w/:workspaceId/settings/:category/:providerId');
  const settingsFallback = useMatch('/w/:workspaceId/settings/:category?');
  const thread = useMatch('/w/:workspaceId/thread/:threadId');
  const file = useMatch('/w/:workspaceId/file/*');
  const agent = useMatch('/w/:workspaceId/agent/:agentId');
  const settings = settingsWithProvider ?? settingsFallback;

  let surface: StudioSurface = 'home';
  if (settings) {
    surface = 'settings';
  } else if (thread) {
    surface = 'thread';
  } else if (file) {
    surface = 'file';
  } else if (agent) {
    surface = 'agent';
  }

  let threadOrigin: ThreadOrigin | null = null;
  let originEntityId: string | null = null;
  for (const key of ['agent', 'scheduler', 'webhook'] as const) {
    const value = search.get(key);
    if (value) {
      threadOrigin = key;
      originEntityId = value;
      break;
    }
  }

  const settingsCategory: StudioLocation['settingsCategory'] = parseSettingsCategory(
    settings?.params.category ?? params.category,
  );

  return {
    workspaceId: params.workspaceId ?? null,
    surface,
    threadId: thread?.params.threadId ?? null,
    threadOrigin,
    originEntityId,
    agentId: agent?.params.agentId ?? null,
    filePath: file?.params['*'] ? `/${file.params['*']}` : null,
    settingsCategory,
    settingsProviderId:
      settingsCategory === 'providers' ? (settingsWithProvider?.params.providerId ?? null) : null,
  };
}
```

- [ ] **Step 3: navigation.ts — новый файл целиком**

```ts
import { useNavigate, useParams } from 'react-router';

import { studioPath, type ThreadOriginRef } from './routes';
import type { SettingsCategory } from './settings-nav';

export function useStudioNavigation() {
  const navigate = useNavigate();
  const workspaceId = useParams().workspaceId ?? null;

  return {
    openWorkspace(id: string) {
      void navigate(studioPath.workspace(id));
    },
    leaveWorkspace() {
      void navigate(studioPath.gate);
    },
    openThread(threadId: string, origin?: ThreadOriginRef, id: string | null = workspaceId) {
      if (id) {
        void navigate(studioPath.thread(id, threadId, origin));
      }
    },
    openFile(path: string, id: string | null = workspaceId) {
      if (id) {
        void navigate(studioPath.file(id, path));
      }
    },
    openAgentLanding(agentId: string, id: string | null = workspaceId) {
      if (id) {
        void navigate(studioPath.agent(id, agentId));
      }
    },
    openSettings(
      category?: SettingsCategory,
      id: string | null = workspaceId,
      providerId?: string,
      replace = false,
    ) {
      if (id) {
        void navigate(studioPath.settings(id, category, providerId), { replace });
      }
    },
  };
}
```

- [ ] **Step 4: constants.ts**

Добавить: `export const SIDEBAR_ACCORDION_STORAGE_KEY = 'harnesys.sidebar-accordion';` (используется Task 9).

- [ ] **Step 5: routes/index.tsx — новая таблица**

Дети `WorkspacePage` внутри `WorkspaceGuard`:

```tsx
          {
            element: <WorkspacePage />,
            children: [
              { index: true, element: null },
              { path: 'thread/:threadId', element: null },
              { path: 'file/*', element: null },
            ],
          },
          { path: 'agent/:agentId', element: <AgentLandingPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'settings/:category', element: <SettingsPage /> },
          { path: 'settings/:category/:providerId', element: <SettingsPage /> },
```

Импорты `ChatWorkspace`, `ThreadsList`, `SchedulesList`, `WebhooksList`, `FilesMain` удалить.

- [ ] **Step 6: ide.store.ts — kinds и миграция персиста**

- `IdeTabKind = 'thread' | 'file';`
- `IdeTab`: удалить `scheduleId?`, `webhookId?`.
- Удалить экшены `openSchedule`, `openWebhook` и их реализации.
- `loadPersisted` прогоняет каждое `ws` через санитайзер (добавить функцию в файл):

```ts
function sanitizeWorkspace(ws: IdeWorkspaceState): IdeWorkspaceState | null {
  const alive = new Set(ws.tabs.filter((t) => t.kind === 'thread' || t.kind === 'file').map((t) => t.id));
  if (alive.size === ws.tabs.length && ws.groups.every((g) => g.tabIds.every((id) => alive.has(id)))) {
    return ws;
  }
  let layout = ws.layout;
  const groups = [];
  for (const group of ws.groups) {
    const tabIds = group.tabIds.filter((id) => alive.has(id));
    if (tabIds.length === 0) {
      if (layout) {
        layout = collapseLayoutForGroups(layout, group.id);
      }
      continue;
    }
    groups.push({
      ...group,
      tabIds,
      activeId: group.activeId && alive.has(group.activeId) ? group.activeId : (tabIds[tabIds.length - 1] ?? null),
    });
  }
  const tabs = ws.tabs.filter((t) => alive.has(t.id));
  if (groups.length === 0) {
    return null;
  }
  const activeId = ws.activeId && alive.has(ws.activeId) ? ws.activeId : null;
  const activeGroupId =
    ws.activeGroupId && groups.some((g) => g.id === ws.activeGroupId) ? ws.activeGroupId : groups[0]?.id ?? null;
  return { tabs, activeId, activeGroupId, groups, layout };
}

function collapseLayoutForGroups(
  node: import('./ide-tree').IdeSplitNode,
  groupId: string,
): import('./ide-tree').IdeSplitNode | null {
  return collapseLayout(node, groupId);
}
```

`collapseLayout` импортировать из `./ide-layout` (реэкспорт уже есть). В `loadPersisted` цикл: `const sanitized = sanitizeWorkspace(ws as IdeWorkspaceState); if (sanitized) valid[id] = sanitized;`.

- [ ] **Step 7: ide-sync.ts — новый файл целиком**

```ts
import { useEffect } from 'react';
import { setActiveThreadId, useThreadStore } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import { useStudioLocation } from '@/shared/config/location';
import { useIdeStore } from './ide.store';

export function useIdeSync() {
  const { workspaceId, threadId, filePath } = useStudioLocation();

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    if (threadId) {
      const thread = useThreadStore.getState().byId(threadId);
      if (thread) {
        useIdeStore.getState().openThread(workspaceId, thread.agentId, threadId);
        useDeskStore.getState().setFocusedThreadId(threadId);
        setActiveThreadId(thread.agentId, threadId);
      }
    }
    if (filePath) {
      useIdeStore.getState().openFile(workspaceId, filePath);
    }
  }, [workspaceId, threadId, filePath]);
}
```

- [ ] **Step 8: open-ide.ts — новый файл целиком**

```ts
import { useNavigate } from 'react-router';

import { studioPath } from '@/shared/config/routes';

import type { IdeTab } from './ide.store';

export function useOpenIdeTab() {
  const navigate = useNavigate();
  return (workspaceId: string, tab: IdeTab) => {
    if (tab.kind === 'thread' && tab.threadId) {
      navigate(studioPath.thread(workspaceId, tab.threadId));
      return;
    }
    if (tab.kind === 'file' && tab.path) {
      navigate(studioPath.file(workspaceId, tab.path));
    }
  };
}
```

Сигнатуру прежних экспортов (`openThreadTab` и соседние — читать текущий файл перед заменой) заменить одним хуком; потребителей поправить (grep `open-ide`).

- [ ] **Step 9: tab-meta.tsx и ide-tabs.tsx**

`tab-meta.tsx`: удалить ветки `schedule`/`webhook` из `TabIcon` и `tabLabel`; иконку треда брать из стора тредов:

```tsx
export function TabIcon({ tab }: { tab: { kind: string; path?: string; threadId?: string } }) {
  if (tab.kind === 'file' && tab.path) {
    return <FileTypeIcon name={tab.path} className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'thread' && tab.threadId) {
    const kind = useThreadStore.getState().byId(tab.threadId)?.kind ?? 'chat';
    if (kind === 'schedule') return <CalendarClockIcon className="size-3.5 shrink-0 opacity-70" />;
    if (kind === 'webhook') return <EarthIcon className="size-3.5 shrink-0 opacity-70" />;
    return <MessageSquareIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  return <FileIcon className="size-3.5 shrink-0 opacity-70" />;
}
```

`tabLabel`: для треда — `byId(threadId)?.title || 'Thread'` (ветки schedule/webhook/agent-фолбэк удалить).

`ide-tabs.tsx` `handleSelect` (строки 250–269):

```tsx
function handleSelect(tab: (typeof tabs)[number]) {
  useIdeStore.getState().setActive(workspaceId, tab.id);
  if (tab.kind === 'thread' && tab.threadId) {
    const thread = useThreadStore.getState().byId(tab.threadId);
    useDeskStore.getState().setFocusedThreadId(tab.threadId);
    if (thread) {
      setActiveThreadId(thread.agentId, tab.threadId);
    }
    void navigate(studioPath.thread(workspaceId, tab.threadId));
    return;
  }
  if (tab.kind === 'file' && tab.path) {
    void navigate(studioPath.file(workspaceId, tab.path));
  }
}
```

- [ ] **Step 10: ide-content.tsx — только thread и file**

Новый файл (структура та же, WebhookDetail и schedule/webhook ветки удалены):

```tsx
import { useAgentStore } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import { HitlPrompt } from '@/features/send-message';
import { openFileKind } from '@/features/open-file';
import { ChatComposer } from '@/widgets/chat-composer';
import { ThreadPanel } from '@/widgets/chat-transcript';
import { MediaPreview } from '@/widgets/file-pane';
import { TextEditor } from '@/widgets/file-pane';
import type { IdeTab } from '@/features/ide';

export function IdeTabContent({ tab, workspaceId }: { tab: IdeTab; workspaceId: string }) {
  const hydratedWorkspaceId = useDeskStore((state) => state.hydratedWorkspaceId);
  const isHydrating = Boolean(workspaceId && hydratedWorkspaceId !== workspaceId);

  if (tab.kind === 'thread' && tab.threadId) {
    const thread = useThreadStore.getState().byId(tab.threadId);
    const agent = useAgentStore.getState().items.find((a) => a.id === thread?.agentId) ?? null;
    if (!thread || !agent || isHydrating) {
      return (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm" data-testid="ide-thread-loading">
          {isHydrating ? 'Loading…' : 'Thread not found'}
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-thread">
        <div className="min-h-0 flex-1">
          <ThreadPanel threadId={thread.id} agent={agent} />
        </div>
        <HitlPrompt />
        {thread.kind === 'chat' ? <ChatComposer /> : null}
      </div>
    );
  }
  if (tab.kind === 'file' && tab.path) {
    const kind = openFileKind(tab.path);
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-file">
        {kind === 'text' ? (
          <TextEditor workspaceId={workspaceId} path={tab.path} dirty={Boolean(tab.dirty)} />
        ) : null}
        {kind === 'image' || kind === 'pdf' ? (
          <MediaPreview workspaceId={workspaceId} path={tab.path} kind={kind} />
        ) : null}
        {kind === 'unsupported' ? (
          <div className="flex flex-1 items-center justify-center px-4 text-muted-foreground text-sm">
            Preview is not available
          </div>
        ) : null}
      </div>
    );
  }
  return null;
}
```

Композер скрыт у `schedule`/`webhook` тредов уже здесь (полный журнал — Task 10). Импорты выровнять по фактическим путям (`MediaPreview`/`TextEditor` из `@/widgets/file-pane`).

- [ ] **Step 11: desk-sync.tsx — новый файл целиком**

```tsx
import { useEffect, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router';

import { useThreadStore, setActiveThreadId, clearActiveThreadId } from '@/entities/thread';
import { useWorkspaces } from '@/entities/workspace';
import { watchDesk } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';

import { applyDeskEvent } from '../model/apply-desk-event';
import { useDeskStore } from '../model/desk.store';
import { hydrateDesk } from '../model/hydrate-desk';

export function DeskSync() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { surface, threadId, agentId } = useStudioLocation();
  const workspacesQuery = useWorkspaces();
  const hydratedWorkspaceId = useDeskStore((state) => state.hydratedWorkspaceId);

  useLayoutEffect(() => {
    if (!workspaceId) {
      return;
    }
    useDeskStore.getState().setHydratedWorkspaceId(null);
    void hydrateDesk(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    return watchDesk(workspaceId, applyDeskEvent);
  }, [workspaceId]);

  useEffect(() => {
    if (
      !workspaceId ||
      workspacesQuery.status === 'pending' ||
      hydratedWorkspaceId !== workspaceId
    ) {
      return;
    }
    const hasWorkspace = workspacesQuery.data?.some((item) => item.id === workspaceId) ?? false;
    if (!hasWorkspace) {
      return;
    }
    const threads = useThreadStore
      .getState()
      .items.filter((item) => item.workspaceId === workspaceId);

    if (surface === 'thread' && threadId) {
      const thread = threads.find((item) => item.id === threadId);
      if (!thread) {
        void navigate(studioPath.workspace(workspaceId), { replace: true });
        return;
      }
      setActiveThreadId(thread.agentId, threadId);
      useDeskStore.getState().setFocusedThreadId(threadId);
      return;
    }
    if (surface === 'agent' && agentId) {
      const agentThreads = threads.filter((item) => item.agentId === agentId);
      if (agentThreads.length === 0) {
        void navigate(studioPath.workspace(workspaceId), { replace: true });
        return;
      }
    }
  }, [
    workspaceId,
    surface,
    threadId,
    agentId,
    hydratedWorkspaceId,
    workspacesQuery.status,
    workspacesQuery.data,
    navigate,
  ]);

  return null;
}
```

`clearActiveThreadId` импорт удалить, если не используется (линт подскажет).

- [ ] **Step 12: use-desk.ts — агент из треда**

`useSelectedAgent` заменить:

```ts
export function useSelectedAgent() {
  const { workspaceId, threadId, surface, agentId } = useStudioLocation();
  const agents = useWorkspaceAgents(workspaceId);
  const thread = useThreadStore(
    useShallow((state) => (threadId ? (state.byId(threadId) ?? null) : null)),
  );
  if (surface === 'agent' && agentId) {
    return agents.find((item) => item.id === agentId) ?? null;
  }
  if (thread) {
    return agents.find((item) => item.id === thread.agentId) ?? null;
  }
  return null;
}
```

`useSelectedThread`:

```ts
export function useSelectedThread() {
  const { threadId } = useStudioLocation();
  const focusedThreadId = useDeskStore((state) => state.focusedThreadId);
  const preferredId = threadId ?? focusedThreadId;
  if (!preferredId) {
    return null;
  }
  return useThreadStore(
    useShallow((state) => state.byId(preferredId) ?? null),
  );
}
```

Удалить `useSelectedSchedule`, `useSelectedWebhook`, `useSelectSchedule`, `useSelectWebhook`, `useSelectThread` (потребители правятся в шаге 13; grep `features/desk` по этим именам до удаления). `useDesk` — убрать поля `schedule`, `webhook`.

- [ ] **Step 13: клики в сайдбаре и виджетах**

- `workspace-sidebar.tsx`: клик карточки агента — как было (active/latest/create), но `navigate(studioPath.thread(workspaceId, target.id, { kind: 'agent', id: item.id }))`; создание нового треда — после `openThread` `navigate(studioPath.thread(workspaceId, thread.id, { kind: 'agent', id: item.id }))`. Cоздание агента из шапки (строки 176–183): `navigate(studioPath.thread(workspaceId, result.thread.id, { kind: 'agent', id: result.agent.id }))`. Удалить `useSelectedSchedule/useSelectedWebhook/useSelectSchedule/useSelectWebhook` импорты и пропсы `selectedScheduleId/selectedWebhookId/onOpen` у секций (секции правятся здесь же). `surface === 'chat'` заменить на `surface === 'thread'` (или подсветку взять из `activeTab` — оставить пока `surface`).
- `schedules-section.tsx`: `onSelect` без вилки waiting: `useIdeStore.getState().openThread(workspaceId, item.targetAgentId, item.threadId); navigate(studioPath.thread(workspaceId, item.threadId, { kind: 'scheduler', id: item.id })); onSelectDone();`. `onDelete`: `closeByEntity(workspaceId, 'thread', item.threadId)` вместо `'schedule'`. `onHeaderClick` убрать (пока `undefined`).
- `webhooks-section.tsx`: клик: `openThread(workspaceId, webhooks агент?)` — агент вебхука: `useAgentStore` не импортирован; проще `useThreadStore.getState().byId(item.threadId)?.agentId` → `openThread(workspaceId, agentId ?? item.targetAgentId, item.threadId)`; `navigate(studioPath.thread(workspaceId, item.threadId, { kind: 'webhook', id: item.id }))`. Создание: `createWebhook` из Task 3 возвращает `{webhook, thread}` — поправить `features/manage-webhook/model/create-webhook.ts` сейчас же: серверный вызов `createWebhookRecord` + `useWebhookStore.upsert(toClientWebhook(created.webhook))` + `useThreadStore.upsert(toClientThread(created.thread))` + `useSessionStore.replaceEvents` если kind !== 'chat' (зеркало `manage-schedule/model/create-schedule.ts`), вернуть `created.webhook`. В секции после create: `navigate(studioPath.thread(workspaceId, created.threadId, { kind: 'webhook', id: created.id }))`. `onDelete`: api `deleteWebhookRecord` + store remove + `closeByEntity('thread', item.threadId)`.
- `files-section.tsx`: `handleOpen` (строки 212–218): `openWorkspaceFile` оставить, `useIdeStore.getState().openFile(workspaceId, path)`, `useStudioNavigation().openFile(path)`. Заголовок: `onHeaderClick` убрать. Название секции `Files` оставить (переименование в Explorer — Task 9).
- `threads-pane.tsx` (инспектор): `navigate(studioPath.thread(agent.workspaceId, thread.id))` в двух местах (строки 46, 71).
- `agent-card.tsx` New thread (строка 124): `navigate(studioPath.thread(agent.workspaceId, threadId, { kind: 'agent', id: agent.id }))`.
- `switch-thread.ts`: заменить `studioPath.workspaceThread(...)` на `studioPath.thread(workspaceId, threadId)`.
- `ide-home.tsx`: строка 60 → `studioPath.thread(workspaceId, result.thread.id, { kind: 'agent', id: result.agent.id })`; 77 → `studioPath.thread(workspaceId, schedule.threadId, { kind: 'scheduler', id: schedule.id })`; 94 → `studioPath.thread(workspaceId, created.webhook.threadId, { kind: 'webhook', id: created.webhook.id })` (create уже серверный); 122 → `useStudioNavigation().openFile(path)` (недавние файлы; проверить фактический аргумент по коду ide-home).

- [ ] **Step 14: workspace-page.tsx — инспектор по типу таба**

```tsx
  const showInspector = inspectorOpen && (activeTab?.kind === 'thread' || activeTab?.kind === 'file');
```

Рендер инспектора: `isFileTab && activeTab?.path && workspaceId ? <FileInspector .../> : <AgentInspector width={inspectorWidth} />` — как сейчас, но условие открытия уже не зависит от `agent` (импорт `useSelectedAgent` удалить). AgentInspector получает агента через `useSelectedAgent` (уже из треда).

- [ ] **Step 15: перенос форм и снос страниц**

- `git mv apps/studio/client/src/widgets/schedules-list/ui/schedule-settings.tsx apps/studio/client/src/features/manage-schedule/ui/schedule-settings.tsx`
- `git mv apps/studio/client/src/widgets/schedules-list/model/schedule-draft.ts apps/studio/client/src/features/manage-schedule/model/schedule-draft.ts` (если файл лежит в model — проверить фактическое расположение)
- `git mv` `WebhookSettings` из `widgets/webhooks-list/ui/webhooks-list.tsx` в `features/manage-webhook/ui/webhook-settings.tsx` (вырезать компонент и хелперы `draftFrom`/`isDirty`, импорты поправить: `useWebhookStore` остаётся, save переключить на `updateWebhookRecord` api).
- Правка экспортов: `features/manage-schedule/index.ts` += `export { ScheduleSettings } from './ui/schedule-settings';` (+ `schedule-draft` типы); `features/manage-webhook/index.ts` += `export { WebhookSettings } from './ui/webhook-settings';`.
- Удалить: `pages/workspace/ui/chat-workspace.tsx`, `chat-frame.tsx`, `desk-idle.tsx` (grep потребителей перед удалением), `widgets/threads-list/`, `widgets/schedules-list/`, `widgets/webhooks-list/`, `widgets/files-main/`, `widgets/agent-threads/`, `widgets/thread-tabs/`. Проверить `pages/workspace/index.ts` на экспорт `ChatWorkspace` и почистить.

- [ ] **Step 16: проверка и коммит**

`bunx biome check apps/studio/client`. Хозяин проверяет в браузере: прямой вход по `/w/<ws>/thread/<id>` открывает таб; `?scheduler=` подсвечивает строку (подсветка появится в Task 9 — пока только отсутствие ошибок); открытие файла из дерева меняет URL на `/file/...`; тред планировщика открыт без композера; лендинг доступен; старые URL редиректят на gate.

```bash
git add apps/studio/client
git commit -m "feat(studio): url-driven ide — /thread/:id, /file/*, tabs thread|file"
```

---

### Task 6: Инспектор Inspector / Memory

**Files:**
- Modify: `apps/studio/client/src/features/desk/model/desk.store.ts:3`
- Modify: `apps/studio/client/src/widgets/agent-inspector/ui/agent-inspector.tsx`
- Modify: `apps/studio/client/src/widgets/agent-inspector/ui/inspector-pane.tsx`
- Create: `apps/studio/client/src/widgets/agent-inspector/ui/memory-pane.tsx`
- Move: `config-pane.tsx`, `config-model-section.tsx`, `mcp-config.tsx`, `skills-config.tsx`, `tools-config.tsx` → `features/manage-agent/ui/`
- Delete: `widgets/agent-inspector/ui/threads-pane.tsx`

**Interfaces:**
- Produces: `InspectorTab = 'inspector' | 'memory'`; `AgentInspector` с двумя вкладками; конфиг-компоненты (`SkillsConfig`, `ToolsConfig`, `McpConfig`, `AgentCompactionFields`, `AgentMemoryFields` уже в manage-agent) доступны для модалки Task 7.

- [ ] **Step 1: desk.store.ts** — `export type InspectorTab = 'inspector' | 'memory';`

- [ ] **Step 2: memory-pane.tsx**

```tsx
import type { Agent } from '@/entities/agent';

import { PinsPanel } from './pins-panel';
import { SemanticPanel } from './semantic-panel';

export function MemoryPane({ agent }: { agent: Agent }) {
  return (
    <>
      <PinsPanel agent={agent} />
      <SemanticPanel agent={agent} />
    </>
  );
}
```

- [ ] **Step 3: agent-inspector.tsx** — вкладки `Inspector` / `Memory`, `onValueChange` принимает `'inspector' | 'memory'`, рендер: `inspectorTab === 'memory' ? <MemoryPane agent={agent} /> : <InspectorPane agent={agent} />`. Убрать импорт `ConfigPane` и `InspectorThreadsPane`.

- [ ] **Step 4: inspector-pane.tsx** — удалить `<PinsPanel ...>` и `<SemanticPanel ...>` из рендера (строки 104–105) и их импорты.

- [ ] **Step 5: перенос конфиг-компонентов**

`git mv widgets/agent-inspector/ui/config-pane.tsx features/manage-agent/ui/config-pane.tsx` и аналогично `config-model-section.tsx`, `mcp-config.tsx`, `skills-config.tsx`, `tools-config.tsx`, плюс их локальные зависимости (`section.tsx` остаётся в agent-inspector — сделать копию или вынести в общий: положить `section.tsx` в `features/manage-agent/ui/section.tsx` копией). Импорт `useStudioLocation` внутри — валиден (shared). Экспорт в `features/manage-agent/index.ts` не добавлять, пока Task 7 не подключит (файлы в слайсе компилируются).

- [ ] **Step 6: удаление threads-pane.tsx** (потребителей нет после Task 5 шага 3 — вкладка Threads уже не рендерится).

- [ ] **Step 7: проверка и коммит**

`bunx biome check apps/studio/client`. В браузере: у треда две вкладки, Memory показывает Pins/Semantic.

```bash
git add apps/studio/client
git commit -m "feat(studio): thread inspector — Inspector / Memory tabs"
```

---

### Task 7: Модалка конфигурации агента

**Files:**
- Create: `apps/studio/client/src/features/manage-agent/ui/agent-config-dialog.tsx`
- Modify: `apps/studio/client/src/features/manage-agent/model/agent-dialogs.ts`
- Modify: `apps/studio/client/src/features/manage-agent/index.ts`
- Modify: потребители `openEditAgentDialog` (сайдбар, лендинг — после Task 9 меню; сейчас лендинг)

**Interfaces:**
- Produces: `openAgentConfigDialog(agent: Agent | null, workspaceId: string): Promise<AgentDraft | null>` — одна точка для создания и редактирования; внутри — левая навигация категорий: Identity, Model, Instructions, Compaction, Memory, Skills, Tools, MCP.

- [ ] **Step 1: каркас диалога с категориями**

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import type { Agent } from '@/entities/agent';
import { providersQuery, workspaceMcpQuery, workspaceSkillsQuery } from '@/shared/api';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { ModelSelect } from './model-select';
import { AgentEffortField, AgentGenerationFields } from './agent-generation-fields';
import { DraftCapabilities } from './draft-capabilities';
import { DraftCompaction } from './draft-compaction';
import { DraftMemory } from './draft-memory';
import {
  type AgentFieldsInput,
  type AgentFieldsOutput,
  agentFieldsFrom,
  agentFieldsSchema,
  emptyAgentFields,
  toAgentDraft,
} from '../model/agent-fields';

export type AgentConfigCategory =
  | 'identity'
  | 'model'
  | 'instructions'
  | 'compaction'
  | 'memory'
  | 'skills'
  | 'tools'
  | 'mcp';

export const AGENT_CONFIG_CATEGORIES: { id: AgentConfigCategory; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'model', label: 'Model' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'compaction', label: 'Compaction' },
  { id: 'memory', label: 'Memory' },
  { id: 'skills', label: 'Skills' },
  { id: 'tools', label: 'Tools' },
  { id: 'mcp', label: 'MCP' },
];

export function AgentConfigDialog({
  onResolve,
  data,
}: DialogComponentProps<AgentConfigResult, { agent: Agent | null; workspaceId: string }>) {
  const agent = data?.agent ?? null;
  const workspaceId = data?.workspaceId ?? '';
  const [category, setCategory] = useState<AgentConfigCategory>('identity');
  const providers = useQuery(providersQuery).data ?? [];
  const form = useForm<AgentFieldsInput, unknown, AgentFieldsOutput>({
    resolver: zodResolver(agentFieldsSchema),
    defaultValues: agent ? agentFieldsFrom(agent) : emptyAgentFields(),
  });

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        onResolve?.({
          fields: toAgentDraft(values),
          capabilities: draftCapabilitiesSnapshotRef.current,
        });
      })}
    >
      <div className="flex min-h-0 gap-4">
        <nav className="flex w-40 shrink-0 flex-col gap-0.5">
          {AGENT_CONFIG_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(item.id)}
              className={cn(
                'rounded-md px-2 py-1.5 text-left text-sm',
                category === item.id
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {/* рендер категории по switch(category) */}
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  );
}
```

Категории Identity/Model/Instructions рендерят существующие поля из `agent-dialogs.tsx` (Controller-блоки name/role/instructions/ModelSelect/AgentEffortField/AgentGenerationFields — перенести сюда). Диалог открывается как `dialog.open(AgentConfigDialog, { className: 'sm:max-w-3xl', data: { agent, workspaceId } })`.

- [ ] **Step 2: драфтовые capabilities (Skills / Tools / MCP)**

Новый `ui/draft-capabilities.tsx`: локальный стейт трёх allowlist-массивов (инициализация из `agent?.skills ?? []`, `agent?.tools ?? []`, `agent?.mcpServers ?? []`), каталоги из `workspaceSkillsQuery(workspaceId)`, `workspaceMcpQuery(workspaceId)`, tools-каталог — тот же источник, что в `tools-config.tsx` (`ListWorkspaceTools` через shared/api, прочитать `tools-config.tsx` и повторить запрос). Рендер: чекбокс-строки как в `skills-config.tsx`/`tools-config.tsx`/`mcp-config.tsx`, но `onChange` меняет локальный стейт вместо `updateAgentCapabilities`. Экспорт ref-подобного снимка через callback-проп `onChange(snapshot)` (родитель хранит в ref). API категории `agent`-зависимых: в режиме создания каталоги доступны (workspace-уровень), так что категории показываются всегда.

- [ ] **Step 3: драфтовые Compaction и Memory**

Прочитать `model/agent-compaction.ts` и `model/agent-memory.ts`, вынести их поля в `DraftCompaction`/`DraftMemory` (стейт-объекты, инициализация из `agent?.compaction`/`agent?.memory`), рендер полей скопировать из `AgentCompactionFields`/`AgentMemoryFields` (они после Task 6 лежат в `features/manage-agent/ui/`). На Save значения попадают в общий результат.

- [ ] **Step 4: result-тип и Save**

`model/agent-config.ts`:

```ts
import type { AgentDraft } from './agent-fields';

export type AgentCapabilitiesDraft = {
  skills?: string[];
  tools?: string[];
  mcpServers?: string[];
  compaction?: unknown;
  memory?: unknown;
};

export type AgentConfigResult = {
  fields: AgentDraft;
  capabilities: AgentCapabilitiesDraft;
};
```

`openAgentConfigDialog` в `model/agent-dialogs.ts`:

```ts
export function openAgentConfigDialog(agent: Agent | null, workspaceId: string) {
  return dialog.open(AgentConfigDialog, {
    title: agent ? `Configure ${agent.name}` : 'New agent',
    className: 'sm:max-w-3xl',
    testId: 'agent-config-dialog',
    data: { agent, workspaceId },
  });
}
```

Вызывающий (сайдбар `onAdd`/`onEdit`, лендинг `Settings`): `const result = await openAgentConfigDialog(agent, workspaceId); if (!result) return;` → при создании: `createAgent(workspaceId, result.fields)` затем `updateAgentCapabilities(workspaceId, created.id, result.capabilities)`; при редактировании: `updateAgent(...)` + `updateAgentCapabilities(...)`. Точные сигнатуры `updateAgentCapabilities` прочитать в `features/manage-agent/model/update-agent.ts`.

Старые `openCreateAgentDialog`/`openEditAgentDialog` и `CreateAgentDialog`/`EditAgentDialog` удалить вместе с `agent-dialogs.tsx` (потребители переключены).

- [ ] **Step 5: проверка и коммит**

`bunx biome check apps/studio/client`. В браузере через хозяина: создание агента из `+` открывает широкую модалку с категориями; Save создаёт агента с одним запросом настроек; редактирование из лендинга открывает ту же модалку с заполненными полями.

```bash
git add apps/studio/client
git commit -m "feat(studio): unified agent config dialog with category nav"
```

---

### Task 8: Модалки планировщика и вебхука

**Files:**
- Create: `apps/studio/client/src/features/manage-schedule/ui/schedule-config-dialog.tsx`
- Modify: `apps/studio/client/src/features/manage-schedule/model/schedule-dialogs.ts` (+ create/update model при необходимости)
- Modify: `apps/studio/client/src/features/manage-schedule/index.ts`
- Create: `apps/studio/client/src/features/manage-webhook/ui/webhook-config-dialog.tsx`
- Create: `apps/studio/client/src/features/manage-webhook/model/update-webhook.ts`, `model/delete-webhook.ts`
- Modify: `apps/studio/client/src/features/manage-webhook/model/webhook-dialogs.ts`, `features/manage-webhook/index.ts`

**Interfaces:**
- Produces: `openScheduleConfigDialog(agents: Agent[], workspaceId: string, schedule?: Schedule): Promise<ScheduleDraft | null>`; `openWebhookConfigDialog(agents: Agent[], workspaceId: string, webhook?: Webhook): Promise<WebhookDraft | null>`; `updateWebhook(workspaceId, id, patch)`, `deleteWebhook(workspaceId, webhook)` — серверные.

- [ ] **Step 1: schedule-config-dialog.tsx**

Основа — перенесённый в Task 5 `schedule-settings.tsx`: форма с драфтом `ScheduleDraft` (name, status, targetAgentId, detail, cron, mode, history, historyLast, threadId), поля те же (Name, Status — только в edit, Target agent, `ScheduleThreadField` с `allowDedicated`, `CronComposer`, Permission mode, `ScheduleHistoryFields`, Notes), но без заголовка-страницы и без автосейва: единственная кнопка Save в `DialogFooter` (`sm:max-w-2xl`). Создание: `createSchedule(workspaceId, draft)` (уже возвращает schedule+thread, сторы обновляет), редактирование: `updateSchedule(item.workspaceId, item.id, draft)`.

`model/schedule-dialogs.ts`:

```ts
export function openScheduleConfigDialog(
  agents: Agent[],
  workspaceId: string,
  schedule?: Schedule,
) {
  return dialog.open(ScheduleConfigDialog, {
    title: schedule ? `Configure ${schedule.name}` : 'New scheduler',
    className: 'sm:max-w-2xl',
    testId: 'schedule-config-dialog',
    data: { agents, workspaceId, schedule: schedule ?? null },
  });
}
```

Старый `openCreateScheduleDialog` заменить (потребитель — `schedules-section` до Task 9; поправить вызов на месте).

- [ ] **Step 2: webhook-config-dialog.tsx**

Поля: Name, Status (edit), Target agent, Thread (Select: «New thread» + треды целевого агента, занятые другими вебхуками исключены: `useWebhookStore` фильтр `items.some((w) => w.threadId === t.id && w.id !== editingId)`; при смене агента сброс выбранного треда), Notes. Драфт `WebhookDraft` расширить в `entities/webhook`: `{ name, targetAgentId, detail?, threadId? }`. Save: создание — `createWebhookRecord` + сторы (webhook + thread, уже сделано в Task 5 `create-webhook.ts`); редактирование — новый `model/update-webhook.ts`:

```ts
import { toClientWebhook, useWebhookStore, type Webhook } from '@/entities/webhook';
import { updateWebhookRecord, type UpdateWebhookInput } from '@/shared/api';

export async function updateWebhook(
  workspaceId: string,
  webhookId: string,
  patch: UpdateWebhookInput,
): Promise<Webhook | null> {
  const record = await updateWebhookRecord(workspaceId, webhookId, patch);
  const next = toClientWebhook(record);
  useWebhookStore.getState().upsert(next);
  return next;
}
```

`model/delete-webhook.ts`:

```ts
import { toClientWebhook, useWebhookStore, type Webhook } from '@/entities/webhook';
import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { deleteWebhookRecord, getThread } from '@/shared/api';

export async function deleteWebhook(workspaceId: string, webhook: Webhook): Promise<boolean> {
  await deleteWebhookRecord(workspaceId, webhook.id);
  useWebhookStore.getState().remove(webhook.id);
  const thread = useThreadStore.getState().byId(webhook.threadId);
  if (thread?.kind === 'webhook') {
    useSessionStore.getState().removeForThreads([webhook.threadId]);
    useThreadStore.getState().remove(webhook.threadId);
    return true;
  }
  return false;
}
```

`openWebhookConfigDialog` по образцу scheduler. Старый `openCreateWebhookDialog` заменить.

- [ ] **Step 3: проверка и коммит**

`bunx biome check apps/studio/client`. curl: PATCH вебхука меняет имя; DELETE удаляет вместе с kind='webhook' тредом (проверить `GET /api/threads`).

```bash
git add apps/studio/client
git commit -m "feat(studio): unified schedule and webhook config dialogs"
```

---

### Task 9: Сайдбар — аккордеон, Automations, меню карточек

**Files:**
- Modify: `apps/studio/client/src/shared/ui/resizer.tsx`
- Create: `apps/studio/client/src/widgets/workspace-sidebar/model/accordion.store.ts`
- Create: `apps/studio/client/src/widgets/workspace-sidebar/ui/accordion-section.tsx`
- Create: `apps/studio/client/src/widgets/workspace-sidebar/ui/automations-section.tsx`
- Modify: `widgets/workspace-sidebar/ui/workspace-sidebar.tsx`, `rail-section.tsx` (удалить), `schedules-section.tsx` + `webhooks-section.tsx` (удалить, код переезжает в automations), `files-section.tsx` (заголовок Explorer), `schedule-row.tsx`/`webhook-row.tsx` (меню + Settings)

**Interfaces:**
- Consumes: `openAgentConfigDialog` (Task 7), `openScheduleConfigDialog`/`openWebhookConfigDialog` (Task 8), `studioPath.thread` с origin.
- Produces: аккордеон Agents / Explorer / Automations / Git; подсветка карточки из `threadOrigin`/`originEntityId`.

- [ ] **Step 1: Resizer — вертикальная ориентация**

```tsx
type ResizerProps = {
  label: string;
  testId: string;
  dragging: boolean;
  orientation?: 'horizontal' | 'vertical';
  onResizeStart: (event: ReactMouseEvent) => void;
};
```

Классы: горизонтальная — как сейчас; вертикальная — `h-px w-full cursor-row-resize` и `before:absolute before:-top-1.5 before:left-0 before:right-0 before:h-3`.

- [ ] **Step 2: accordion.store.ts**

```ts
import { create } from 'zustand';
import { SIDEBAR_ACCORDION_STORAGE_KEY } from '@/shared/config/constants';

export type AccordionState = {
  collapsed: Record<string, boolean>;
  sizes: Record<string, number>;
  toggle: (id: string) => void;
  setSizes: (sizes: Record<string, number>) => void;
};

const DEFAULT_SIZES: Record<string, number> = {
  agents: 1,
  explorer: 1,
  automations: 1,
  git: 1,
};

function load(): { collapsed: Record<string, boolean>; sizes: Record<string, number> } {
  try {
    const raw = localStorage.getItem(SIDEBAR_ACCORDION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { collapsed?: Record<string, boolean>; sizes?: Record<string, number> };
      return {
        collapsed: { agents: false, explorer: true, automations: true, git: true, ...parsed.collapsed },
        sizes: { ...DEFAULT_SIZES, ...parsed.sizes },
      };
    }
  } catch {}
  return { collapsed: { agents: false, explorer: true, automations: true, git: true }, sizes: DEFAULT_SIZES };
}

export const useAccordionStore = create<AccordionState>((set) => {
  const initial = load();
  return {
    ...initial,
    toggle: (id) =>
      set((state) => ({ collapsed: { ...state.collapsed, [id]: !state.collapsed[id] } })),
    setSizes: (sizes) => {
      try {
        localStorage.setItem(SIDEBAR_ACCORDION_STORAGE_KEY, JSON.stringify({ collapsed: useAccordionStore.getState().collapsed, sizes }));
      } catch {}
      set({ sizes });
    },
  };
});
```

- [ ] **Step 3: accordion-section.tsx**

Секция: заголовок (кнопка на всю ширину: иконка, title, count, actions-слот справа со stopPropagation) — клик = `toggle(id)`; контент — `ScrollArea` с `style={{ flexGrow: size }}` (flexBasis 0), если секция свёрнута — контент не рендерится, высота заголовка авто. Ресайз между соседями делает родитель (`workspace-sidebar`): между каждой парой развёрнутых секций `<Resizer orientation="vertical" .../>`; onResizeStart по_delta: пересчёт двух соседних весов `a/(a+b)` от px-высот DOM (`element.getBoundingClientRect().height`), кламп 0.15–0.85 суммы пары, запись `setSizes`.

- [ ] **Step 4: automations-section.tsx**

Единый список: `[...schedules.map(toRow), ...webhooks.map(toRow)]` где `toRow` даёт `{id, kind: 'scheduler'|'webhook', name, updatedAt, node}`; сортировка `updatedAt` desc; строки — существующие `ScheduleRow`/`WebhookRow` (взять из старых секций), клик каждой уже перенаправлен на `/thread/:id?...` (Task 5). Header `+` — `DropdownMenu` с пунктами `New scheduler` (→ `openScheduleConfigDialog(agents, workspaceId)`) и `New webhook` (→ `openWebhookConfigDialog(agents, workspaceId)`); после create — navigate на тред с origin. Пустое состояние — строка-CTA `Wire a cron schedule or an inbound webhook.`

- [ ] **Step 5: меню карточек**

- `AgentCard` dropdown: `Dashboard` → `useStudioNavigation().openAgentLanding(agent.id)`; `Settings` → `openAgentConfigDialog(agent, agent.workspaceId)`; `Delete` — как было. `New thread` остаётся.
- `ScheduleRow` dropdown: `Settings` → `openScheduleConfigDialog(agents, workspaceId, schedule)` (агентов взять из пропсов секции); `Delete` — `confirmDeleteSchedule` → `deleteSchedule` + `closeByEntity('thread', threadId)` + если тред активен — navigate на workspace.
- `WebhookRow` dropdown: `Settings` → `openWebhookConfigDialog(agents, workspaceId, webhook)`; `Delete` → `confirmDeleteWebhook` → `deleteWebhook` + `closeByEntity('thread', item.threadId)`.

- [ ] **Step 6: подсветка из URL**

`workspace-sidebar.tsx`: из `useStudioLocation()` брать `threadId`, `threadOrigin`, `originEntityId`; `activeAgentId` = `originEntityId` при `threadOrigin === 'agent'`, иначе `byId(threadId)?.agentId` (для подсветки карточки агента без параметра); `activeScheduleId`/`activeWebhookId` = `originEntityId` при соответствующем origin. Прокинуть в `selected` строк.

- [ ] **Step 7: сборка workspace-sidebar.tsx**

`SidebarContent` → `flex flex-col min-h-0`; внутри `AccordionSection` для `agents` (карточки), `explorer` (содержимое `FilesSection` без обёртки RailSection, заголовок `Explorer`), `automations` (`AutomationsSection`), `git` (`GitSection`). `RailSection`, `schedules-section.tsx`, `webhooks-section.tsx` удалить. Заголовок `Files` → `Explorer` в files-section (иконка остаётся).

- [ ] **Step 8: проверка и коммит**

`bunx biome check apps/studio/client`. Хозяин проверяет: toggle заголовков, сплиттеры с памятью (перезагрузка страницы сохраняет пропорции), Automations вперемешку, меню карточек открывают модалки, подсветка переключается по origin-параметру.

```bash
git add apps/studio/client
git commit -m "feat(studio): sidebar accordion — Agents / Explorer / Automations / Git"
```

---

### Task 10: Журнал выполнений триггерных тредов

**Files:**
- Create: `apps/studio/client/src/widgets/chat-transcript/model/run-groups.ts`
- Modify: `apps/studio/client/src/widgets/chat-transcript/ui/thread-panel.tsx` (импорт splitRuns)
- Create: `apps/studio/client/src/widgets/thread-journal/index.ts`, `ui/thread-journal.tsx`, `ui/run-divider.tsx`
- Modify: `apps/studio/client/src/widgets/ide-content/ui/ide-content.tsx`

**Interfaces:**
- Produces: `splitRuns(events)` из `chat-transcript/model/run-groups.ts`; `ThreadJournal({ threadId, agent, title })` — журнал с разделителями прогонов; используется в ide-content для `kind !== 'chat'`.

- [ ] **Step 1: вынести splitRuns**

Из `thread-panel.tsx` перенести `RunGroup`, `RUN_TERMINAL_EVENT_TYPES`, `splitRuns` в `model/run-groups.ts` с `export`; thread-panel импортирует.

- [ ] **Step 2: run-divider.tsx**

```tsx
import { cn } from '@/shared/lib/utils';

export function RunDivider({
  index,
  task,
  failed,
  running,
}: {
  index: number;
  task: string;
  failed: boolean;
  running: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-1" data-testid={`run-divider-${index}`}>
      <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
        RUN {String(index + 1).padStart(2, '0')}
      </span>
      <span className="h-px flex-1 bg-border/60" />
      <span
        className={cn(
          'font-mono text-[10px] tracking-[0.16em]',
          failed ? 'text-danger' : running ? 'text-live' : 'text-muted-foreground',
        )}
      >
        {failed ? 'FAILED' : running ? 'RUNNING' : 'COMPLETED'}
      </span>
      <span className="max-w-[50%] truncate text-[11px] text-muted-foreground">{task}</span>
    </div>
  );
}
```

`text-danger`/`text-live` — существующие токены (используются в schedule-row/inspector-pane).

- [ ] **Step 3: thread-journal.tsx**

Копия каркаса `ThreadPanel` (MessageScrollerProvider, ChatSkeleton/ThreadEmpty, useThreadSync, useFollowLive, failures) с отличиями: перед каждым `runs[i]` рендерится `RunDivider` (`task` = текст первого события типа `user` в группе, `failed = run.error !== null`, `running = streaming && i === runs.length - 1`); шапка виджета:

```tsx
<header className="flex h-9 shrink-0 items-center gap-2 border-b px-4">
  {/* иконка CalendarClock/Earth по kind, имя триггера, статус-чип */}
</header>
```

Имя триггера: `useScheduleStore` → `items.find(s => s.threadId === threadId)`, иначе `useWebhookStore` → `items.find(w => w.threadId === threadId)`. Проп `kind: 'schedule' | 'webhook'` принимает из ide-content.

- [ ] **Step 4: ide-content.tsx**

Ветка треда: `thread.kind === 'chat'` → как сейчас (ThreadPanel + HitlPrompt + ChatComposer); иначе → `<ThreadJournal threadId={thread.id} agent={agent} kind={thread.kind} />` + `<HitlPrompt />` (без композера).

- [ ] **Step 5: проверка и коммит**

`bunx biome check apps/studio/client`. Хозяин: тред планировщика показывает разделители RUN 01/02 с задачей и статусом, композера нет, HITL-карточка отвечает.

```bash
git add apps/studio/client
git commit -m "feat(studio): trigger thread run journal with run dividers"
```

---

### Task 11: Снос остатков и финальная проверка

**Files:**
- Modify: по результатам grep
- Modify: `docs/superpowers/specs/2026-09-05-ide-navigation-design.md` (статус → реализовано)

- [ ] **Step 1: grep-очистка**

```bash
rg -n "openSchedule|openWebhook|useSelectSchedule|useSelectWebhook|useSelectThread|'schedules'|'webhooks'|'files'|'chat'" apps/studio/client/src --type ts -g '!*.test.*'
rg -n "ConfigPane|threads-pane|chat-frame|agent-threads|thread-tabs|FilesMain|SchedulesList|WebhooksList|ThreadsList|ChatWorkspace" apps/studio/client/src
```

Остатки: удалить (осмысленно: `'chat'` в строках — проверить контекст, это может быть `thread.kind === 'chat'` — валидный код).

- [ ] **Step 2: desk.store чистка**

`filesByAgentId`/`filesByWorkspaceId` и их экшены: если после всех задач потребитель только `features/open-file` — оставить как есть (вне объёма, задел на дублирующий стор); решение зафиксировать в спеке строкой «дублирующий файл-стор desk выносится отдельной задачей». Удалить нельзя, пока `openWorkspaceFile` используется.

- [ ] **Step 3: финальный линт**

```bash
bunx biome check .
```

- [ ] **Step 4: ручной чек-лист на стенде (через хозяина)**

- Прямые URL: `/w/:ws`, `/w/:ws/thread/:id?agent=`, `?scheduler=`, `?webhook=`, `/w/:ws/file/.studio/mcp.json`, `/w/:ws/agent/:id`, `/w/:ws/settings`.
- Табы: открытие из сайдбара/лендинга/IdeHome, активация из URL, закрытие с переходом на соседний, персист после перезагрузки (schedule/webhook-табы старого формата стерты санитайзером).
- Аккордеон: toggle, пропорции с памятью, независимо друг от друга скроллы.
- Модалки: агент (8 категорий, Save), планировщик, вебхук; создание и редактирование — одна модалка.
- Журнал: разделители, HITL, отсутствие композера.
- Каскады: удаление планировщика/вебхука удаляет тред; удаление треда с триггером предупреждает; `POST /hooks/:id` пишет прогон в журнал.

- [ ] **Step 5: коммит**

```bash
git add -A
git commit -m "chore(studio): navigation redesign cleanup"
```

---

## Self-Review

1. **Spec coverage**: маршруты/таблица — Task 5; лендинг — Task 4; модалки — 7–8; инспектор — 6; сайдбар-аккордеон+Automations — 9; журнал — 10; бекенд вебхука — 1–2; клиентский стор вебхуков — 3; каскады — 1 (delete-thread), 8 (delete-webhook); снос — 5 (частично), 11. Пробелов по секциям спеки нет.
2. **Placeholder-скан**: места, где исполнитель обязан прочитать соседний файл (agent-compaction/agent-memory, schedule-store, threads-list, tools-config, wire-schedules internals), оформлены шагами с указанием файла-источника и цели чтения — это инструкции по переносу реального кода, не TBD.
3. **Типы**: `ThreadOrigin`/`ThreadOriginRef`, `StudioSurface`, `WebhookRecord`/`CreateWebhookResponse`, `AgentConfigResult`/`AgentCapabilitiesDraft` определены в задачах-источниках и переиспользуются дальше без переименований.
