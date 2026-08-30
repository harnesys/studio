# 0.5.0 STUDIO CUTOVER Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Studio's journal-based persist/streaming with Harnesys native `RuntimeState` + `Snapshot` + `Event` + `SessionEvent`.

**Architecture:** Drop `journal_entries`/`journal_steps` tables, create `snapshots`/`events`. Replace `JournalRepository` with `SqliteRuntimeState`. Refactor `ThreadRuntimeRegistry` to cache `SessionHandle`. Adapt use cases to `session.send()`/`session.resume()`. Keep memory system (episodic, semantic, knowledge, pins) working.

**Tech Stack:** SQLite (drizzle-orm), Hono, harnesys package, TypeScript

**Spec:** `docs/ROADMAP.md` (0.5.0 section), `docs/04-runtime-state.md`, `docs/20-session.md`

## Global Constraints

- File max 300 lines (AGENTS.md)
- No indexed access types (`T['field']`) — use named types
- Biome lint/format for entire monorepo
- No tests (AGENTS.md: тесты временно запрещены)
- Memory system (episodic, semantic, knowledge, pins) MUST stay functional
- Compact stays as no-op stub (not removed)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `apps/studio/server/adapters/store/sqlite/schema/snapshots.ts` | Create | Drizzle schema for snapshots table |
| `apps/studio/server/adapters/store/sqlite/schema/events.ts` | Create | Drizzle schema for events table |
| `apps/studio/server/adapters/store/sqlite/schema/index.ts` | Modify | Export new schemas |
| `apps/studio/server/adapters/store/sqlite/bootstrap.ts` | Modify | Drop journal tables, create snapshots+events |
| `apps/studio/server/adapters/store/sqlite/repos/sqlite-runtime-state.repo.ts` | Create | SqliteRuntimeState implements RuntimeState |
| `apps/studio/server/domain/runtime-state.port.ts` | Create | RuntimeStateRepository port |
| `apps/studio/server/domain/journal.port.ts` | Delete | Replaced by runtime-state.port.ts |
| `apps/studio/server/adapters/store/sqlite/repos/sqlite-journal.repo.ts` | Delete | Replaced by sqlite-runtime-state.repo.ts |
| `apps/studio/server/adapters/thread-runtime.registry.ts` | Modify | Cache SessionHandle per thread |
| `apps/studio/shared/thread.ts` | Modify | Remove journal types, use Snapshot/Event |
| `apps/studio/shared/transcript.ts` | Modify | Minor: already uses SessionEvent |
| `apps/studio/shared/types.ts` | Modify | Remove journal re-exports |
| `apps/studio/server/application/threads/send-thread-run.use-case.ts` | Modify | Use session.send() |
| `apps/studio/server/application/threads/resume-thread-run.use-case.ts` | Modify | Use session.resume() |
| `apps/studio/server/application/threads/drain-agent-run.ts` | Modify | Use SessionEvent |
| `apps/studio/server/application/threads/compact-thread.use-case.ts` | Modify | Stub as no-op |
| `apps/studio/server/application/threads/delete-thread-entry.use-case.ts` | Delete | Journal-based, no longer applicable |
| `apps/studio/server/adapters/active-runs.adapter.ts` | Modify | Use SessionEvent |
| `apps/studio/server/adapters/http/thread/thread.controller.ts` | Modify | SSE with SessionEvent |
| `apps/studio/server/adapters/memory/sqlite-episodic.port.ts` | Modify | Read from events instead of journal |
| `apps/studio/server/adapters/memory/entry-text.ts` | Modify | Extract text from SessionEvent |
| `apps/studio/server/application/memory/episodic-on-compacted.ts` | Modify | Adapt hook for events |
| `apps/studio/server/composition/wire-memory.ts` | Modify | Use RuntimeState instead of JournalRepository |
| `apps/studio/server/composition/studio.ts` | Modify | Wire new dependencies |

---

### Task 1: SQLite Schema — Snapshots + Events

**Files:**
- Create: `apps/studio/server/adapters/store/sqlite/schema/snapshots.ts`
- Create: `apps/studio/server/adapters/store/sqlite/schema/events.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/schema/index.ts`

**Interfaces:**
- Produces: `snapshotsTable`, `eventsTable` (drizzle table definitions)

