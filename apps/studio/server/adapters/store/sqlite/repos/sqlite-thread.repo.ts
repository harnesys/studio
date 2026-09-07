import { eq } from 'drizzle-orm';
import { NotFoundError } from '../../../../domain/studio.error.ts';
import type { Thread, ThreadInsert, ThreadRepository } from '../../../../domain/thread.port.ts';
import type { StudioDb } from '../connection.ts';
import { mapSqliteError } from '../errors.ts';
import { type ThreadRow, threadsTable } from '../schema/index.ts';

export class SqliteThreadRepo implements ThreadRepository {
  constructor(private readonly db: StudioDb) {}

  listByWorkspace(workspaceId: string): Thread[] {
    return this.db
      .select()
      .from(threadsTable)
      .where(eq(threadsTable.workspaceId, workspaceId))
      .orderBy(threadsTable.updatedAt)
      .all()
      .map(toThread);
  }

  findById(id: string): Thread | undefined {
    const row = this.db.select().from(threadsTable).where(eq(threadsTable.id, id)).get();
    return row ? toThread(row) : undefined;
  }

  insert(rec: ThreadInsert): Thread {
    try {
      const row = this.db
        .insert(threadsTable)
        .values({ ...rec, metadata: JSON.stringify(rec.metadata ?? {}) })
        .returning()
        .get();
      return toThread(row);
    } catch (err) {
      return mapSqliteError(err, { notFound: 'workspace or agent not found' });
    }
  }

  updateTitle(id: string, title: string): Thread {
    const row = this.db
      .update(threadsTable)
      .set({ title, updatedAt: new Date().toISOString() })
      .where(eq(threadsTable.id, id))
      .returning()
      .get();
    if (!row) {
      throw new NotFoundError('thread not found');
    }
    return toThread(row);
  }

  setPinned(id: string, pinned: boolean): Thread {
    const current = this.findById(id);
    if (!current) {
      throw new NotFoundError('thread not found');
    }
    const meta = (
      typeof current.metadata === 'object' && current.metadata !== null ? current.metadata : {}
    ) as Record<string, unknown>;
    const row = this.db
      .update(threadsTable)
      .set({ metadata: JSON.stringify({ ...meta, pinned }) })
      .where(eq(threadsTable.id, id))
      .returning()
      .get();
    return toThread(row);
  }

  markRead(id: string): Thread {
    const current = this.findById(id);
    if (!current) {
      throw new NotFoundError('thread not found');
    }
    const row = this.db
      .update(threadsTable)
      .set({ lastReadAt: current.updatedAt })
      .where(eq(threadsTable.id, id))
      .returning()
      .get();
    if (!row) {
      throw new NotFoundError('thread not found');
    }
    return toThread(row);
  }

  touch(id: string): void {
    this.db
      .update(threadsTable)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(threadsTable.id, id))
      .run();
  }

  delete(id: string): void {
    this.db.delete(threadsTable).where(eq(threadsTable.id, id)).run();
  }

  deleteByAgent(agentId: string): void {
    this.db.delete(threadsTable).where(eq(threadsTable.agentId, agentId)).run();
  }

  deleteByWorkspace(workspaceId: string): void {
    this.db.delete(threadsTable).where(eq(threadsTable.workspaceId, workspaceId)).run();
  }
}

function toThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    title: row.title,
    kind: row.kind,
    metadata: JSON.parse(row.metadata) as unknown,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastReadAt: row.lastReadAt || row.updatedAt,
  };
}
