import { eq, inArray } from 'drizzle-orm';
import {
  type AgentStep,
  isAgentEntry,
  type Journal,
  type JournalEntry,
  type StreamEvent,
} from 'harnesys';
import type { JournalRepository } from '../../../../domain/journal.port.ts';
import type { StudioDb } from '../connection.ts';
import { mapSqliteError } from '../errors.ts';
import { journalEntriesTable } from '../schema/journal-entries.ts';
import { journalStepsTable } from '../schema/journal-steps.ts';
import { readJournalBranch, writeJournalBranch } from './journal-branch.ts';
import {
  entryBodyJson,
  parseJsonObject,
  rowToEntry,
  rowToStep,
  stepBodyJson,
} from './sqlite-journal-map.ts';

export class SqliteJournalRepo implements JournalRepository {
  constructor(private readonly db: StudioDb) {}

  load(threadId: string): Journal {
    const entryRows = this.db
      .select()
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.threadId, threadId))
      .orderBy(journalEntriesTable.seq)
      .all();

    const branch = readJournalBranch(this.db, threadId);

    if (entryRows.length === 0) {
      return branch ? { entries: [], branch } : { entries: [] };
    }

    const entryIds = entryRows.map((r) => r.id);
    const stepRows = this.db
      .select()
      .from(journalStepsTable)
      .where(inArray(journalStepsTable.entryId, entryIds))
      .orderBy(journalStepsTable.seq)
      .all();

    const stepsByEntry = new Map<string, AgentStep[]>();
    for (const row of stepRows) {
      const list = stepsByEntry.get(row.entryId) ?? [];
      list.push(rowToStep(row));
      stepsByEntry.set(row.entryId, list);
    }

    return {
      entries: entryRows.map((row) => rowToEntry(row, stepsByEntry.get(row.id) ?? [])),
      branch,
    };
  }

  upsertEntry(threadId: string, entry: JournalEntry): void {
    try {
      const body = entryBodyJson(entry);
      this.db
        .insert(journalEntriesTable)
        .values({
          id: entry.id,
          threadId,
          seq: entry.seq,
          role: entry.role,
          createdAt: entry.createdAt,
          body,
        })
        .onConflictDoUpdate({
          target: journalEntriesTable.id,
          set: {
            threadId,
            seq: entry.seq,
            role: entry.role,
            createdAt: entry.createdAt,
            body,
          },
        })
        .run();

      if (isAgentEntry(entry)) {
        for (const step of entry.steps) {
          this.upsertStep(entry.id, step);
        }
      }
    } catch (err) {
      mapSqliteError(err, {
        conflict: 'duplicate journal entry seq',
        notFound: 'thread not found',
        invalid: 'invalid journal entry',
      });
    }
  }

  upsertStep(entryId: string, step: AgentStep): void {
    try {
      const body = stepBodyJson(step);
      this.db
        .insert(journalStepsTable)
        .values({
          id: step.id,
          entryId,
          seq: step.seq,
          type: step.type,
          status: step.status,
          createdAt: step.createdAt,
          startedAt: step.startedAt ?? null,
          completedAt: step.completedAt ?? null,
          body,
        })
        .onConflictDoUpdate({
          target: journalStepsTable.id,
          set: {
            entryId,
            seq: step.seq,
            type: step.type,
            status: step.status,
            createdAt: step.createdAt,
            startedAt: step.startedAt ?? null,
            completedAt: step.completedAt ?? null,
            body,
          },
        })
        .run();
    } catch (err) {
      mapSqliteError(err, {
        conflict: 'duplicate journal step seq',
        notFound: 'journal entry not found',
        invalid: 'invalid journal step',
      });
    }
  }

  applyCheckpoint(entryId: string, stepId: string, text: string): void {
    const row = this.db
      .select()
      .from(journalStepsTable)
      .where(eq(journalStepsTable.id, stepId))
      .get();
    if (!row || row.entryId !== entryId) {
      return;
    }
    const body = parseJsonObject(row.body);
    const prevPayload =
      body.payload && typeof body.payload === 'object'
        ? (body.payload as Record<string, unknown>)
        : {};
    const next = { ...body, payload: { ...prevPayload, text } };
    this.db
      .update(journalStepsTable)
      .set({ body: JSON.stringify(next) })
      .where(eq(journalStepsTable.id, stepId))
      .run();
  }

  applyEvent(threadId: string, event: StreamEvent): void {
    if (event.type === 'entry') {
      this.upsertEntry(threadId, event.entry);
      return;
    }
    if (event.type === 'step') {
      this.upsertStep(event.entryId, event.step);
      return;
    }
    if (event.checkpoint) {
      this.applyCheckpoint(event.entryId, event.stepId, event.checkpoint.text);
    }
  }

  saveSnapshot(threadId: string, journal: Journal): void {
    this.db.delete(journalEntriesTable).where(eq(journalEntriesTable.threadId, threadId)).run();
    for (const entry of journal.entries) {
      this.upsertEntry(threadId, entry);
    }
    writeJournalBranch(this.db, threadId, journal.branch);
  }
}
