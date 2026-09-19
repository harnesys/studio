import { and, eq, sql } from 'drizzle-orm';
import type { StudioDb } from '../store/sqlite/connection.ts';
import {
  type KnowledgeFileRow,
  knowledgeChunksTable,
  knowledgeFilesTable,
} from '../store/sqlite/schema';
import {
  bumpProcessed as bumpProcessedRow,
  getIndexState,
  getSettingsOrDefault,
  putSettings as putSettingsRow,
  upsertIndexState,
} from './knowledge-index-settings.ts';
import type {
  KnowledgeFileRecord,
  KnowledgeFileStatus,
  KnowledgeFilesByStatus,
  KnowledgeIndexStatePatch,
  KnowledgeIndexStateRecord,
  KnowledgeSettingsRecord,
  UpsertKnowledgeFileInput,
  UpsertKnowledgeSettingsRequest,
} from './knowledge-index-types.ts';
export type KnowledgeChunkInsertInput = {
  id: string;
  workspaceId: string;
  uri: string;
  title: string;
  text: string;
  embedding: Buffer | null;
  updatedAt: string;
};
export class SqliteKnowledgeIndexRepo {
  constructor(private readonly db: StudioDb) {}
  getSettingsOrDefault(workspaceId: string): KnowledgeSettingsRecord {
    return getSettingsOrDefault(this.db, workspaceId);
  }
  putSettings(workspaceId: string, patch: UpsertKnowledgeSettingsRequest): KnowledgeSettingsRecord {
    return putSettingsRow(this.db, workspaceId, patch);
  }
  getState(workspaceId: string): KnowledgeIndexStateRecord {
    return getIndexState(this.db, workspaceId);
  }
  upsertState(workspaceId: string, patch: KnowledgeIndexStatePatch): KnowledgeIndexStateRecord {
    return upsertIndexState(this.db, workspaceId, patch);
  }
  bumpProcessed(workspaceId: string): void {
    bumpProcessedRow(this.db, workspaceId);
  }
  listFiles(workspaceId: string, status?: KnowledgeFileStatus): KnowledgeFileRecord[] {
    const rows =
      status === undefined
        ? this.db
            .select()
            .from(knowledgeFilesTable)
            .where(eq(knowledgeFilesTable.workspaceId, workspaceId))
            .all()
        : this.db
            .select()
            .from(knowledgeFilesTable)
            .where(
              and(
                eq(knowledgeFilesTable.workspaceId, workspaceId),
                eq(knowledgeFilesTable.status, status),
              ),
            )
            .all();
    return rows.map(toFile);
  }
  countFilesByStatus(workspaceId: string): KnowledgeFilesByStatus {
    const rows = this.db
      .select({
        status: knowledgeFilesTable.status,
        value: sql<number>`count(*)`,
      })
      .from(knowledgeFilesTable)
      .where(eq(knowledgeFilesTable.workspaceId, workspaceId))
      .groupBy(knowledgeFilesTable.status)
      .all();
    const out: KnowledgeFilesByStatus = { pending: 0, indexed: 0, skipped: 0, error: 0 };
    for (const row of rows) {
      out[row.status] = Number(row.value);
    }
    return out;
  }
  getFile(workspaceId: string, uri: string): KnowledgeFileRecord | undefined {
    const row = this.db
      .select()
      .from(knowledgeFilesTable)
      .where(
        and(eq(knowledgeFilesTable.workspaceId, workspaceId), eq(knowledgeFilesTable.uri, uri)),
      )
      .get();
    return row ? toFile(row) : undefined;
  }
  uriHasEmbeddings(workspaceId: string, uri: string): boolean {
    const row = this.db
      .select({ id: knowledgeChunksTable.id })
      .from(knowledgeChunksTable)
      .where(
        and(
          eq(knowledgeChunksTable.workspaceId, workspaceId),
          eq(knowledgeChunksTable.uri, uri),
          sql`${knowledgeChunksTable.embedding} IS NOT NULL`,
        ),
      )
      .get();
    return row != null;
  }
  upsertFile(input: UpsertKnowledgeFileInput): void {
    this.db
      .insert(knowledgeFilesTable)
      .values({
        workspaceId: input.workspaceId,
        uri: input.uri,
        status: input.status,
        skipReason: input.skipReason ?? null,
        mtimeMs: input.mtimeMs ?? null,
        sizeBytes: input.sizeBytes ?? null,
        contentHash: input.contentHash ?? null,
        chunkCount: input.chunkCount ?? 0,
        lastError: input.lastError ?? null,
        updatedAt: input.updatedAt,
      })
      .onConflictDoUpdate({
        target: [knowledgeFilesTable.workspaceId, knowledgeFilesTable.uri],
        set: {
          status: input.status,
          skipReason: input.skipReason ?? null,
          mtimeMs: input.mtimeMs ?? null,
          sizeBytes: input.sizeBytes ?? null,
          contentHash: input.contentHash ?? null,
          chunkCount: input.chunkCount ?? 0,
          lastError: input.lastError ?? null,
          updatedAt: input.updatedAt,
        },
      })
      .run();
  }
  listFileUris(workspaceId: string): string[] {
    return this.db
      .select({ uri: knowledgeFilesTable.uri })
      .from(knowledgeFilesTable)
      .where(eq(knowledgeFilesTable.workspaceId, workspaceId))
      .all()
      .map((row) => row.uri);
  }
  deleteFileAndChunks(workspaceId: string, uri: string): void {
    const variants = new Set([uri, uri.normalize('NFC'), uri.normalize('NFD')]);
    for (const v of variants) {
      this.deleteChunksForUri(workspaceId, v);
      this.db
        .delete(knowledgeFilesTable)
        .where(
          and(eq(knowledgeFilesTable.workspaceId, workspaceId), eq(knowledgeFilesTable.uri, v)),
        )
        .run();
    }
  }
  deleteUriPrefix(workspaceId: string, prefix: string): void {
    for (const uri of this.listFileUris(workspaceId)) {
      if (uri === prefix || uri.startsWith(`${prefix}/`)) {
        this.deleteFileAndChunks(workspaceId, uri);
      }
    }
  }
  purgeByFirstSegment(workspaceId: string, names: ReadonlySet<string>): void {
    for (const uri of this.listFileUris(workspaceId)) {
      const slash = uri.indexOf('/');
      const segment = slash === -1 ? uri : uri.slice(0, slash);
      if (names.has(segment)) {
        this.deleteFileAndChunks(workspaceId, uri);
      }
    }
  }
  deleteMissingFiles(workspaceId: string, seenUris: ReadonlySet<string>): void {
    const existing = this.listFileUris(workspaceId);
    for (const uri of existing) {
      if (!seenUris.has(uri)) {
        this.deleteFileAndChunks(workspaceId, uri);
      }
    }
  }
  deleteChunksForUri(workspaceId: string, uri: string): void {
    this.db
      .delete(knowledgeChunksTable)
      .where(
        and(eq(knowledgeChunksTable.workspaceId, workspaceId), eq(knowledgeChunksTable.uri, uri)),
      )
      .run();
  }
  deleteAllChunks(workspaceId: string): void {
    this.db
      .delete(knowledgeChunksTable)
      .where(eq(knowledgeChunksTable.workspaceId, workspaceId))
      .run();
  }
  deleteOrphanChunks(workspaceId: string, seenUris: ReadonlySet<string>): void {
    const chunkUris = this.db
      .selectDistinct({ uri: knowledgeChunksTable.uri })
      .from(knowledgeChunksTable)
      .where(eq(knowledgeChunksTable.workspaceId, workspaceId))
      .all()
      .map((r) => r.uri);
    const fileUris = new Set(this.listFileUris(workspaceId));
    for (const uri of chunkUris) {
      const normalized = uri.normalize('NFC');
      if (!seenUris.has(normalized) && !fileUris.has(uri) && !fileUris.has(normalized)) {
        this.deleteChunksForUri(workspaceId, uri);
        const alt = normalized !== uri ? normalized : undefined;
        if (alt) {
          this.deleteChunksForUri(workspaceId, alt);
        }
      }
    }
  }
  insertChunks(rows: KnowledgeChunkInsertInput[]): void {
    if (rows.length === 0) {
      return;
    }
    this.db.insert(knowledgeChunksTable).values(rows).run();
  }
}
function toFile(row: KnowledgeFileRow): KnowledgeFileRecord {
  return {
    workspaceId: row.workspaceId,
    uri: row.uri,
    status: row.status,
    skipReason: row.skipReason,
    mtimeMs: row.mtimeMs,
    sizeBytes: row.sizeBytes,
    contentHash: row.contentHash,
    chunkCount: row.chunkCount,
    lastError: row.lastError,
    updatedAt: row.updatedAt,
  };
}
