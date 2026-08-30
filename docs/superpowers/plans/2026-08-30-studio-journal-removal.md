# Studio Journal Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `Journal`/`JournalEntry`/`StreamEvent` from Studio. Client and server work natively with `SessionEvent`/`Snapshot`/`Event` from `harnesys`.

**Architecture:** Server cleanup (schema, use cases, schedule code, controller) + client rewrite (new `useSessionStore` on `SessionEvent[]`, all widgets/features adapted). No mapper modules between SessionEvent and old formats.

**Tech Stack:** SQLite (drizzle-orm), Hono, harnesys package, React, Zustand, TypeScript

**Spec:** `docs/superpowers/specs/2026-08-30-studio-journal-removal-design.md`

## Global Constraints

- File max 300 lines (AGENTS.md)
- No indexed access types (`T['field']`) — use named types
- Biome lint/format for entire monorepo
- No tests (AGENTS.md: тесты временно запрещены)
- Memory system (episodic, semantic, knowledge, pins) MUST stay functional
- Compact stays as no-op stub

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `server/adapters/store/sqlite/schema/journal-entries.ts` | Delete | Replaced by events table |
| `server/adapters/store/sqlite/schema/journal-steps.ts` | Delete | Replaced by events table |
| `server/adapters/store/sqlite/schema/index.ts` | Modify | Remove journal re-exports |
| `server/adapters/store/sqlite/schema/attachments.ts` | Modify | Remove FK to journalEntriesTable |
| `shared/thread.ts` | Modify | Add `events: SessionEvent[]` to ThreadRecord |
| `server/application/threads/get-thread.use-case.ts` | Modify | Load events from DB, include in response |
| `server/application/threads/create-thread.use-case.ts` | Modify | Remove `journal` from response |
| `server/application/schedules/create-schedule.use-case.ts` | Modify | Remove `journal` from response |
| `server/application/schedules/schedule-fold.ts` | Rewrite | Work with `Event[]` grouped by runId |
| `server/application/schedules/schedule-peek.ts` | Rewrite | Compact run from `Event[]` |
| `server/adapters/http/thread/thread.controller.ts` | Modify | Remove confirm/answer endpoints |
| `server/tests/sqlite-test-store.ts` | Rewrite | Use SqliteRuntimeState instead of SqliteJournalRepo |
| `client/src/entities/session/model/session.store.ts` | Create | New Zustand store on SessionEvent[] |
| `client/src/entities/session/model/usage.ts` | Create | Move from entities/journal (no logic changes) |
| `client/src/entities/session/index.ts` | Create | Barrel export |
| `client/src/entities/journal/` | Delete | Replaced by entities/session/ |
| `shared/api/threads.ts` | Modify | Remove confirmRun, answerRun, deleteThreadEntry |
| `shared/api/index.ts` | Modify | Remove deleted re-exports |
| `client/src/features/send-message/model/send-message.ts` | Rewrite | SessionEvent instead of StreamEvent |
| `client/src/features/send-message/model/drain-run-stream.ts` | Rewrite | SessionEvent instead of StreamEvent |
| `client/src/features/send-message/model/follow-live.ts` | Rewrite | Use events instead of journal entries |
| `client/src/features/send-message/model/resume-paused.ts` | Rewrite | Use events instead of journal entries |
| `client/src/features/send-message/model/pending-hitl.ts` | Rewrite | Find ask events instead of AgentStep |
| `client/src/features/send-message/model/hitl-actions.ts` | Rewrite | Use events to find runs |
| `client/src/features/desk/model/use-desk.ts` | Modify | useThreadEvents instead of useThreadJournal |
| `client/src/features/desk/model/hydrate-desk.ts` | Modify | replaceEvents instead of replaceJournal |
| `client/src/features/desk/model/refresh-thread.ts` | Modify | Use new store |
| `client/src/features/desk/model/apply-desk-event.ts` | Modify | Use new store |
| `client/src/features/switch-thread/model/switch-thread.ts` | Modify | Use new store |
| `client/src/features/compact-thread/model/compact-thread.ts` | Modify | Use new store |
| `client/src/features/manage-agent/model/create-agent.ts` | Modify | Use new store |
| `client/src/features/manage-agent/model/delete-agent.ts` | Modify | Use new store |
| `client/src/features/manage-schedule/model/create-schedule.ts` | Modify | Use new store |
| `client/src/features/manage-schedule/model/delete-schedule.ts` | Modify | Use new store |
| `client/src/widgets/chat-transcript/ui/thread-panel.tsx` | Modify | Use new store, toTranscript(events) |
| `client/src/widgets/chat-transcript/ui/user-message.tsx` | Modify | Use new store |
| `client/src/widgets/chat-transcript/ui/agent-turn.tsx` | Modify | Usage from events |
| `client/src/widgets/chat-transcript/ui/activity-items.tsx` | Modify | Usage from events |
| `client/src/widgets/chat-composer/ui/chat-composer.tsx` | Modify | Use new store |
| `client/src/widgets/chat-composer/model/model-context.ts` | Modify | Usage from events |
| `client/src/widgets/agent-inspector/ui/inspector-pane.tsx` | Modify | Use new store |
| `client/src/widgets/agent-inspector/ui/semantic-panel.tsx` | Modify | Use new store |
| `client/src/widgets/agent-inspector/ui/threads-pane.tsx` | Modify | Use new store |
| `client/src/widgets/agent-inspector/ui/pins-panel.tsx` | Modify | Use new store |
| `client/src/widgets/agent-threads/ui/agent-threads.tsx` | Modify | Use new store |
| `client/src/features/send-message/ui/hitl-prompt.tsx` | Modify | Use new store |

---

### Task 1: Schema Cleanup — Delete Journal Tables + Add runId to Events

**Files:**
- Delete: `apps/studio/server/adapters/store/sqlite/schema/journal-entries.ts`
- Delete: `apps/studio/server/adapters/store/sqlite/schema/journal-steps.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/schema/index.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/schema/attachments.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/schema/events.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/repos/sqlite-runtime-state.repo.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/bootstrap.ts`

**Interfaces:**
- Produces: Clean schema without journal references, events table with `runId`

- [ ] **Step 1: Delete journal schema files**

