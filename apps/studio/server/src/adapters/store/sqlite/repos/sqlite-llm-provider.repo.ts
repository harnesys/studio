import { eq } from 'drizzle-orm';
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

  list(): LlmProvider[] {
    return this.db.select().from(llmProvidersTable).all().map(toProvider);
  }

  findById(id: string): LlmProvider | undefined {
    const row = this.db.select().from(llmProvidersTable).where(eq(llmProvidersTable.id, id)).get();
    return row ? toProvider(row) : undefined;
  }

  findByName(name: string): LlmProvider | undefined {
    const row = this.db
      .select()
      .from(llmProvidersTable)
      .where(eq(llmProvidersTable.name, name))
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

  update(id: string, patch: LlmProviderPatch): LlmProvider {
    try {
      const { headers, ...rest } = patch;
      const dbPatch = headers !== undefined ? { ...rest, headers: JSON.stringify(headers) } : rest;
      const row = this.db
        .update(llmProvidersTable)
        .set(dbPatch)
        .where(eq(llmProvidersTable.id, id))
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

  delete(id: string): void {
    this.db.delete(llmProvidersTable).where(eq(llmProvidersTable.id, id)).run();
  }
}

function toProvider(row: LlmProviderRow): LlmProvider {
  return {
    id: row.id,
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
