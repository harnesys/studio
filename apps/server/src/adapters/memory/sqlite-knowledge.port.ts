import { and, count, eq } from 'drizzle-orm';
import type {
  KnowledgeHit,
  KnowledgePort,
  KnowledgeReadInput,
  KnowledgeReadResult,
  KnowledgeReindexInput,
  KnowledgeSearchInput,
} from 'harnesys';
import type {
  KnowledgeFileRecord,
  KnowledgeFileStatus,
  KnowledgeFilesByStatus,
  KnowledgeIndexState,
  KnowledgeRootRecord,
  KnowledgeRootsPort,
  KnowledgeSettings,
  UpsertKnowledgeRootInput,
  UpsertKnowledgeSettingsRequest,
} from '../../domain/knowledge-roots.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { StudioDb } from '../store/sqlite/connection.ts';
import {
  type KnowledgeRootRow,
  knowledgeChunksTable,
  knowledgeRootsTable,
} from '../store/sqlite/schema';
import type { EmbeddingsPort, StudioEmbeddingsDeps } from './embeddings.ts';
import { embeddingsForSettings } from './knowledge-embeddings.ts';
import type { SqliteKnowledgeIndexRepo } from './knowledge-index-repo.ts';
import type { KnowledgeIndexer } from './knowledge-indexer.ts';
import { searchKnowledgeFts, searchKnowledgeVector } from './knowledge-search.ts';
import type { MemorySearchBackend } from './memory-backend.ts';
export type SqliteKnowledgePortOptions = {
  backend?: MemorySearchBackend;
  embeddings?: EmbeddingsPort;
  embeddingsDeps?: StudioEmbeddingsDeps;
  topK?: number;
  resolveWorkspacePath: (workspaceId: string) => string | undefined;
  indexRepo?: SqliteKnowledgeIndexRepo;
  indexer?: KnowledgeIndexer;
};
export class SqliteKnowledgePort implements KnowledgePort, KnowledgeRootsPort {
  private backend: MemorySearchBackend;
  private embeddings: EmbeddingsPort | undefined;
  private topK: number;
  private indexRepo: SqliteKnowledgeIndexRepo | undefined;
  private indexer: KnowledgeIndexer | undefined;
  constructor(
    private readonly db: StudioDb,
    private readonly options: SqliteKnowledgePortOptions,
  ) {
    this.backend = options.backend ?? 'fts';
    this.embeddings = options.embeddings;
    this.topK = options.topK ?? 5;
    this.indexRepo = options.indexRepo;
    this.indexer = options.indexer;
  }
  setBackend(backend: MemorySearchBackend): void {
    this.backend = backend;
  }
  setEmbeddings(embeddings: EmbeddingsPort | undefined): void {
    this.embeddings = embeddings;
    this.indexer?.setEmbeddings(embeddings);
  }
  setIndexer(indexer: KnowledgeIndexer, indexRepo?: SqliteKnowledgeIndexRepo): void {
    this.indexer = indexer;
    if (indexRepo) {
      this.indexRepo = indexRepo;
    }
  }
  getSettings(workspaceId: string): KnowledgeSettings {
    return this.requireIndexRepo().getSettingsOrDefault(workspaceId);
  }
  putSettings(workspaceId: string, patch: UpsertKnowledgeSettingsRequest): KnowledgeSettings {
    return this.requireIndexRepo().putSettings(workspaceId, patch);
  }
  getIndexState(workspaceId: string): KnowledgeIndexState {
    return this.indexer?.getState(workspaceId) ?? this.requireIndexRepo().getState(workspaceId);
  }
  listFiles(workspaceId: string, status?: KnowledgeFileStatus): KnowledgeFileRecord[] {
    return this.requireIndexRepo().listFiles(workspaceId, status);
  }
  countFilesByStatus(workspaceId: string): KnowledgeFilesByStatus {
    return this.requireIndexRepo().countFilesByStatus(workspaceId);
  }
  async startReindex(workspaceId: string): Promise<KnowledgeIndexState> {
    const indexer = this.requireIndexerAndPath(workspaceId);
    this.applyWorkspaceBackend(workspaceId);
    await indexer.startFullReindex(workspaceId);
    return this.getIndexState(workspaceId);
  }
  cancelIndex(workspaceId: string): KnowledgeIndexState {
    const indexer = this.requireIndexerAndPath(workspaceId);
    indexer.cancel(workspaceId);
    return this.getIndexState(workspaceId);
  }
  listRoots(workspaceId: string): KnowledgeRootRecord[] {
    return this.db
      .select()
      .from(knowledgeRootsTable)
      .where(eq(knowledgeRootsTable.workspaceId, workspaceId))
      .all()
      .map(toRootRecord);
  }
  upsertRoot(input: UpsertKnowledgeRootInput): KnowledgeRootRecord {
    const enabled = input.enabled ?? true;
    const existing = this.db
      .select()
      .from(knowledgeRootsTable)
      .where(
        and(
          eq(knowledgeRootsTable.workspaceId, input.workspaceId),
          eq(knowledgeRootsTable.path, input.path),
        ),
      )
      .get();
    if (existing) {
      const row = this.db
        .update(knowledgeRootsTable)
        .set({ enabled })
        .where(
          and(
            eq(knowledgeRootsTable.workspaceId, input.workspaceId),
            eq(knowledgeRootsTable.path, input.path),
          ),
        )
        .returning()
        .get();
      return toRootRecord(row);
    }
    const row = this.db
      .insert(knowledgeRootsTable)
      .values({ workspaceId: input.workspaceId, path: input.path, enabled })
      .returning()
      .get();
    return toRootRecord(row);
  }
  deleteRoot(workspaceId: string, path: string): void {
    this.db
      .delete(knowledgeRootsTable)
      .where(
        and(eq(knowledgeRootsTable.workspaceId, workspaceId), eq(knowledgeRootsTable.path, path)),
      )
      .run();
  }
  countChunks(workspaceId: string): number {
    const row = this.db
      .select({ value: count() })
      .from(knowledgeChunksTable)
      .where(eq(knowledgeChunksTable.workspaceId, workspaceId))
      .get();
    return row?.value ?? 0;
  }
  search(input: KnowledgeSearchInput): Promise<KnowledgeHit[]> {
    const limit = input.limit ?? this.topK;
    const backend = this.applyWorkspaceBackend(input.workspaceId);
    if (backend === 'vector') {
      return searchKnowledgeVector({
        db: this.db,
        workspaceId: input.workspaceId,
        query: input.query,
        limit,
        embeddings: this.resolveEmbeddings(input.workspaceId),
      });
    }
    return Promise.resolve(searchKnowledgeFts(this.db, input.workspaceId, input.query, limit));
  }
  read(input: KnowledgeReadInput): Promise<KnowledgeReadResult> {
    const row = this.db
      .select()
      .from(knowledgeChunksTable)
      .where(
        and(
          eq(knowledgeChunksTable.id, input.id),
          eq(knowledgeChunksTable.workspaceId, input.workspaceId),
        ),
      )
      .get();
    if (!row) {
      return Promise.reject(new NotFoundError('knowledge chunk not found'));
    }
    return Promise.resolve({
      id: row.id,
      text: row.text,
      ...(row.uri ? { uri: row.uri } : {}),
    });
  }
  async reindex(input: KnowledgeReindexInput): Promise<void> {
    const indexer = this.requireIndexerAndPath(input.workspaceId);
    this.applyWorkspaceBackend(input.workspaceId);
    await indexer.reindexAndWait(input.workspaceId);
  }
  private applyWorkspaceBackend(workspaceId: string): MemorySearchBackend {
    const settings = this.indexRepo?.getSettingsOrDefault(workspaceId);
    const backend = settings?.backend ?? this.backend;
    this.setBackend(backend);
    return backend;
  }
  private resolveEmbeddings(workspaceId: string): EmbeddingsPort | undefined {
    const settings = this.indexRepo?.getSettingsOrDefault(workspaceId);
    if (settings && this.options.embeddingsDeps) {
      return embeddingsForSettings(this.options.embeddingsDeps, settings, workspaceId);
    }
    return this.embeddings;
  }
  private requireIndexRepo(): SqliteKnowledgeIndexRepo {
    if (!this.indexRepo) {
      throw new ValidationError('knowledge index repo is not configured');
    }
    return this.indexRepo;
  }
  private requireIndexerAndPath(workspaceId: string): KnowledgeIndexer {
    if (!this.indexer) {
      throw new ValidationError('knowledge indexer is not configured');
    }
    if (!this.options.resolveWorkspacePath(workspaceId)) {
      throw new NotFoundError('workspace not found');
    }
    return this.indexer;
  }
}
function toRootRecord(row: KnowledgeRootRow): KnowledgeRootRecord {
  return { workspaceId: row.workspaceId, path: row.path, enabled: row.enabled };
}