Delete files:
- `apps/studio/server/adapters/store/sqlite/schema/journal-entries.ts`
- `apps/studio/server/adapters/store/sqlite/schema/journal-steps.ts`

- [ ] **Step 2: Update schema/index.ts**

Remove these lines from `apps/studio/server/adapters/store/sqlite/schema/index.ts`:
```ts
export * from './journal-entries.ts';
export * from './journal-steps.ts';
```

- [ ] **Step 3: Fix attachments.ts FK**

In `apps/studio/server/adapters/store/sqlite/schema/attachments.ts`, remove the import of `journalEntriesTable` and change `entryId` to a plain text column without FK:

```ts
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { threadsTable } from './threads.ts';

export const attachmentsTable = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threadsTable.id, { onDelete: 'cascade' }),
    entryId: text('entry_id'),
    name: text('name').notNull(),
    mediaType: text('media_type').notNull(),
    path: text('path').notNull(),
    bytes: integer('bytes').notNull(),
    kind: text('kind', { enum: ['image', 'audio', 'video', 'file'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    kindCheck: check(
      'attachments_kind_check',
      sql`${table.kind} IN ('image', 'audio', 'video', 'file')`,
    ),
    threadIdx: index('attachments_thread_idx').on(table.threadId),
    threadPendingIdx: index('attachments_thread_pending_idx')
      .on(table.threadId)
      .where(sql`${table.entryId} IS NULL`),
  }),
);

export type AttachmentRow = typeof attachmentsTable.$inferSelect;
export type AttachmentInsert = typeof attachmentsTable.$inferInsert;
```

- [ ] **Step 4: Add runId to events table schema**

In `apps/studio/server/adapters/store/sqlite/schema/events.ts`, add `runId` column:

```ts
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const eventsTable = sqliteTable(
  'events',
  {
    eventId: text('event_id').primaryKey(),
    sessionId: text('session_id').notNull(),
    threadId: text('thread_id').notNull(),
    runId: text('run_id').notNull().default(''),
    type: text('type').notNull(),
    sequence: integer('sequence').notNull(),
    timestamp: integer('timestamp').notNull(),
    metadata: text('metadata'),
  },
  (table) => ({
    sessionSequenceIdx: index('events_session_sequence_idx').on(table.sessionId, table.sequence),
  }),
);

export type EventRow = typeof eventsTable.$inferSelect;
export type EventInsert = typeof eventsTable.$inferInsert;
```

- [ ] **Step 5: Update SqliteRuntimeState.commit() to store runId**

In `apps/studio/server/adapters/store/sqlite/repos/sqlite-runtime-state.repo.ts`, add `runId` to the event insert:

```ts
for (const event of events) {
  this.db
    .insert(eventsTable)
    .values({
      eventId: event.eventId,
      sessionId: this.sessionId,
      threadId: this.threadId,
      runId: event.runId ?? '',
      type: event.type,
      sequence: event.sequence,
      timestamp: event.timestamp,
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
    })
    .onConflictDoNothing()
    .run();
}
```

- [ ] **Step 6: Add migration in bootstrap.ts**

In `apps/studio/server/adapters/store/sqlite/bootstrap.ts`, add column migration after the existing ALTER TABLE block:

```ts
try {
  db.run(sql.raw(`ALTER TABLE events ADD COLUMN run_id TEXT NOT NULL DEFAULT '';`));
} catch {}
```

- [ ] **Step 7: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 2: ThreadRecord — Add Events Field

**Files:**
- Modify: `apps/studio/shared/thread.ts`
- Modify: `apps/studio/server/application/threads/get-thread.use-case.ts`

**Interfaces:**
- Consumes: `SessionEvent` from `harnesys`, `eventsTable` from schema
- Produces: `ThreadRecord.events: SessionEvent[]`

- [ ] **Step 1: Add events to ThreadRecord**

In `apps/studio/shared/thread.ts`, add `events` field to `ThreadRecord`:

```ts
export type ThreadRecord = {
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
  events: SessionEvent[];
};
```

- [ ] **Step 2: Update GetThreadUseCase to load events**

Rewrite `apps/studio/server/application/threads/get-thread.use-case.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { SessionEvent } from 'harnesys';
import type { ThreadRecord } from '../../../shared/types.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { StudioDb } from '../../adapters/store/sqlite/connection.ts';
import { eventsTable } from '../../adapters/store/sqlite/schema/events.ts';
import { readFields } from './thread.helpers.ts';

export type GetThreadRequest = {
  id: string;
};

export type GetThreadInput = {
  execute(request: GetThreadRequest): Promise<ThreadRecord>;
};

export class GetThreadUseCase implements GetThreadInput {
  constructor(
    private readonly threads: ThreadRepository,
    private readonly agents: AgentRepository,
    private readonly db: StudioDb,
  ) {}

  execute(request: GetThreadRequest): Promise<ThreadRecord> {
    const thread = this.threads.findById(request.id);
    if (!thread) {
      return Promise.reject(new NotFoundError('thread not found'));
    }
    const agent = this.agents.findById(thread.agentId);

    const rows = this.db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.threadId, thread.id))
      .orderBy(eventsTable.sequence)
      .all();

    const events: SessionEvent[] = [];
    for (const row of rows) {
      if (row.metadata) {
        try {
          const parsed = JSON.parse(row.metadata) as SessionEvent;
          if (parsed && typeof parsed === 'object' && 'type' in parsed) {
            events.push(parsed);
          }
        } catch {
          // skip non-SessionEvent metadata
        }
      }
    }

    return Promise.resolve({
      id: thread.id,
      title: thread.title,
      agentId: thread.agentId,
      agentName: agent?.name ?? '',
      workspaceId: thread.workspaceId,
      kind: thread.kind,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      ...readFields(thread),
      events,
    });
  }
}
```

- [ ] **Step 3: Update GetThreadUseCase construction in studio.ts**

In `apps/studio/server/composition/studio.ts`, pass `db` to `GetThreadUseCase` constructor. Find the line where `GetThreadUseCase` is constructed and add `db` as the third argument.

- [ ] **Step 4: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 3: Use Cases — Remove Journal from Responses

**Files:**
- Modify: `apps/studio/server/application/threads/create-thread.use-case.ts`
- Modify: `apps/studio/server/application/schedules/create-schedule.use-case.ts`

