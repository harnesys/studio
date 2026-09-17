import { and, eq } from 'drizzle-orm';
import type {
  LlmProvider,
  LlmProviderInsert,
  LlmProviderPatch,
  LlmProviderRepository,
} from '../../../../domain/llm-provider.port.ts';
import { NotFoundError } from '../../../../domain/studio.error.ts';
import type { StudioDb } from '../connection.ts';
import { mapSqliteError } from '../errors.ts';
import { type LlmProviderRow, llmProvidersTable } from '../schema';

export class SqliteLlmProviderRepo implements LlmProviderRepository {
  constructor(private readonly db: StudioDb) {}

  list(workspaceId: string): LlmProvider[] {
    return this.db
      .select()
      .from(llmProvidersTable)
      .where(eq(llmProvidersTable.workspaceId, workspaceId))
      .all()
      .map(toProvider);
  }

  findById(workspaceId: string, id: string): LlmProvider | undefined {
    const row = this.db
      .select()
      .from(llmProvidersTable)
      .where(and(eq(llmProvidersTable.workspaceId, workspaceId), eq(llmProvidersTable.id, id)))
      .get();
    return row ? toProvider(row) : undefined;
  }

  findByName(workspaceId: string, name: string): LlmProvider | undefined {
    const row = this.db
      .select()
      .from(llmProvidersTable)
      .where(and(eq(llmProvidersTable.workspaceId, workspaceId), eq(llmProvidersTable.name, name)))
      .get();
    return row ? toProvider(row) : undefined;
  }

  insert(rec: LlmProviderInsert): LlmProvider {
    try {
      const row = this.db
        .insert(llmProvidersTable)
        .values({ ...rec, headers: JSON.stringify(rec.headers) })
        .returning()
        .get();
      return toProvider(row);
    } catch (err) {
      return mapSqliteError(err, { conflict: 'provider exists' });
    }
  }

  update(workspaceId: string, id: string, patch: LlmProviderPatch): LlmProvider {
    try {
      const { headers, ...rest } = patch;
      const dbPatch = headers !== undefined ? { ...rest, headers: JSON.stringify(headers) } : rest;
      const row = this.db
        .update(llmProvidersTable)
        .set(dbPatch)
        .where(and(eq(llmProvidersTable.workspaceId, workspaceId), eq(llmProvidersTable.id, id)))
        .returning()
        .get();
      if (!row) {
        throw new NotFoundError('provider not found');
      }
      return toProvider(row);
    } catch (err) {
      return mapSqliteError(err, { conflict: 'provider exists' });
    }
  }

  delete(workspaceId: string, id: string): void {
    this.db
      .delete(llmProvidersTable)
      .where(and(eq(llmProvidersTable.workspaceId, workspaceId), eq(llmProvidersTable.id, id)))
      .run();
  }
}

function toProvider(row: LlmProviderRow): LlmProvider {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    driver: row.driver,
    apiUrl: row.apiUrl,
    apiKey: row.apiKey,
    headers: JSON.parse(row.headers) as Record<string, string>,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
