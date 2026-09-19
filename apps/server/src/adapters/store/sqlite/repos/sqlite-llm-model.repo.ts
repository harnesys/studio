import { and, eq } from 'drizzle-orm';
import type {
  LlmModel,
  LlmModelInsert,
  LlmModelPatch,
  LlmModelRepository,
} from '../../../../domain/llm-provider.port.ts';
import { NotFoundError } from '../../../../domain/studio.error.ts';
import type { StudioDb } from '../connection.ts';
import { mapSqliteError } from '../errors.ts';
import { type LlmModelRow, llmModelsTable } from '../schema';
export class SqliteLlmModelRepo implements LlmModelRepository {
  constructor(private readonly db: StudioDb) {}
  listByProvider(providerId: string): LlmModel[] {
    return this.db
      .select()
      .from(llmModelsTable)
      .where(eq(llmModelsTable.providerId, providerId))
      .all()
      .map(toModel);
  }
  findById(id: string): LlmModel | undefined {
    const row = this.db.select().from(llmModelsTable).where(eq(llmModelsTable.id, id)).get();
    return row ? toModel(row) : undefined;
  }
  findByProviderAndName(providerId: string, name: string): LlmModel | undefined {
    const row = this.db
      .select()
      .from(llmModelsTable)
      .where(and(eq(llmModelsTable.providerId, providerId), eq(llmModelsTable.name, name)))
      .get();
    return row ? toModel(row) : undefined;
  }
  insert(rec: LlmModelInsert): LlmModel {
    try {
      const row = this.db
        .insert(llmModelsTable)
        .values({ ...rec, metadata: JSON.stringify(rec.metadata ?? {}) })
        .returning()
        .get();
      return toModel(row);
    } catch (err) {
      return mapSqliteError(err, { conflict: 'model exists in provider' });
    }
  }
  update(id: string, patch: LlmModelPatch): LlmModel {
    try {
      const { metadata, ...rest } = patch;
      const dbPatch =
        metadata !== undefined ? { ...rest, metadata: JSON.stringify(metadata) } : rest;
      const row = this.db
        .update(llmModelsTable)
        .set(dbPatch)
        .where(eq(llmModelsTable.id, id))
        .returning()
        .get();
      if (!row) {
        throw new NotFoundError('model not found');
      }
      return toModel(row);
    } catch (err) {
      return mapSqliteError(err, { conflict: 'model exists in provider' });
    }
  }
  delete(id: string): void {
    this.db.delete(llmModelsTable).where(eq(llmModelsTable.id, id)).run();
  }
}
function toModel(row: LlmModelRow): LlmModel {
  return {
    id: row.id,
    providerId: row.providerId,
    name: row.name,
    kind: row.kind,
    metadata: JSON.parse(row.metadata) as unknown,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
