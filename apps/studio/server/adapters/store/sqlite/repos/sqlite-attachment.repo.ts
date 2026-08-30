import { and, eq, inArray, isNull } from 'drizzle-orm';
import type {
  Attachment,
  AttachmentInsert,
  AttachmentRepository,
} from '../../../../domain/attachment.port.ts';
import type { StudioDb } from '../connection.ts';
import { mapSqliteError } from '../errors.ts';
import { type AttachmentRow, attachmentsTable, threadsTable } from '../schema/index.ts';

export class SqliteAttachmentRepo implements AttachmentRepository {
  constructor(private readonly db: StudioDb) {}

  listByThread(threadId: string): Attachment[] {
    return this.db
      .select()
      .from(attachmentsTable)
      .where(eq(attachmentsTable.threadId, threadId))
      .all()
      .map(toAttachment);
  }

  listPending(threadId: string): Attachment[] {
    return this.db
      .select()
      .from(attachmentsTable)
      .where(and(eq(attachmentsTable.threadId, threadId), isNull(attachmentsTable.entryId)))
      .all()
      .map(toAttachment);
  }

  findById(id: string): Attachment | undefined {
    const row = this.db.select().from(attachmentsTable).where(eq(attachmentsTable.id, id)).get();
    return row ? toAttachment(row) : undefined;
  }

  insert(rec: AttachmentInsert): Attachment {
    try {
      const row = this.db.insert(attachmentsTable).values(rec).returning().get();
      return toAttachment(row);
    } catch (err) {
      return mapSqliteError(err, { notFound: 'thread not found' });
    }
  }

  attach(entryId: string, ids: string[], threadId: string): void {
    if (ids.length === 0) {
      return;
    }
    try {
      this.db
        .update(attachmentsTable)
        .set({ entryId })
        .where(and(eq(attachmentsTable.threadId, threadId), inArray(attachmentsTable.id, ids)))
        .run();
    } catch (err) {
      mapSqliteError(err, { notFound: 'entry not found' });
    }
  }

  delete(id: string): void {
    this.db.delete(attachmentsTable).where(eq(attachmentsTable.id, id)).run();
  }

  deleteByWorkspace(workspaceId: string, threadIds?: string[]): void {
    if (threadIds) {
      if (threadIds.length === 0) {
        return;
      }
      this.db.delete(attachmentsTable).where(inArray(attachmentsTable.threadId, threadIds)).run();
      return;
    }
    const threads = this.db
      .select({ id: threadsTable.id })
      .from(threadsTable)
      .where(eq(threadsTable.workspaceId, workspaceId))
      .all();
    const ids = threads.map((t) => t.id);
    if (ids.length > 0) {
      this.db.delete(attachmentsTable).where(inArray(attachmentsTable.threadId, ids)).run();
    }
  }
}

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    threadId: row.threadId,
    entryId: row.entryId ?? null,
    name: row.name,
    mediaType: row.mediaType,
    path: row.path,
    bytes: row.bytes,
    kind: row.kind,
    createdAt: row.createdAt,
  };
}