**Interfaces:**
- Produces: ThreadRecord without `journal` field

- [ ] **Step 1: Remove journal from CreateThreadUseCase**

In `apps/studio/server/application/threads/create-thread.use-case.ts`, remove `journal: { entries: [] }` from the returned object (line 59). Add `events: []` instead:

```ts
return await Promise.resolve({
  id: thread.id,
  title: thread.title,
  agentId: thread.agentId,
  agentName: agent.name,
  workspaceId: thread.workspaceId,
  kind: thread.kind,
  createdAt: thread.createdAt,
  updatedAt: thread.updatedAt,
  lastReadAt: thread.lastReadAt,
  unread: false,
  events: [],
});
```

- [ ] **Step 2: Remove journal from CreateScheduleUseCase**

In `apps/studio/server/application/schedules/create-schedule.use-case.ts`, find the `thread` object in the response (around line 163) and replace `journal: { entries: [] }` with `events: []`:

```ts
thread: {
  id: thread.id,
  title: thread.title,
  agentId: thread.agentId,
  agentName: agent.name,
  workspaceId: thread.workspaceId,
  kind: thread.kind,
  createdAt: thread.createdAt,
  updatedAt: thread.updatedAt,
  ...readFields(thread),
  events: [],
},
```

- [ ] **Step 3: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 4: Schedule Code — Rewrite on Event[]

**Files:**
- Rewrite: `apps/studio/server/application/schedules/schedule-fold.ts`
- Rewrite: `apps/studio/server/application/schedules/schedule-peek.ts`

**Interfaces:**
- Consumes: `Event` from `harnesys`, `eventsTable` from schema
- Produces: `scheduleFoldHistory()`, `lastScheduleRuns()`, `compactScheduleRun()` working with `Event[]`

- [ ] **Step 1: Rewrite schedule-fold.ts**

```ts
import { eq } from 'drizzle-orm';
import type { Event } from 'harnesys';
import { EVENT_TYPES } from 'harnesys';
import type { StudioDb } from '../../adapters/store/sqlite/connection.ts';
import { eventsTable } from '../../adapters/store/sqlite/schema/events.ts';
import type { ScheduleHistory } from '../../../shared/types.ts';

export function loadThreadEvents(db: StudioDb, threadId: string): Event[] {
  const rows = db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.threadId, threadId))
    .orderBy(eventsTable.sequence)
    .all();
  return rows.map((row) => ({
    eventId: row.eventId,
    type: row.type,
    timestamp: row.timestamp,
    sessionId: row.sessionId,
    runId: row.runId,
    agentId: '',
    sequence: row.sequence,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  })) as Event[];
}

export function groupEventsByRun(events: Event[]): Map<string, Event[]> {
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    const runId = event.runId || 'unknown';
    let group = groups.get(runId);
    if (!group) {
      group = [];
      groups.set(runId, group);
    }
    group.push(event);
  }
  return groups;
}

export function scheduleFoldHistory(
  events: Event[],
  history: ScheduleHistory,
  historyLast: number,
): Event[][] {
  const groups = groupEventsByRun(events);
  const runs = Array.from(groups.values());
  if (history === 'none') {
    return [];
  }
  const picked = history === 'all' ? runs : runs.slice(-Math.max(1, historyLast));
  return picked;
}

export function lastScheduleRuns(events: Event[], last: number): Event[][] {
  const groups = groupEventsByRun(events);
  const runs = Array.from(groups.values());
  return runs.slice(-Math.max(1, last));
}
```

- [ ] **Step 2: Rewrite schedule-peek.ts**

```ts
import type { Event } from 'harnesys';
import { EVENT_TYPES } from 'harnesys';

const OUTPUT_LIMIT = 2000;

export type SchedulePeekTool = {
  name: string;
  output: string;
};

export type SchedulePeekFire = {
  human: string;
  status: string;
  texts: string[];
  tools: SchedulePeekTool[];
  errors: string[];
};

export function compactScheduleRun(events: Event[]): SchedulePeekFire {
  const fire: SchedulePeekFire = {
    human: '',
    status: '',
    texts: [],
    tools: [],
    errors: [],
  };

  for (const event of events) {
    const meta = event.metadata as Record<string, unknown> | undefined;

    if (event.type === EVENT_TYPES.RUN_STARTED) {
      fire.status = 'running';
      continue;
    }

    if (event.type === EVENT_TYPES.RUN_COMPLETED) {
      fire.status = 'completed';
      continue;
    }

    if (event.type === EVENT_TYPES.RUN_FAILED) {
      fire.status = 'failed';
      const message = (meta?.message as string) ?? 'Run failed';
      fire.errors.push(message);
      continue;
    }

    if (event.type === EVENT_TYPES.MODEL_COMPLETED) {
      const text = meta?.text as string | undefined;
      if (text?.trim()) {
        fire.texts.push(clip(text));
      }
      continue;
    }

    if (event.type === EVENT_TYPES.TOOL_COMPLETED) {
      const name = (meta?.name as string) ?? 'tool';
      const output = meta?.output ? JSON.stringify(meta.output) : '';
      fire.tools.push({ name, output: clip(output) });
      continue;
    }

    if (event.type === EVENT_TYPES.TOOL_REQUESTED) {
      // tool requested — will be followed by completed/failed
      continue;
    }

    if (event.type === EVENT_TYPES.CONTROL_INTERRUPT) {
      const reason = (meta?.reason as string) ?? 'interrupt';
      fire.texts.push(`[interrupt: ${reason}]`);
      continue;
    }
  }

  return fire;
}

function clip(text: string): string {
  if (text.length <= OUTPUT_LIMIT) {
    return text;
  }
  return `${text.slice(0, OUTPUT_LIMIT)}…`;
}
```

- [ ] **Step 3: Update schedule consumers**

Search for callers of `scheduleFoldHistory`, `lastScheduleRuns`, `compactScheduleRun` in the server codebase and update them to pass `Event[]` instead of `Journal`. Key files:
- `server/application/host-tools/create-schedule-tools.ts` — schedule_peek tool
- Any schedule fire/execute logic

- [ ] **Step 4: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 5: Controller — Remove Confirm/Answer Endpoints