- [ ] **Step 1: Create snapshots schema**

```ts
// apps/studio/server/adapters/store/sqlite/schema/snapshots.ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const snapshotsTable = sqliteTable('snapshots', {
  sessionId: text('session_id').primaryKey(),
  threadId: text('thread_id').notNull(),
  snapshot: text('snapshot').notNull(), // JSON string of Snapshot
  sequence: integer('sequence').notNull(),
  updatedAt: text('updated_at').notNull(),
});
```

- [ ] **Step 2: Create events schema**

```ts
// apps/studio/server/adapters/store/sqlite/schema/events.ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const eventsTable = sqliteTable('events', {
  eventId: text('event_id').primaryKey(),
  sessionId: text('session_id').notNull(),
  threadId: text('thread_id').notNull(),
  type: text('type').notNull(),
  sequence: integer('sequence').notNull(),
  timestamp: integer('timestamp').notNull(),
  metadata: text('metadata'), // JSON string
});

// Index for loading events by session
// CREATE INDEX events_session_idx ON events(session_id, sequence)
```

- [ ] **Step 3: Update schema index**

Add exports to `apps/studio/server/adapters/store/sqlite/schema/index.ts`:
```ts
export { snapshotsTable } from './snapshots.ts';
export { eventsTable } from './events.ts';
```

- [ ] **Step 4: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 2: Bootstrap — Drop Journal, Create Snapshots+Events

**Files:**
- Modify: `apps/studio/server/adapters/store/sqlite/bootstrap.ts`

**Interfaces:**
- Consumes: `snapshotsTable`, `eventsTable` from schema
- Produces: Clean database with new tables

- [ ] **Step 1: Add drop statements for journal tables**

In `bootstrap.ts`, add before the existing CREATE statements:
```ts
// Drop journal tables (0.5.0 cutover)
for (const table of ['journal_steps', 'journal_entries']) {
  try {
    db.run(sql.raw(`DROP TABLE IF EXISTS ${table};`));
  } catch {}
}
```

- [ ] **Step 2: Add CREATE statements for snapshots+events**

Add to the `statements` array:
```ts
`CREATE TABLE IF NOT EXISTS snapshots (
  session_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);`,
`CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  type TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  metadata TEXT
);`,
`CREATE INDEX IF NOT EXISTS events_session_idx ON events(session_id, sequence);`,
`CREATE INDEX IF NOT EXISTS events_thread_idx ON events(thread_id);`,
```

- [ ] **Step 3: Remove journal-related index creation**

Remove these lines from the statements array:
```ts
`CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_thread_seq_idx ON journal_entries(thread_id, seq);`,
`CREATE INDEX IF NOT EXISTS journal_entries_thread_idx ON journal_entries(thread_id);`,
`CREATE UNIQUE INDEX IF NOT EXISTS journal_steps_entry_seq_idx ON journal_steps(entry_id, seq);`,
`CREATE INDEX IF NOT EXISTS journal_steps_entry_idx ON journal_steps(entry_id);`,
```

- [ ] **Step 4: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 3: RuntimeState Port + SQLite Implementation

**Files:**
- Create: `apps/studio/server/domain/runtime-state.port.ts`
- Create: `apps/studio/server/adapters/store/sqlite/repos/sqlite-runtime-state.repo.ts`
- Delete: `apps/studio/server/domain/journal.port.ts`
- Delete: `apps/studio/server/adapters/store/sqlite/repos/sqlite-journal.repo.ts`

**Interfaces:**
- Consumes: `RuntimeState`, `Snapshot`, `Event`, `CommitMeta` from `harnesys`
- Produces: `SqliteRuntimeState` class implementing `RuntimeState`

- [ ] **Step 1: Create RuntimeState port**

```ts
// apps/studio/server/domain/runtime-state.port.ts
import type { RuntimeState } from 'harnesys';

export type RuntimeStateRepository = {
  /** Get or create a RuntimeState for a thread. */
  forState(threadId: string): RuntimeState;
  /** Delete all state for a thread. */
  deleteByThread(threadId: string): void;
};
```

- [ ] **Step 2: Create SqliteRuntimeState**

