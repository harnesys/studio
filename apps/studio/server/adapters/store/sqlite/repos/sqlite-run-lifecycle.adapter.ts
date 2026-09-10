// biome-ignore-all lint/suspicious/useAwait: async required by RunLifecycleStore port contract
import { SQLiteError } from 'bun:sqlite';
import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
  codedRunError,
  type PendingSessionEvent,
  type RunCreateInput,
  type RunLifecycleStatus,
  type RunLifecycleStore,
  type RunRecord,
  type RunTransitionPatch,
  type SessionEvent,
} from 'harnesys';
import {
  ASK_TTL_DEFAULT_MS,
  DEFAULT_LIST_LIMIT,
  RUN_NON_TERMINAL_STATUSES,
} from '../../../../config/constants.ts';
import type { StudioDb } from '../connection.ts';
import { type RunRow, runsTable } from '../schema/runs.ts';

/** Task 5 seam: writes events inside the caller's transaction; seq выдаёт
 *  аллокатор стора (RunSeqAllocator), события с присвоенным seq сохраняются как есть. */
export type RunEventAppendWithinTx = (
  tx: StudioDb,
  runId: string,
  threadId: string,
  events: PendingSessionEvent[],
) => SessionEvent[];

type RunEventIdRow = { run_id: string };

function rowToRecord(row: RunRow): RunRecord {
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

function clientEventIdOf(event: PendingSessionEvent): string | undefined {
  return (event as { clientEventId?: string }).clientEventId;
}

function interruptIdOf(event: PendingSessionEvent | SessionEvent): string | undefined {
  return (event as { interruptId?: string }).interruptId;
}

function maxSeqOf(events: SessionEvent[], base: number): number {
  let max = base;
  for (const event of events) {
    const seq = (event as { seq?: number }).seq ?? 0;
    if (seq > max) {
      max = seq;
    }
  }
  return max;
}

function assertTransitionAllowed(
  record: RunRecord,
  expectedEpoch: number,
  patch: RunTransitionPatch,
): void {
  if (record.status === 'completed') {
    throw codedRunError('run_terminal', `run ${record.runId} is terminal`);
  }
  if (patch.to === 'queued' && record.status === 'queued') {
    throw codedRunError('already_queued', `run ${record.runId} is already queued`);
  }
  if (expectedEpoch !== record.leaseEpoch) {
    throw codedRunError('lease_stale', `run ${record.runId} epoch ${expectedEpoch} is stale`);
  }
  if (record.status !== patch.from) {
    throw codedRunError('already_resumed', `run ${record.runId} is ${record.status}`);
  }
  if (patch.to === 'queued' && record.interruptId !== undefined) {
    const first = patch.events?.[0];
    if (record.interruptId !== (first ? interruptIdOf(first) : undefined)) {
      throw codedRunError('unknown_interrupt', `run ${record.runId} interrupt mismatch`);
    }
  }
}

export class SqliteRunLifecycleStore implements RunLifecycleStore {
  constructor(
    private readonly db: StudioDb,
    private readonly appendWithinTx: RunEventAppendWithinTx,
  ) {}

  async create(run: RunCreateInput, events: PendingSessionEvent[] = []): Promise<RunRecord> {
    return this.db.transaction((tx) => {
      for (const event of events) {
        const clientEventId = clientEventIdOf(event);
        if (clientEventId === undefined) {
          continue;
        }
        const found = tx.get<RunEventIdRow>(
          sql`SELECT run_id FROM run_events WHERE thread_id = ${run.threadId} AND client_event_id = ${clientEventId} LIMIT 1`,
        );
        if (found) {
          const existing = tx
            .select()
            .from(runsTable)
            .where(eq(runsTable.runId, found.run_id))
            .get();
          if (existing) {
            return rowToRecord(existing);
          }
        }
      }
      const now = new Date().toISOString();
      try {
        tx.insert(runsTable)
          .values({
            runId: run.runId,
            threadId: run.threadId,
            status: 'queued',
            parentRunId: run.parentRunId,
            attempt: 1,
            leaseEpoch: 0,
            lastSeq: 0,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      } catch (err) {
        if (err instanceof SQLiteError && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw codedRunError('thread_busy', 'thread already has an active run');
        }
        throw err;
      }
      if (events.length > 0) {
        const stored = this.appendWithinTx(tx as StudioDb, run.runId, run.threadId, events);
        tx.update(runsTable)
          .set({ lastSeq: maxSeqOf(stored, 0), updatedAt: new Date().toISOString() })
          .where(eq(runsTable.runId, run.runId))
          .run();
      }
      const row = tx.select().from(runsTable).where(eq(runsTable.runId, run.runId)).get();
      if (!row) {
        throw codedRunError('unknown_run', `run ${run.runId} not found`);
      }
      return rowToRecord(row);
    });
  }

  async get(runId: string): Promise<RunRecord | null> {
    const row = this.db.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
    return row ? rowToRecord(row) : null;
  }

  async activeByThread(threadId: string): Promise<RunRecord | null> {
    const row = this.db
      .select()
      .from(runsTable)
      .where(
        and(
          eq(runsTable.threadId, threadId),
          isNull(runsTable.parentRunId),
          inArray(runsTable.status, RUN_NON_TERMINAL_STATUSES),
        ),
      )
      .orderBy(desc(runsTable.createdAt))
      .limit(1)
      .get();
    return row ? rowToRecord(row) : null;
  }

  async childrenByParent(parentRunId: string): Promise<RunRecord[]> {
    return this.db
      .select()
      .from(runsTable)
      .where(eq(runsTable.parentRunId, parentRunId))
      .orderBy(asc(runsTable.createdAt))
      .all()
      .map(rowToRecord);
  }

  async claim(runId: string, instanceId: string, ttlMs: number): Promise<RunRecord | null> {
    const row = this.db
      .update(runsTable)
      .set({
        status: 'running',
        leaseInstanceId: instanceId,
        leaseExpiresAt: Date.now() + ttlMs,
        leaseEpoch: sql`lease_epoch + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(runsTable.runId, runId), eq(runsTable.status, 'queued')))
      .returning()
      .get();
    return row ? rowToRecord(row) : null;
  }

  async transition(
    runId: string,
    expectedEpoch: number,
    patch: RunTransitionPatch,
  ): Promise<RunRecord> {
    return this.db.transaction((tx) => {
      const current = tx.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
      if (!current) {
        throw codedRunError('unknown_run', `run ${runId} not found`);
      }
      const record = rowToRecord(current);
      assertTransitionAllowed(record, expectedEpoch, patch);
      const stored = this.appendWithinTx(
        tx as StudioDb,
        runId,
        record.threadId,
        patch.events ?? [],
      );
      const lastSeq = maxSeqOf(stored, record.lastSeq);
      tx.update(runsTable)
        .set({
          status: patch.to,
          interruptId:
            patch.interruptId === null ? null : (patch.interruptId ?? record.interruptId ?? null),
          attempt: patch.advanceAttempt ? record.attempt + 1 : record.attempt,
          leaseInstanceId: null,
          leaseExpiresAt: null,
          leaseEpoch: record.leaseEpoch + 1,
          lastSeq,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(runsTable.runId, runId))
        .run();
      const row = tx.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
      if (!row) {
        throw codedRunError('unknown_run', `run ${runId} not found`);
      }
      return rowToRecord(row);
    });
  }

  async renewLease(runId: string, instanceId: string, ttlMs: number): Promise<boolean> {
    const row = this.db.get<RunEventIdRow>(
      sql`UPDATE runs SET lease_expires_at = ${Date.now() + ttlMs}, updated_at = ${new Date().toISOString()} WHERE run_id = ${runId} AND lease_instance_id = ${instanceId} AND lease_epoch = (SELECT lease_epoch FROM runs WHERE run_id = ${runId}) RETURNING run_id`,
    );
    return row !== undefined;
  }

  async listClaimable(opts?: { limit?: number; before?: string }): Promise<RunRecord[]> {
    const conditions = [eq(runsTable.status, 'queued')];
    if (opts?.before !== undefined) {
      conditions.push(gt(runsTable.createdAt, opts.before));
    }
    return this.db
      .select()
      .from(runsTable)
      .where(and(...conditions))
      .orderBy(asc(runsTable.createdAt))
      .limit(opts?.limit ?? DEFAULT_LIST_LIMIT)
      .all()
      .map(rowToRecord);
  }

  async listExpiredAsks(opts?: {
    limit?: number;
    before?: string;
    olderThanMs?: number;
  }): Promise<RunRecord[]> {
    const threshold = new Date(
      Date.now() - (opts?.olderThanMs ?? ASK_TTL_DEFAULT_MS),
    ).toISOString();
    const conditions = [eq(runsTable.status, 'needs_input'), lt(runsTable.updatedAt, threshold)];
    if (opts?.before !== undefined) {
      conditions.push(gt(runsTable.updatedAt, opts.before));
    }
    return this.db
      .select()
      .from(runsTable)
      .where(and(...conditions))
      .orderBy(asc(runsTable.updatedAt))
      .limit(opts?.limit ?? DEFAULT_LIST_LIMIT)
      .all()
      .map(rowToRecord);
  }
}