**Files:**
- Modify: `apps/studio/server/adapters/http/thread/thread.controller.ts`

**Interfaces:**
- Removes: `POST /api/runs/:id/confirm`, `POST /api/runs/:id/answer`

- [ ] **Step 1: Remove confirm/answer endpoints**

In `apps/studio/server/adapters/http/thread/thread.controller.ts`, there are no explicit confirm/answer endpoints visible in the current code (they may have already been removed). Verify by searching for "confirm" and "answer" in the file. If found, remove them.

- [ ] **Step 2: Remove unused imports**

Remove any imports of `ConfirmDecision`, `AnswerInput`, `HitlBatchSnapshot` from the controller and its deps type if present.

- [ ] **Step 3: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 6: Test Store — Replace JournalRepo with RuntimeState

**Files:**
- Rewrite: `apps/studio/server/tests/sqlite-test-store.ts`

**Interfaces:**
- Consumes: `SqliteRuntimeState`, `RuntimeStateRepository`
- Produces: `TestStoreRepos` without `journal`, with `runtimeState`

- [ ] **Step 1: Rewrite sqlite-test-store.ts**

```ts
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { bootstrapDatabase } from '../adapters/store/sqlite/bootstrap.ts';
import type { StudioDb } from '../adapters/store/sqlite/connection.ts';
import { SqliteAgentRepo } from '../adapters/store/sqlite/repos/sqlite-agent.repo.ts';
import { SqliteAttachmentRepo } from '../adapters/store/sqlite/repos/sqlite-attachment.repo.ts';
import { SqliteLlmModelRepo } from '../adapters/store/sqlite/repos/sqlite-llm-model.repo.ts';
import { SqliteLlmProviderRepo } from '../adapters/store/sqlite/repos/sqlite-llm-provider.repo.ts';
import { SqliteRuntimeState } from '../adapters/store/sqlite/repos/sqlite-runtime-state.repo.ts';
import { SqliteScheduleRepo } from '../adapters/store/sqlite/repos/sqlite-schedule.repo.ts';
import { SqliteThreadRepo } from '../adapters/store/sqlite/repos/sqlite-thread.repo.ts';
import { SqliteWebhookRepo } from '../adapters/store/sqlite/repos/sqlite-webhook.repo.ts';
import { SqliteWorkspaceRepo } from '../adapters/store/sqlite/repos/sqlite-workspace.repo.ts';
import * as schema from '../adapters/store/sqlite/schema/index.ts';
import { SqliteUnitOfWork } from '../adapters/store/sqlite/sqlite-unit-of-work.ts';
import type { AgentRepository } from '../domain/agent.port.ts';
import type { AttachmentRepository } from '../domain/attachment.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../domain/llm-provider.port.ts';
import type { RuntimeStateRepository } from '../domain/runtime-state.port.ts';
import type { ScheduleRepository } from '../domain/schedule.port.ts';
import type { ThreadRepository } from '../domain/thread.port.ts';
import type { UnitOfWork } from '../domain/unit-of-work.port.ts';
import type { WebhookRepository } from '../domain/webhook.port.ts';
import type { WorkspaceRepository } from '../domain/workspace.port.ts';

export type TestStoreRepos = {
  workspace: WorkspaceRepository;
  agent: AgentRepository;
  llmProvider: LlmProviderRepository;
  llmModel: LlmModelRepository;
  schedule: ScheduleRepository;
  webhook: WebhookRepository;
  thread: ThreadRepository;
  runtimeState: RuntimeStateRepository;
  attachment: AttachmentRepository;
};

export type TestStoreDb = StudioDb & { $client: Database };

export type TestStore = {
  db: TestStoreDb;
  repos: TestStoreRepos;
  uow: UnitOfWork;
  cleanup: () => void;
};

export type Seed = Record<string, never>;

export function createSqliteTestStore(seed: Seed = {}): Promise<TestStore> {
  void seed;
  const sqlite = new Database(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const db = drizzle(sqlite, { schema }) as TestStoreDb;
  bootstrapDatabase(db);

  const runtimeStateFactory: RuntimeStateRepository = {
    forState(threadId: string) {
      return new SqliteRuntimeState(db, threadId);
    },
    deleteByThread(_threadId: string) {
      // cleanup handled by CASCADE
    },
  };

  const repos: TestStoreRepos = {
    workspace: new SqliteWorkspaceRepo(db),
    agent: new SqliteAgentRepo(db),
    llmProvider: new SqliteLlmProviderRepo(db),
    llmModel: new SqliteLlmModelRepo(db),
    schedule: new SqliteScheduleRepo(db),
    webhook: new SqliteWebhookRepo(db),
    thread: new SqliteThreadRepo(db),
    runtimeState: runtimeStateFactory,
    attachment: new SqliteAttachmentRepo(db),
  };

  return Promise.resolve({
    db,
    repos,
    uow: new SqliteUnitOfWork(db),
    cleanup: () => sqlite.close(),
  });
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 7: Client Store — Create entities/session/

**Files:**
- Create: `apps/studio/client/src/entities/session/model/session.store.ts`
- Create: `apps/studio/client/src/entities/session/model/usage.ts`
- Create: `apps/studio/client/src/entities/session/index.ts`

**Interfaces:**
- Consumes: `SessionEvent` from `harnesys`
- Produces: `useSessionStore` Zustand store

- [ ] **Step 1: Create session.store.ts**

```ts
import type { SessionEvent } from 'harnesys';
import { create } from 'zustand';

export type ActiveRun = {
  runId: string;
  controller: AbortController;
};