```ts
// apps/studio/server/adapters/store/sqlite/repos/sqlite-runtime-state.repo.ts
import { eq } from 'drizzle-orm';
import type { CommitMeta, Event, RuntimeState, Snapshot } from 'harnesys';
import type { StudioDb } from '../connection.ts';
import { eventsTable } from '../schema/events.ts';
import { snapshotsTable } from '../schema/snapshots.ts';

export class SqliteRuntimeState implements RuntimeState {
  readonly sessionId: string;

  constructor(
    private readonly db: StudioDb,
    private readonly threadId: string,
    sessionId?: string,
  ) {
    this.sessionId = sessionId ?? crypto.randomUUID();
  }

  async load(): Promise<Snapshot | null> {
    const row = this.db
      .select()
      .from(snapshotsTable)
      .where(eq(snapshotsTable.sessionId, this.sessionId))
      .get();
    if (!row) return null;
    return JSON.parse(row.snapshot) as Snapshot;
  }

  async commit(
    snapshot: Snapshot,
    events: readonly Event[],
    meta: CommitMeta,
  ): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .insert(snapshotsTable)
      .values({
        sessionId: this.sessionId,
        threadId: this.threadId,
        snapshot: JSON.stringify(snapshot),
        sequence: meta.sequence,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: snapshotsTable.sessionId,
        set: {
          snapshot: JSON.stringify(snapshot),
          sequence: meta.sequence,
          updatedAt: now,
        },
      })
      .run();

    for (const event of events) {
      this.db
        .insert(eventsTable)
        .values({
          eventId: event.eventId,
          sessionId: this.sessionId,
          threadId: this.threadId,
          type: event.type,
          sequence: event.sequence,
          timestamp: event.timestamp,
          metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        })
        .onConflictDoNothing()
        .run();
    }
  }

  child(spawnId: string): RuntimeState {
    return new SqliteRuntimeState(this.db, this.threadId, spawnId);
  }
}
```

- [ ] **Step 3: Delete journal.port.ts**

Delete file: `apps/studio/server/domain/journal.port.ts`

- [ ] **Step 4: Delete sqlite-journal.repo.ts**

Delete file: `apps/studio/server/adapters/store/sqlite/repos/sqlite-journal.repo.ts`

- [ ] **Step 5: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 4: ThreadRuntimeRegistry — Cache SessionHandle

**Files:**
- Modify: `apps/studio/server/adapters/thread-runtime.registry.ts`

**Interfaces:**
- Consumes: `RuntimeHandle`, `SessionHandle`, `AgentRun` from `harnesys`
- Produces: `ThreadRuntimeRegistry` with `threadOf()` returning `SessionHandle`

- [ ] **Step 1: Rewrite ThreadRuntimeRegistry**

```ts
// apps/studio/server/adapters/thread-runtime.registry.ts
import type { RuntimeHandle, SessionHandle } from 'harnesys';
import type { SqliteRuntimeState } from './store/sqlite/repos/sqlite-runtime-state.repo.ts';

export type ThreadOpenExtras = {
  onCompacted?: (range: unknown) => void | Promise<void>;
};

export class ThreadRuntimeRegistry {
  private readonly threads = new Map<string, Promise<SessionHandle>>();

  constructor(
    private readonly stateFactory: { forState(threadId: string): SqliteRuntimeState },
  ) {}

  threadOf(
    threadId: string,
    runtime: RuntimeHandle,
    agentName: string,
    _cwd?: string,
    _extras?: ThreadOpenExtras,
  ): Promise<SessionHandle> {
    const cached = this.threads.get(threadId);
    if (cached) return cached;

    const pending = Promise.resolve().then(() => {
      const state = this.stateFactory.forState(threadId);
      return runtime.session(agentName, { state });
    });

    this.threads.set(threadId, pending);
    pending.catch(() => {
      if (this.threads.get(threadId) === pending) {
        this.threads.delete(threadId);
      }
    });
    return pending;
  }

  forget(threadId: string): void {
    this.threads.delete(threadId);
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 5: Shared Types — Remove Journal, Use Snapshot/Event

**Files:**
- Modify: `apps/studio/shared/thread.ts`
- Modify: `apps/studio/shared/types.ts`

**Interfaces:**
- Consumes: `Snapshot`, `Event`, `SessionEvent` from `harnesys`
- Produces: Clean types without journal dependencies

- [ ] **Step 1: Rewrite shared/thread.ts**

```ts
// apps/studio/shared/thread.ts
import type { Snapshot, Event, SessionEvent } from 'harnesys';

