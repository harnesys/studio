import { eq } from 'drizzle-orm';
import type { JournalBranch } from 'harnesys';

import type { StudioDb } from '../connection.ts';
import { threadsTable } from '../schema/threads.ts';

export function readJournalBranch(db: StudioDb, threadId: string): JournalBranch | undefined {
  const row = db.select().from(threadsTable).where(eq(threadsTable.id, threadId)).get();
  if (!row) {
    return undefined;
  }
  const meta = parseMeta(row.metadata);
  const branch = meta.journalBranch;
  if (!branch || typeof branch !== 'object' || Array.isArray(branch)) {
    return undefined;
  }
  const record = branch as Record<string, unknown>;
  if (
    typeof record.fromThreadId !== 'string' ||
    typeof record.fromEntryId !== 'string' ||
    typeof record.fromSeq !== 'number'
  ) {
    return undefined;
  }
  return {
    fromThreadId: record.fromThreadId,
    fromEntryId: record.fromEntryId,
    fromSeq: record.fromSeq,
  };
}

export function writeJournalBranch(
  db: StudioDb,
  threadId: string,
  branch: JournalBranch | undefined,
): void {
  const row = db.select().from(threadsTable).where(eq(threadsTable.id, threadId)).get();
  if (!row) {
    return;
  }
  const meta = parseMeta(row.metadata);
  if (branch) {
    meta.journalBranch = branch;
  } else {
    delete meta.journalBranch;
  }
  db.update(threadsTable)
    .set({ metadata: JSON.stringify(meta) })
    .where(eq(threadsTable.id, threadId))
    .run();
}

function parseMeta(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