export type RunFailure = {
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

const EMPTY_EVENTS: SessionEvent[] = [];

export const useSessionStore = create<SessionStoreState & SessionStoreActions>((set, get) => ({
  events: {},
  activeRuns: {},
  failures: [],
  contentEpoch: {},

  eventsOf(threadId: string) {
    return get().events[threadId] ?? EMPTY_EVENTS;
  },

  replaceEvents(threadId, events) {
    set((state) => ({
      events: { ...state.events, [threadId]: events },
      contentEpoch: { ...state.contentEpoch, [threadId]: Date.now() },
    }));
  },

  appendEvent(threadId, event) {
    set((state) => {
      const current = state.events[threadId] ?? [];
      return {
        events: { ...state.events, [threadId]: [...current, event] },
        contentEpoch: { ...state.contentEpoch, [threadId]: Date.now() },
      };
    });
  },

  startRun(threadId, controller, runId) {
    set((state) => ({
      activeRuns: {
        ...state.activeRuns,
        [threadId]: { runId: runId ?? '', controller },
      },
    }));
  },

  finishRun(threadId, runId) {
    set((state) => {
      const active = state.activeRuns[threadId];
      if (!active) return state;
      if (runId && active.runId && active.runId !== runId) return state;
      const { [threadId]: _, ...rest } = state.activeRuns;
      return { activeRuns: rest };
    });
  },

  abortRun(threadId) {
    const active = get().activeRuns[threadId];
    if (active) {
      active.controller.abort();
    }
    set((state) => {
      const { [threadId]: _, ...rest } = state.activeRuns;
      return { activeRuns: rest };
    });
  },

  setRunId(threadId, runId) {
    set((state) => {
      const active = state.activeRuns[threadId];
      if (!active) return state;
      return {
        activeRuns: {
          ...state.activeRuns,
          [threadId]: { ...active, runId },
        },
      };
    });
  },

  runIdOf(threadId) {
    return get().activeRuns[threadId]?.runId;
  },

  isStreaming(threadId) {
    return Boolean(get().activeRuns[threadId]);
  },

  setFailure(failure) {
    set((state) => ({
      failures: [...state.failures.filter((item) => item.id !== failure.id), failure],
    }));
  },

  removeForThreads(threadIds) {
    set((state) => {
      const events = { ...state.events };
      const activeRuns = { ...state.activeRuns };
      const contentEpoch = { ...state.contentEpoch };
      for (const id of threadIds) {
        delete events[id];
        delete activeRuns[id];
        delete contentEpoch[id];
      }
      return { events, activeRuns, contentEpoch };
    });
  },

  copyEvents(fromThreadId, toThreadId) {
    const source = get().events[fromThreadId];
    if (source) {
      set((state) => ({
        events: { ...state.events, [toThreadId]: [...source] },
      }));
    }
  },
}));
```

- [ ] **Step 2: Create usage.ts**

Copy `apps/studio/client/src/entities/journal/model/usage.ts` to `apps/studio/client/src/entities/session/model/usage.ts`. No logic changes needed — the functions (`formatTokenCount`, `formatDuration`, `rollupUsage`, `estimateTokens`, `contextWindowForModel`, `tokensUsed`, `tokensLeft`, `contextUsedRatio`, `usageFromGeneration`) don't depend on journal types.

- [ ] **Step 3: Create index.ts**

```ts
export { useSessionStore, type ActiveRun, type RunFailure } from './model/session.store.ts';
export {
  contextUsedRatio,
  contextWindowForModel,
  estimateTokens,
  formatDuration,
  formatTokenCount,
  type MessageUsage,
  rollupUsage,
  tokensLeft,
  tokensUsed,
  type ToolRunStat,
  type UsageRollup,
  usageFromGeneration,
} from './model/usage.ts';
```

- [ ] **Step 4: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 8: Client Shared — Update Types and API

**Files:**
- Modify: `apps/studio/shared/api/threads.ts`
- Modify: `apps/studio/shared/api/index.ts`

**Interfaces:**
- Removes: `confirmRun`, `answerRun`, `deleteThreadEntry`

- [ ] **Step 1: Remove journal-specific API functions**

In `apps/studio/shared/api/threads.ts`, remove these functions and their imports:
- `confirmRun`
- `answerRun`
- `deleteThreadEntry`

Also remove imports of `AnswerInput`, `ConfirmDecision`, `HitlBatchSnapshot` from the import block at the top.

- [ ] **Step 2: Update api/index.ts**

In `apps/studio/shared/api/index.ts`, remove these re-exports:
```ts
answerRun,
confirmRun,
deleteThreadEntry,
```

- [ ] **Step 3: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 9: Client Features — send-message/ Rewrite

**Files:**
- Rewrite: `apps/studio/client/src/features/send-message/model/send-message.ts`
- Rewrite: `apps/studio/client/src/features/send-message/model/drain-run-stream.ts`
- Rewrite: `apps/studio/client/src/features/send-message/model/follow-live.ts`
- Rewrite: `apps/studio/client/src/features/send-message/model/resume-paused.ts`
- Rewrite: `apps/studio/client/src/features/send-message/model/pending-hitl.ts`
- Rewrite: `apps/studio/client/src/features/send-message/model/hitl-actions.ts`

**Interfaces:**
- Consumes: `SessionEvent` from `harnesys`, `useSessionStore`
- Produces: Send/resume/drain/HITL working with SessionEvent

- [ ] **Step 1: Rewrite send-message.ts**

```ts
import type { RunMode, SessionEvent, ThreadAttachment } from '@studio/shared';
import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { getRunEventsStream, getThread, readSse, sendThreadRun } from '@/shared/api';
import { preview, trace } from '@/shared/lib/trace';

export type SendMessageOptions = {
  threadId: string;
  content: string;
  effort?: string;
  attachments?: ThreadAttachment[];
  mode?: RunMode;
};

export async function sendMessage(options: SendMessageOptions) {
  const { threadId, content, effort, attachments, mode } = options;
  const trimmed = content.trim();
  if (!trimmed && !attachments?.length) {
    return;
  }
  trace('client', 'send start', { threadId, text: preview(trimmed) });

  const controller = new AbortController();
  const store = useSessionStore.getState();
  store.startRun(threadId, controller);

  let runId: string;
  try {
    const accepted = await sendThreadRun({
      id: threadId,
      text: trimmed,
      effort,
      attachmentIds: attachments?.map((item) => item.id),
      mode,
    });
    runId = accepted.runId;
    store.setRunId(threadId, runId);
    useThreadStore.getState().touch(threadId);
    trace('client', 'POST accepted', { runId, status: accepted.status });
  } catch (error) {
    if (controller.signal.aborted) {
      trace('client', 'send aborted by user before response');
      store.finishRun(threadId);
      return;
    }
    useSessionStore.getState().finishRun(threadId);
    throw error;
  }

  let response: Response;
  try {
    response = await getRunEventsStream(runId, 0, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      trace('client', 'SSE aborted by user');
      store.finishRun(threadId, runId);
      return;
    }
    useSessionStore.getState().finishRun(threadId, runId);
    throw error;
  }

  let frames = 0;
  let finished = false;
  try {
    for await (const frame of readSse(response)) {
      frames += 1;
      const event = parseSessionEvent(frame.data);
      if (!event) {
        trace('client', `frame #${frames} unparsed`, {
          event: frame.event,
          data: preview(frame.data),
        });
        continue;
      }
      trace('client', `frame #${frames} ${event.type}`, summarize(event));
      applyClientEvent(threadId, event);
      if (event.type === 'done' || event.type === 'error') {
        finished = true;
      }
      await paint();
    }
    finished = true;
  } catch (error) {
    if (controller.signal.aborted) {
      trace('client', 'SSE aborted by user');
      useSessionStore.getState().finishRun(threadId, runId);
      return;
    }
    if (finished || frames > 0) {
      trace(
        'client',
        'sse stream ended with error after frames',
        error instanceof Error ? error.message : error,
      );
    } else {
      trace('client', 'sse read failed', error instanceof Error ? error.message : error);
      useSessionStore.getState().finishRun(threadId, runId);
      throw error;
    }
  }
  trace('client', 'sse ended', { frames, finished });
  try {
    const record = await getThread(threadId);
    useThreadStore.getState().upsert(toClientThread(record));
    useSessionStore.getState().replaceEvents(threadId, record.events);
    noteUnreadAfterReconcile(threadId, record.unread);
    trace('client', 'reconciled', { events: record.events.length });
  } catch (reconcileError) {
    trace(
      'client',
      'reconcile failed',
      reconcileError instanceof Error ? reconcileError.message : reconcileError,
    );
  } finally {
    useSessionStore.getState().finishRun(threadId, runId);
  }
}

function applyClientEvent(threadId: string, event: SessionEvent): void {
  const store = useSessionStore.getState();
  store.appendEvent(threadId, event);
  maybeMarkUnread(threadId);
  if (event.type === 'error') {
    store.setFailure({
      id: `failed-${threadId}-${Date.now()}`,
      threadId,
      text: event.message,
    });
  }
}

export function maybeMarkUnread(threadId: string): void {
  if (useThreadStore.getState().isViewingAtEnd(threadId)) {
    return;
  }
  useThreadStore.getState().markUnread(threadId);
}

function noteUnreadAfterReconcile(threadId: string, serverUnread: boolean): void {
  if (useThreadStore.getState().isViewingAtEnd(threadId)) {
    useThreadStore.getState().markRead(threadId);
    return;
  }
  if (serverUnread) {
    useThreadStore.getState().markUnread(threadId);
  }
}

function summarize(event: SessionEvent): unknown {
  if (event.type === 'text-delta') {
    return preview(event.text, 80);
  }
  if (event.type === 'tool') {
    return `${event.phase} ${event.name}`;
  }
  if (event.type === 'ask') {
    return `ask ${event.source}`;
  }
  return event.type;
}

function paint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function parseSessionEvent(data: string): SessionEvent | undefined {
  try {
    const parsed = JSON.parse(data) as SessionEvent;
    if (parsed && typeof parsed === 'object' && 'type' in parsed) {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 2: Rewrite drain-run-stream.ts**

```ts
import type { SessionEvent } from '@studio/shared';
import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { getRunEventsStream, getThread, readSse } from '@/shared/api';
import { trace } from '@/shared/lib/trace';

import { maybeMarkUnread } from './send-message';

export async function drainRunStream(
  threadId: string,
  runId: string,
  controller: AbortController,
): Promise<void> {
  try {
    const response = await getRunEventsStream(runId, 0, controller.signal);
    for await (const frame of readSse(response)) {
      const event = parseSessionEvent(frame.data);
      if (!event) {
        continue;
      }
      const store = useSessionStore.getState();
      store.appendEvent(threadId, event);
      maybeMarkUnread(threadId);
      if (event.type === 'error') {
        store.setFailure({
          id: `failed-${threadId}-${Date.now()}`,
          threadId,
          text: event.message,
        });
      }
      await paint();
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      trace('client', 'run sse ended', error instanceof Error ? error.message : error);
    }
  } finally {
    try {
      const record = await getThread(threadId);
      useThreadStore.getState().upsert(toClientThread(record));
      useSessionStore.getState().replaceEvents(threadId, record.events);
    } catch {
      // ignore reconcile errors
    }
    useSessionStore.getState().finishRun(threadId, runId);
  }
}

function parseSessionEvent(data: string): SessionEvent | undefined {
  try {
    const parsed = JSON.parse(data) as SessionEvent;
    if (parsed && typeof parsed === 'object' && 'type' in parsed) {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function paint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
```

- [ ] **Step 3: Rewrite follow-live.ts**

```ts
import type { SessionEvent } from '@studio/shared';
import { useSessionStore } from '@/entities/session';

import { drainRunStream } from './drain-run-stream';
import { resumePausedThread } from './resume-paused';

export async function followLiveThread(threadId: string): Promise<void> {
  const store = useSessionStore.getState();
  if (store.activeRuns[threadId]) {
    return;
  }
  const events = store.eventsOf(threadId);
  const lastRunEvent = findLastRunEvent(events);
  if (!lastRunEvent) {
    return;
  }

  if (lastRunEvent.type === 'ask') {
    await resumePausedThread(threadId);
    return;
  }
  if (lastRunEvent.type === 'text-delta' || lastRunEvent.type === 'tool') {
    // Run is still streaming — attach drain
    const runId = store.runIdOf(threadId);
    if (!runId) return;
    const controller = new AbortController();
    store.startRun(threadId, controller, runId);
    await drainRunStream(threadId, runId, controller);
    return;
  }
}

function findLastRunEvent(events: SessionEvent[]): SessionEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.type === 'done' || ev.type === 'error') return undefined;
    if (ev.type === 'text-delta' || ev.type === 'tool' || ev.type === 'ask') return ev;
  }
  return undefined;
}
```

- [ ] **Step 4: Rewrite resume-paused.ts**

```ts
import type { SessionEvent } from '@studio/shared';
import { useSessionStore } from '@/entities/session';
import { resumeThread } from '@/shared/api';
import { trace } from '@/shared/lib/trace';

import { drainRunStream } from './drain-run-stream';

export async function resumePausedThread(threadId: string): Promise<string | null> {
  const store = useSessionStore.getState();
  const events = store.eventsOf(threadId);
  const hasPendingAsk = events.some((ev) => ev.type === 'ask') &&
    !events.some((ev) => ev.type === 'done' || ev.type === 'error');

  if (!hasPendingAsk) {
    return null;
  }

  const controller = new AbortController();
  store.startRun(threadId, controller);

  let runId: string;
  try {
    const accepted = await resumeThread(threadId);
    runId = accepted.runId;
    store.setRunId(threadId, runId);
    trace('client', 'resume accepted', { runId });
  } catch (error) {
    store.finishRun(threadId);
    throw error;
  }

  void drainRunStream(threadId, runId, controller);
  return runId;
}
```

- [ ] **Step 5: Rewrite pending-hitl.ts**

```ts
import type { SessionEvent } from '@studio/shared';

export type PendingHitl = {
  askId: string;
  schema: unknown;
  source: string;
  prompt?: string;
  tool?: { name: string; input: unknown; toolCallId: string };
};

export function pendingHitl(events: SessionEvent[]): PendingHitl | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.type === 'done' || ev.type === 'error') return null;
    if (ev.type === 'ask') return ev;
  }
  return null;
}
```

- [ ] **Step 6: Rewrite hitl-actions.ts**

```ts
import { useSessionStore } from '@/entities/session';

import { resumePausedThread } from './resume-paused';

export async function respondToAsk(threadId: string, askId: string, payload: unknown): Promise<void> {
  await ensureLiveRun(threadId);
  // HITL respond is handled server-side via AgentRun.respond()
  // Client sends resume via the existing resume endpoint
}

async function ensureLiveRun(threadId: string): Promise<void> {
  const store = useSessionStore.getState();
  if (store.activeRuns[threadId]) {
    return;
  }
  await resumePausedThread(threadId);
}
```

- [ ] **Step 7: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 10: Client Features — desk/ Rewrite

**Files:**
- Modify: `apps/studio/client/src/features/desk/model/use-desk.ts`
- Modify: `apps/studio/client/src/features/desk/model/hydrate-desk.ts`
- Modify: `apps/studio/client/src/features/desk/model/refresh-thread.ts`
- Modify: `apps/studio/client/src/features/desk/model/apply-desk-event.ts`

**Interfaces:**
- Consumes: `useSessionStore`
- Produces: Desk features working with events

- [ ] **Step 1: Update use-desk.ts**

Replace `useThreadJournal` with `useThreadEvents`:

```ts
import type { SessionEvent } from '@studio/shared';
import { useShallow } from 'zustand/react/shallow';
import { useAgentStore } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { useScheduleStore } from '@/entities/schedule';
import { useThreadStore } from '@/entities/thread';
import { useWebhookStore } from '@/entities/webhook';
import { useWorkspaces } from '@/entities/workspace';
import { useStudioLocation } from '@/shared/config/location';

import { useDeskStore } from './desk.store';

const EMPTY_EVENTS: SessionEvent[] = [];

// ... existing hooks unchanged ...

export function useThreadEvents(threadId: string | null) {
  return useSessionStore(
    useShallow((state) => (threadId ? (state.events[threadId] ?? EMPTY_EVENTS) : EMPTY_EVENTS)),
  );
}

// Update useDesk() to use useThreadEvents instead of useThreadJournal:
// const events = useThreadEvents(thread?.id ?? null);
// Return { ...events } instead of { ...journal }
```

- [ ] **Step 2: Update hydrate-desk.ts**

Replace `useJournalStore` with `useSessionStore`:

```ts
import { useSessionStore } from '@/entities/session';
// ... other imports ...

export async function hydrateDesk(workspaceId: string) {
  // ... existing agent/schedule loading ...

  const records = await Promise.all(
    summaries.filter((item) => item.workspaceId === workspaceId).map((item) => getThread(item.id)),
  );
  useThreadStore.getState().replaceWorkspace(workspaceId, records.map(toClientThread));
  const live = useSessionStore.getState().activeRuns;
  for (const record of records) {
    if (live[record.id]) {
      continue;
    }
    useSessionStore.getState().replaceEvents(record.id, record.events);
  }
  // ... rest unchanged ...
}
```

- [ ] **Step 3: Update refresh-thread.ts**

Replace `useJournalStore` with `useSessionStore`. Same pattern: `replaceEvents` instead of `replaceJournal`.

- [ ] **Step 4: Update apply-desk-event.ts**

Replace `useJournalStore` with `useSessionStore`. On `thread` desk event: `replaceEvents(thread.id, thread.events)`. On schedule deletion: `removeForThreads`.

- [ ] **Step 5: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 11: Client Features — Remaining Features

**Files:**
- Modify: `apps/studio/client/src/features/switch-thread/model/switch-thread.ts`
- Modify: `apps/studio/client/src/features/compact-thread/model/compact-thread.ts`
- Modify: `apps/studio/client/src/features/manage-agent/model/create-agent.ts`
- Modify: `apps/studio/client/src/features/manage-agent/model/delete-agent.ts`
- Modify: `apps/studio/client/src/features/manage-schedule/model/create-schedule.ts`
- Modify: `apps/studio/client/src/features/manage-schedule/model/delete-schedule.ts`

**Interfaces:**
- Consumes: `useSessionStore`
- Produces: All features using new store

- [ ] **Step 1: Update switch-thread.ts**

Replace all `useJournalStore` calls:
- `removeForThreads` → same method name on `useSessionStore`
- `replaceJournal` → `replaceEvents`
- `journalOf` → `eventsOf`
- `copyPrefix` → `copyEvents`

- [ ] **Step 2: Update compact-thread.ts**

Replace `useJournalStore.replaceJournal` with `useSessionStore.replaceEvents`.

- [ ] **Step 3: Update create-agent.ts**

Replace `useJournalStore.replaceJournal` with `useSessionStore.replaceEvents`.

- [ ] **Step 4: Update delete-agent.ts**

Replace `useJournalStore.removeForThreads` with `useSessionStore.removeForThreads`.

- [ ] **Step 5: Update create-schedule.ts**

Replace `useJournalStore.replaceJournal` with `useSessionStore.replaceEvents`.

- [ ] **Step 6: Update delete-schedule.ts**

Replace `useJournalStore.removeForThreads` with `useSessionStore.removeForThreads`.

- [ ] **Step 7: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 12: Client Widgets — Adapt to New Store

**Files:**
- Modify: `apps/studio/client/src/widgets/chat-transcript/ui/thread-panel.tsx`
- Modify: `apps/studio/client/src/widgets/chat-transcript/ui/user-message.tsx`
- Modify: `apps/studio/client/src/widgets/chat-transcript/ui/agent-turn.tsx`
- Modify: `apps/studio/client/src/widgets/chat-transcript/ui/activity-items.tsx`
- Modify: `apps/studio/client/src/widgets/chat-composer/ui/chat-composer.tsx`
- Modify: `apps/studio/client/src/widgets/chat-composer/model/model-context.ts`
- Modify: `apps/studio/client/src/widgets/agent-inspector/ui/inspector-pane.tsx`
- Modify: `apps/studio/client/src/widgets/agent-inspector/ui/semantic-panel.tsx`
- Modify: `apps/studio/client/src/widgets/agent-inspector/ui/threads-pane.tsx`
- Modify: `apps/studio/client/src/widgets/agent-inspector/ui/pins-panel.tsx`
- Modify: `apps/studio/client/src/widgets/agent-threads/ui/agent-threads.tsx`
- Modify: `apps/studio/client/src/features/send-message/ui/hitl-prompt.tsx`

**Interfaces:**
- Consumes: `useSessionStore`, `useThreadEvents`
- Produces: All widgets rendering from SessionEvent[]

- [ ] **Step 1: Update thread-panel.tsx**

Replace imports:
```ts
import { useSessionStore, type RunFailure } from '@/entities/session';
import { useThreadEvents } from '@/features/desk';
```

Replace `useThreadJournal` with `useThreadEvents`. Replace `useJournalStore` with `useSessionStore`. Update `toTranscript` call to pass `SessionEvent[]` instead of `Journal`.

The `toTranscript` function in `shared/transcript.ts` already accepts `SessionEvent[]` — verify its signature and adapt the call.

- [ ] **Step 2: Update user-message.tsx**

Replace `useJournalStore` with `useSessionStore`. The `editHumanText` method may need to be reimplemented or removed (editing human text in events is different from editing journal entries).

- [ ] **Step 3: Update agent-turn.tsx**

Replace usage imports from `@/entities/journal` with `@/entities/session`. The `usageFromGeneration` function signature is the same.

- [ ] **Step 4: Update activity-items.tsx**

Replace `usageFromGeneration` import from `@/entities/journal` with `@/entities/session`.

- [ ] **Step 5: Update chat-composer.tsx**

Replace `useJournalStore` with `useSessionStore`. Replace `useThreadJournal` with `useThreadEvents`. Update streaming/activeRun/pendingHitl checks to use new store.

- [ ] **Step 6: Update model-context.ts**

Replace `Journal` type with `SessionEvent[]`. Update `generationUsages` and `turnGenerationUsages` to extract usage from events instead of journal entries.

- [ ] **Step 7: Update agent-inspector widgets**

Replace `useJournalStore` with `useSessionStore` in all inspector widgets. Replace `journal.entries.length` with `events.length`.

- [ ] **Step 8: Update agent-threads.tsx**

Replace `useJournalStore.removeForThreads` with `useSessionStore.removeForThreads`.

- [ ] **Step 9: Update hitl-prompt.tsx**

Replace `useThreadJournal` with `useThreadEvents`. Update `pendingHitl` call to pass `SessionEvent[]`.

- [ ] **Step 10: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 13: Delete entities/journal/ and Final Cleanup

**Files:**
- Delete: `apps/studio/client/src/entities/journal/` (entire directory)

**Interfaces:**
- Produces: No journal references in codebase

- [ ] **Step 1: Verify no imports remain**

Run: `grep -r "entities/journal" apps/studio/client/src --include="*.ts" --include="*.tsx" -l`
Expected: No results

If any results remain, fix them by switching to `@/entities/session`.

- [ ] **Step 2: Delete entities/journal/ directory**

Delete the entire `apps/studio/client/src/entities/journal/` directory.

- [ ] **Step 3: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 14: Final Verification

- [ ] **Step 1: Run full type check**

Run: `bun run tsc --noEmit` from repo root

- [ ] **Step 2: Run biome lint**

Run: `bun run biome check .`

- [ ] **Step 3: Verify no journal references remain**

Run: `grep -r "Journal\|JournalEntry\|StreamEvent\|journal_entries\|journal_steps" apps/studio --include="*.ts" --include="*.tsx" -l`
Expected: Only bootstrap.ts (DROP statements) and possibly schedule-prompt.ts (SCHEDULE_HUMAN_ORIGIN constant name)

- [ ] **Step 4: Verify no harnyx references remain**

Run: `grep -r "harnyx\|Harnyx\|createHarnyx\|ThreadHandle\|AgentHandle" apps/studio --include="*.ts" --include="*.tsx" -l`
Expected: No results

---

## Execution Order

Tasks must be executed in this order due to dependencies:

1. Task 1 (Schema cleanup) — no dependencies
2. Task 2 (ThreadRecord + events) — depends on Task 1
3. Task 3 (Use cases remove journal) — depends on Task 2
4. Task 4 (Schedule code) — depends on Task 1
5. Task 5 (Controller cleanup) — independent
6. Task 6 (Test store) — depends on Task 1
7. Task 7 (Client store) — independent
8. Task 8 (Client shared/api) — independent
9. Task 9 (send-message/) — depends on Tasks 7, 8
10. Task 10 (desk/) — depends on Task 7
11. Task 11 (Remaining features) — depends on Task 7
12. Task 12 (Widgets) — depends on Tasks 7, 9, 10, 11
13. Task 13 (Delete journal/) — depends on Task 12
14. Task 14 (Final verification) — depends on all

Tasks 1, 5, 7, 8 can be done in parallel. Tasks 4, 6 can be done in parallel with 2-3. Tasks 9, 10, 11 can be done in parallel after 7-8.