export type { Snapshot, Event, SessionEvent };

export const THREAD_KINDS = ['chat', 'schedule'] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

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
};

export type ThreadSummary = Pick<
  ThreadRecord,
  | 'id'
  | 'title'
  | 'agentId'
  | 'agentName'
  | 'workspaceId'
  | 'kind'
  | 'createdAt'
  | 'updatedAt'
  | 'lastReadAt'
  | 'unread'
>;

/** Accepted send: live agent entry id (= AgentRun.id). */
export type AcceptedRunResponse = {
  runId: string;
  status: 'accepted';
};

/** Manual `/compact`: stub response. */
export type CompactThreadResponse = {
  compacted: boolean;
};
```

- [ ] **Step 2: Update shared/types.ts**

Remove journal-related imports and re-exports. Replace:
```ts
// Remove these lines:
export type {
  AgentEntry,
  AgentRunStatus,
  AgentStep,
  AgentStepStatus,
  AnswerInput,
  CompactionEntry,
  CompactionPayload,
  CompactionPayloadStats,
  CompactThreadResponse,
  ConfirmDecision,
  GenerationUsage,
  HitlBatchSnapshot,
  HumanEntry,
  Journal,
  JournalAttachment,
  JournalAttachmentKind,
  JournalEntry,
  StreamEvent,
  SystemEntry,
  ThreadAttachment,
  ThreadAttachmentKind,
  ThreadKind,
  ThreadRecord,
  ThreadSummary,
  TokenUsage,
} from './thread.ts';
export {
  addGenerationUsage,
  isAgentEntry,
  isBuiltinStep,
  isCompactionEntry,
  isHumanEntry,
  isSystemEntry,
  isTextAttachment,
  THREAD_KINDS,
} from './thread.ts';
```

With:
```ts
export type {
  AcceptedRunResponse,
  CompactThreadResponse,
  Snapshot,
  Event,
  SessionEvent,
  ThreadKind,
  ThreadRecord,
  ThreadSummary,
} from './thread.ts';
export { THREAD_KINDS } from './thread.ts';
```

- [ ] **Step 3: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 6: SendThreadRunUseCase — Use session.send()

**Files:**
- Modify: `apps/studio/server/application/threads/send-thread-run.use-case.ts`

**Interfaces:**
- Consumes: `RuntimeHandle`, `SessionHandle`, `AgentRun`, `SendInput` from `harnesys`
- Produces: `AcceptedRunResponse` (without journal)

- [ ] **Step 1: Update imports**

Replace journal imports with session imports:
```ts
import {
  type AgentRun,
  type SendFile,
  type SendInput,
  type SessionHandle,
} from 'harnesys';
```

- [ ] **Step 2: Update SendThreadRunDeps**

Remove `journal` and `episodic` deps. Add `stateFactory`:
```ts
export type SendThreadRunDeps = {
  threads: ThreadRepository;
  agents: AgentRepository;
  models: LlmModelRepository;
  providers: LlmProviderRepository;
  workspaces: WorkspaceRepository;
  attachments: AttachmentRepository;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  registry: ThreadRuntimeRegistry;
  activeRuns: ActiveRunRegistry;
  deskEvents: DeskEventsPort;
  getThread: GetThreadInput;
  getThreadPlan?: GetThreadPlanInput;
};
```

- [ ] **Step 3: Update execute() method**

Replace the runtime/session logic:
```ts
async execute(request: SendThreadRunRequest): Promise<AcceptedRunResponse> {
  // ... validation unchanged ...

  const input = buildSendInput(request, this.attachments, request.threadId);
  const runMode = resolveRunMode(request.mode);
  const mode = toPermissionMode(runMode);
  input.text = await this.decorateText(request.threadId, runMode, input.text);

  return await runInHostToolScope(
    { workspaceId: workspace.id, agentId: agentRow.id, threadId: thread.id },
    async () => {
      const hx = await this.workspaceHarnesys.get(workspace);
      const handle = await this.registry.threadOf(
        thread.id,
        hx,
        agentRow.name,
        workspace.path,
      );

      const controller = new AbortController();
      const run = handle.send(input, {
        signal: controller.signal,
        permissions: toolPermissionFor(runMode),
      });
      this.activeRuns.register(run.id, thread.id, run, controller);

      this.publishThread(thread.id);
      void drainAgentRun({
        threadId: thread.id,
        run,
        activeRuns: this.activeRuns,
        registry: this.registry,
        onPersist: (threadId) => this.publishThread(threadId),
      });

      return {
        runId: run.id,
        status: 'accepted',
      };
    },
  );
}
```

- [ ] **Step 4: Remove attachPending and journal-related code**

Delete the `attachPending` function and journal-related imports.

- [ ] **Step 5: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 7: ResumeThreadRunUseCase — Use session.resume()

**Files:**
- Modify: `apps/studio/server/application/threads/resume-thread-run.use-case.ts`

**Interfaces:**
- Consumes: `SessionHandle`, `AgentRun` from `harnesys`
- Produces: `AcceptedRunResponse` (without journal)

- [ ] **Step 1: Update imports**

Remove journal imports. Add session imports:
```ts
import {
  type AgentRun,
  ThreadBusyError,
} from 'harnesys';
```

- [ ] **Step 2: Update ResumeThreadRunDeps**

Remove `journal` and `episodic` deps:
```ts
export type ResumeThreadRunDeps = {
  threads: ThreadRepository;
  agents: AgentRepository;
  models: LlmModelRepository;
  providers: LlmProviderRepository;
  workspaces: WorkspaceRepository;
  schedules: ScheduleRepository;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  registry: ThreadRuntimeRegistry;
  activeRuns: ActiveRunRegistry;
  deskEvents: DeskEventsPort;
  getThread: GetThreadInput;
};
```

- [ ] **Step 3: Update execute() method**

Replace resume logic:
```ts
async execute(request: ResumeThreadRunRequest): Promise<AcceptedRunResponse> {
  // ... validation unchanged ...

  return await runInHostToolScope(
    { workspaceId: workspace.id, agentId: agentRow.id, threadId: thread.id },
    async () => {
      const hx = await this.workspaceHarnesys.get(workspace);
      const handle = await this.registry.threadOf(
        thread.id,
        hx,
        agentRow.name,
        workspace.path,
      );

      const controller = new AbortController();
      let run: AgentRun;
      try {
        run = handle.resume({
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof ThreadBusyError) {
          throw new ConflictError(error.message);
        }
        throw error;
      }

      this.activeRuns.register(run.id, thread.id, run, controller);
      publishDeskThread(this.getThread, this.deskEvents, thread.id);
      void drainAgentRun({
        threadId: thread.id,
        run,
        activeRuns: this.activeRuns,
        registry: this.registry,
        onPersist: (threadId) => publishDeskThread(this.getThread, this.deskEvents, threadId),
      });

      return {
        runId: run.id,
        status: 'accepted',
      };
    },
  );
}
```

- [ ] **Step 4: Remove journal-related helper functions**

Delete `permissionModeFromJournal` and `foldJournalForResume`.

- [ ] **Step 5: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 8: DrainAgentRun + ActiveRunRegistry — Use SessionEvent

**Files:**
- Modify: `apps/studio/server/application/threads/drain-agent-run.ts`
- Modify: `apps/studio/server/adapters/active-runs.adapter.ts`

**Interfaces:**
- Consumes: `AgentRun`, `SessionEvent` from `harnesys`
- Produces: SSE events via `ActiveRunRegistry.emit()`

- [ ] **Step 1: Update drain-agent-run.ts**

Remove `handle` and `journal` from options. Use `SessionEvent`:
```ts
import type { AgentRun, SessionEvent } from 'harnesys';
import type { ActiveRunRegistry } from '../../adapters/active-runs.adapter.ts';
import type { ThreadRuntimeRegistry } from '../../adapters/thread-runtime.registry.ts';

export type DrainAgentRunOptions = {
  threadId: string;
  run: AgentRun;
  activeRuns: ActiveRunRegistry;
  registry?: ThreadRuntimeRegistry;
  onPersist?: (threadId: string) => void;
};

export async function drainAgentRun(options: DrainAgentRunOptions): Promise<void> {
  const { threadId, run, activeRuns, registry, onPersist } = options;
  try {
    for await (const event of run.stream()) {
      activeRuns.emit(run.id, event);
      if (event.type === 'ask') {
        onPersist?.(threadId);
      }
    }
  } catch {
    // abort / consumer errors
  } finally {
    onPersist?.(threadId);
    activeRuns.finish(run.id);
    registry?.forget(threadId);
  }
}
```

- [ ] **Step 2: Update active-runs.adapter.ts**

Replace `StreamEvent` with `SessionEvent`:
```ts
import type { AgentRun, SessionEvent } from 'harnesys';

type EventListener = (event: SessionEvent) => void;

// ... rest of the class stays the same, just change emit signature:
emit(runId: string, event: SessionEvent): void {
  // ... same implementation
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 9: ThreadController — SSE with SessionEvent

**Files:**
- Modify: `apps/studio/server/adapters/http/thread/thread.controller.ts`

**Interfaces:**
- Consumes: `SessionEvent` from `harnesys`
- Produces: SSE stream of `SessionEvent`

- [ ] **Step 1: Update imports**

Replace `StreamEvent` with `SessionEvent`:
```ts
import type { SessionEvent } from 'harnesys';
```

- [ ] **Step 2: Update streamSse function**

Change parameter type:
```ts
function streamSse(c: Context, events: AsyncIterable<SessionEvent>) {
  // ... implementation stays the same, just change type
}
```

- [ ] **Step 3: Remove confirm/answer endpoints**

These are journal-specific HITL endpoints. The new flow uses `AgentRun.respond()` / `AgentRun.reject()` directly via SSE. Remove:
- `POST /api/runs/:id/confirm`
- `POST /api/runs/:id/answer`

- [ ] **Step 4: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 10: Memory System — Adapt Episodic for Events

**Files:**
- Modify: `apps/studio/server/adapters/memory/sqlite-episodic.port.ts`
- Modify: `apps/studio/server/adapters/memory/entry-text.ts`
- Modify: `apps/studio/server/application/memory/episodic-on-compacted.ts`

**Interfaces:**
- Consumes: `SessionEvent`, `Event` from `harnesys`
- Produces: Episodic chunks indexed from events

- [ ] **Step 1: Update entry-text.ts**

Replace journal-based text extraction with event-based:
```ts
import type { SessionEvent } from 'harnesys';

/** Flatten a session event into indexable text for episodic chunks. */
export function eventIndexText(event: SessionEvent): string {
  if (event.type === 'text-delta') {
    return event.text?.trim() ?? '';
  }
  if (event.type === 'tool') {
    const parts: string[] = [];
    if (event.name) parts.push(event.name);
    if (event.input) parts.push(JSON.stringify(event.input));
    if (event.output) parts.push(JSON.stringify(event.output));
    return parts.join(': ');
  }
  if (event.type === 'ask') {
    return event.prompt?.trim() ?? '';
  }
  if (event.type === 'done') {
    return event.text?.trim() ?? '';
  }
  return '';
}
```

- [ ] **Step 2: Update sqlite-episodic.port.ts**

Replace `JournalRepository` dependency with event loading from SQLite:
```ts
import { and, eq, gte, lte } from 'drizzle-orm';
import type { EpisodicHit, EpisodicIndexInput, EpisodicPort, EpisodicSearchInput } from 'harnesys';
import type { StudioDb } from '../store/sqlite/connection.ts';
import { eventsTable } from '../store/sqlite/schema/events.ts';
import { episodicChunksTable } from '../store/sqlite/schema/index.ts';
import { chunkText } from './chunk-text.ts';
import { cosineSimilarity, decodeEmbedding, encodeEmbedding } from './embedding-vec.ts';
import type { EmbeddingsPort } from './embeddings.ts';
import { eventIndexText } from './entry-text.ts';
import { buildFtsMatchQuery } from './fts-query.ts';
import type { MemorySearchBackend } from './memory-backend.ts';
import { sqliteClient } from './sqlite-client.ts';

// ... constructor removes journal dependency, keeps db + options

async index(input: EpisodicIndexInput): Promise<void> {
  // ... vector setup unchanged ...
  this.deleteRange(input.workspaceId, input.threadId, input.fromSeq, input.toSeq);

  // Load events from SQLite instead of journal
  const rows = this.db
    .select()
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.threadId, input.threadId),
        gte(eventsTable.sequence, input.fromSeq),
        lte(eventsTable.sequence, input.toSeq),
      ),
    )
    .orderBy(eventsTable.sequence)
    .all();

  const now = new Date().toISOString();
  for (const row of rows) {
    const event = {
      type: row.type,
      text: row.metadata ? JSON.parse(row.metadata).text : undefined,
      name: row.metadata ? JSON.parse(row.metadata).name : undefined,
      toolCallId: row.metadata ? JSON.parse(row.metadata).toolCallId : undefined,
      input: row.metadata ? JSON.parse(row.metadata).input : undefined,
      output: row.metadata ? JSON.parse(row.metadata).output : undefined,
      prompt: row.metadata ? JSON.parse(row.metadata).prompt : undefined,
    } as SessionEvent;

    const pieces = chunkText(eventIndexText(event));
    if (pieces.length === 0) continue;

    const vectors = wantVector && this.embeddings ? await this.embeddings.embed(pieces) : undefined;
    for (let i = 0; i < pieces.length; i++) {
      const text = pieces[i] ?? '';
      this.db
        .insert(episodicChunksTable)
        .values({
          id: crypto.randomUUID(),
          workspaceId: input.workspaceId,
          threadId: input.threadId,
          entryId: row.eventId,
          seq: row.sequence,
          text,
          compactionEntryId: input.compactionEntryId ?? null,
          embedding: vectors ? encodeEmbedding(vectors[i] ?? []) : null,
          createdAt: now,
        })
        .run();
    }
  }
}
```

- [ ] **Step 3: Update episodic-on-compacted.ts**

Adapt hook to work with events (compaction is stubbed, but keep the hook structure):
```ts
import type { EpisodicPort, PortRef } from 'harnesys';

export type EpisodicOnCompactedInput = {
  episodic: EpisodicPort;
  workspaceId: string;
  threadId: string;
  episodicRef: PortRef | undefined;
};

export function createEpisodicOnCompacted(
  input: EpisodicOnCompactedInput,
): (range: { fromSeq: number; toSeq: number; compactionEntryId?: string }) => Promise<void> {
  return async (range) => {
    const ref = input.episodicRef;
    if (ref == null) return;
    if (!indexOnCompactEnabled(ref)) return;
    if (!input.episodic.index) return;
    await input.episodic.index({
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      fromSeq: range.fromSeq,
      toSeq: range.toSeq,
      compactionEntryId: range.compactionEntryId,
    });
  };
}

function indexOnCompactEnabled(ref: Exclude<PortRef, null>): boolean {
  const value = ref.spec?.indexOnCompact;
  return value !== false;
}
```

- [ ] **Step 4: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 11: CompactThreadUseCase — Stub as No-Op

**Files:**
- Modify: `apps/studio/server/application/threads/compact-thread.use-case.ts`

**Interfaces:**
- Produces: `CompactThreadResponse` (stub)

- [ ] **Step 1: Rewrite as no-op stub**

```ts
import type { CompactThreadResponse } from '../../../shared/thread.ts';

export type CompactThreadRequest = {
  threadId: string;
};

export type CompactThreadInput = {
  execute(request: CompactThreadRequest): Promise<CompactThreadResponse>;
};

export class CompactThreadUseCase implements CompactThreadInput {
  async execute(_request: CompactThreadRequest): Promise<CompactThreadResponse> {
    // Stub: compaction will be re-added in 0.8.0 with host tools
    return { compacted: false };
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 12: Wire-Memory — Adapt for RuntimeState

**Files:**
- Modify: `apps/studio/server/composition/wire-memory.ts`

**Interfaces:**
- Consumes: `RuntimeStateRepository` instead of `JournalRepository`
- Produces: `StudioMemoryPorts`

- [ ] **Step 1: Update imports**

Replace `JournalRepository` with `RuntimeStateRepository`:
```ts
import type { RuntimeStateRepository } from '../domain/runtime-state.port.ts';
```

- [ ] **Step 2: Update CreateStudioMemoryDeps**

```ts
export type CreateStudioMemoryDeps = {
  runtimeState: RuntimeStateRepository;
  providers: LlmProviderRepository;
  models: LlmModelRepository;
  workspaces: WorkspaceRepository;
  filesWatcher?: import('../domain/files-watcher.port.ts').FilesWatcherInput;
};
```

- [ ] **Step 3: Update createStudioMemory**

Pass `runtimeState` to `SqliteEpisodicPort`:
```ts
const episodic = new SqliteEpisodicPort(db, {
  backend: 'fts',
  embeddings,
});
```

- [ ] **Step 4: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 13: Composition — Wire Everything Together

**Files:**
- Modify: `apps/studio/server/composition/studio.ts`

**Interfaces:**
- Consumes: All new/modified components
- Produces: Working Studio app

- [ ] **Step 1: Update imports**

Replace journal imports with runtime-state:
```ts
import { SqliteRuntimeState } from '../adapters/store/sqlite/repos/sqlite-runtime-state.repo.ts';
import type { RuntimeStateRepository } from '../domain/runtime-state.port.ts';
```

- [ ] **Step 2: Create RuntimeState factory**

After DB setup:
```ts
const runtimeStateFactory = {
  forState(threadId: string): SqliteRuntimeState {
    return new SqliteRuntimeState(db, threadId);
  },
  deleteByThread(threadId: string): void {
    // Delete snapshots + events for thread
  },
};
```

- [ ] **Step 3: Update ThreadRuntimeRegistry construction**

```ts
const threadRegistry = new ThreadRuntimeRegistry(runtimeStateFactory);
```

- [ ] **Step 4: Update wire-memory call**

```ts
const memory = createStudioMemory(db, {
  runtimeState: runtimeStateFactory,
  providers: llmProviderRepo,
  models: llmModelRepo,
  workspaces: workspaceRepo,
  filesWatcher,
});
```

- [ ] **Step 5: Update SendThreadRunUseCase construction**

Remove `journal` and `episodic` from deps:
```ts
const sendThreadRun = new SendThreadRunUseCase({
  threads: threadRepo,
  agents: agentRepo,
  models: llmModelRepo,
  providers: llmProviderRepo,
  workspaces: workspaceRepo,
  attachments: attachmentRepo,
  workspaceHarnesys,
  registry: threadRegistry,
  activeRuns,
  deskEvents,
  getThread,
  getThreadPlan,
});
```

- [ ] **Step 6: Update ResumeThreadRunUseCase construction**

Remove `journal` and `episodic` from deps:
```ts
const resumeThreadRun = new ResumeThreadRunUseCase({
  threads: threadRepo,
  agents: agentRepo,
  models: llmModelRepo,
  providers: llmProviderRepo,
  workspaces: workspaceRepo,
  schedules: scheduleRepo,
  workspaceHarnesys,
  registry: threadRegistry,
  activeRuns,
  deskEvents,
  getThread,
});
```

- [ ] **Step 7: Remove DeleteThreadEntryUseCase**

Remove from ThreadController deps and construction.

- [ ] **Step 8: Update ThreadController construction**

Remove `deleteThreadEntry` from deps.

- [ ] **Step 9: Verify compilation**

Run: `cd apps/studio && bun run tsc --noEmit`

---

### Task 14: Final Verification

- [ ] **Step 1: Run full type check**

Run: `bun run tsc --noEmit` from repo root

- [ ] **Step 2: Run biome lint**

Run: `bun run biome check .`

- [ ] **Step 3: Verify no journal references remain**

Run: `grep -r "journal" apps/studio/server --include="*.ts" -l`
Expected: Only memory-related files (episodic, entry-text) and bootstrap (drop statements)

- [ ] **Step 4: Verify no StreamEvent references remain**

Run: `grep -r "StreamEvent" apps/studio --include="*.ts" -l`
Expected: No results

---

## Execution Order

Tasks must be executed in this order due to dependencies:

1. Task 1 (Schema) → Task 2 (Bootstrap)
2. Task 3 (RuntimeState) → Task 4 (Registry)
3. Task 5 (Shared Types) → Task 6 (Send) → Task 7 (Resume)
4. Task 8 (Drain/Active) → Task 9 (Controller)
5. Task 10 (Memory) → Task 11 (Compact stub)
6. Task 12 (Wire-memory) → Task 13 (Composition)
7. Task 14 (Final verification)

Tasks 1-2 can be done first. Tasks 3-4 depend on 1-2. Tasks 5-9 can be done in parallel after 3-4. Tasks 10-11 can be done in parallel with 5-9. Tasks 12-13 depend on all previous. Task 14 is final.
