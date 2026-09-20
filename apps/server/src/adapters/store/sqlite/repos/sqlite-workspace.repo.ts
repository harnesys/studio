import { eq } from 'drizzle-orm';
import { NotFoundError } from '../../../../domain/studio.error.ts';
import type {
  Workspace,
  WorkspaceInsert,
  WorkspacePatch,
  WorkspaceRepository,
} from '../../../../domain/workspace.port.ts';
import type { StudioDb } from '../connection.ts';
import { mapSqliteError } from '../errors.ts';
import { type WorkspaceRow, workspacesTable } from '../schema';
export class SqliteWorkspaceRepo implements WorkspaceRepository {
  constructor(private readonly db: StudioDb) {}
  list(): Workspace[] {
    return this.db
      .select()
      .from(workspacesTable)
      .orderBy(workspacesTable.createdAt)
      .all()
      .map(toWorkspace);
  }
  findById(id: string): Workspace | undefined {
    const row = this.db.select().from(workspacesTable).where(eq(workspacesTable.id, id)).get();
    return row ? toWorkspace(row) : undefined;
  }
  insert(rec: WorkspaceInsert): Workspace {
    try {
      const row = this.db.insert(workspacesTable).values(rec).returning().get();
      return toWorkspace(row);
    } catch (err) {
      return mapSqliteError(err, { conflict: 'workspace exists' });
    }
  }
  update(id: string, patch: WorkspacePatch): Workspace {
    try {
      const row = this.db
        .update(workspacesTable)
        .set(patch)
        .where(eq(workspacesTable.id, id))
        .returning()
        .get();
      if (!row) {
        throw new NotFoundError('workspace not found');
      }
      return toWorkspace(row);
    } catch (err) {
      return mapSqliteError(err, { conflict: 'workspace exists' });
    }
  }
  delete(id: string): void {
    this.db.delete(workspacesTable).where(eq(workspacesTable.id, id)).run();
  }
}
function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    createdAt: row.createdAt,
    color: row.color ?? null,
  };
}
