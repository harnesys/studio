import { and, eq, gte, lte } from 'drizzle-orm';
import type {
  EpisodicHit,
  EpisodicIndexInput,
  EpisodicPort,
  EpisodicSearchInput,
  SessionEvent,
} from 'harnesys';
import { ValidationError } from '../../domain/studio.error.ts';
import type { StudioDb } from '../store/sqlite/connection.ts';
import { episodicChunksTable } from '../store/sqlite/schema/index.ts';
import { runEventsTable } from '../store/sqlite/schema/run-events.ts';
import { chunkText } from './chunk-text.ts';
import { cosineSimilarity, decodeEmbedding, encodeEmbedding } from './embedding-vec.ts';
import type { EmbeddingsPort } from './embeddings.ts';
import { eventIndexText } from './entry-text.ts';
import { buildFtsMatchQuery } from './fts-query.ts';
import type { MemorySearchBackend } from './memory-backend.ts';
import { sqliteClient } from './sqlite-client.ts';

export type { MemorySearchBackend };

export type SqliteEpisodicPortOptions = {
  backend?: MemorySearchBackend;
  embeddings?: EmbeddingsPort;
  topK?: number;
};

type FtsHitRow = {
  thread_id: string;
  entry_id: string;
  seq: number;
  text: string;
  rank: number;
};

export class SqliteEpisodicPort implements EpisodicPort {
  private backend: MemorySearchBackend;
  private embeddings: EmbeddingsPort | undefined;
  private topK: number;

  constructor(
    private readonly db: StudioDb,
    options: SqliteEpisodicPortOptions = {},
  ) {
    this.backend = options.backend ?? 'fts';
    this.embeddings = options.embeddings;
    this.topK = options.topK ?? 8;
  }

  setBackend(backend: MemorySearchBackend): void {
    this.backend = backend;
  }

  setEmbeddings(embeddings: EmbeddingsPort | undefined): void {
    this.embeddings = embeddings;
  }

  async index(input: EpisodicIndexInput): Promise<void> {
    const wantVector = this.backend === 'vector';
    if (wantVector && !this.embeddings?.available()) {
      throw new ValidationError(
        'episodic vector backend needs an embeddings model; FTS indexing skipped for this compact',
      );
    }
    this.deleteRange(input.workspaceId, input.threadId, input.fromSeq, input.toSeq);

    const rows = this.db
      .select()
      .from(runEventsTable)
      .where(
        and(
          eq(runEventsTable.threadId, input.threadId),
          gte(runEventsTable.seq, input.fromSeq),
          lte(runEventsTable.seq, input.toSeq),
        ),
      )
      .orderBy(runEventsTable.timestamp, runEventsTable.seq)
      .all();

    const now = new Date().toISOString();
    for (const row of rows) {
      const metadata = row.metadata ? JSON.parse(row.metadata) : {};
      const event = {
        type: row.type,
        text: metadata.text,
        name: metadata.name,
        toolCallId: metadata.toolCallId,
        input: metadata.input,
        output: metadata.output,
        prompt: metadata.prompt,
      } as SessionEvent;

      const pieces = chunkText(eventIndexText(event));
      if (pieces.length === 0) {
        continue;
      }

      const vectors =
        wantVector && this.embeddings ? await this.embeddings.embed(pieces) : undefined;
      for (let i = 0; i < pieces.length; i++) {
        const text = pieces[i] ?? '';
        this.db
          .insert(episodicChunksTable)
          .values({
            id: crypto.randomUUID(),
            workspaceId: input.workspaceId,
            threadId: input.threadId,
            entryId: `${row.runId}:${row.seq}`,
            seq: row.seq,
            text,
            compactionEntryId: input.compactionEntryId ?? null,
            embedding: vectors ? encodeEmbedding(vectors[i] ?? []) : null,
            createdAt: now,
          })
          .run();
      }
    }
  }

  search(input: EpisodicSearchInput): Promise<EpisodicHit[]> {
    const limit = input.limit ?? this.topK;
    if (this.backend === 'vector') {
      return this.searchVector(input, limit);
    }
    return Promise.resolve(this.searchFts(input, limit));
  }

  private searchFts(input: EpisodicSearchInput, limit: number): EpisodicHit[] {
    const match = buildFtsMatchQuery(input.query);
    if (!match) {
      return [];
    }
    const sqlite = sqliteClient(this.db);
    const rows = input.threadId
      ? (sqlite
          .query(
            `SELECT c.thread_id AS thread_id, c.entry_id AS entry_id, c.seq AS seq, c.text AS text,
                    bm25(episodic_chunks_fts) AS rank
             FROM episodic_chunks_fts
             JOIN episodic_chunks c ON c.rowid = episodic_chunks_fts.rowid
             WHERE episodic_chunks_fts MATCH ? AND c.workspace_id = ? AND c.thread_id = ?
             ORDER BY rank
             LIMIT ?`,
          )
          .all(match, input.workspaceId, input.threadId, limit) as FtsHitRow[])
      : (sqlite
          .query(
            `SELECT c.thread_id AS thread_id, c.entry_id AS entry_id, c.seq AS seq, c.text AS text,
                    bm25(episodic_chunks_fts) AS rank
             FROM episodic_chunks_fts
             JOIN episodic_chunks c ON c.rowid = episodic_chunks_fts.rowid
             WHERE episodic_chunks_fts MATCH ? AND c.workspace_id = ?
             ORDER BY rank
             LIMIT ?`,
          )
          .all(match, input.workspaceId, limit) as FtsHitRow[]);
    return rows.map((row) => ({
      threadId: row.thread_id,
      entryId: row.entry_id,
      seq: row.seq,
      text: row.text,
      score: typeof row.rank === 'number' ? -row.rank : undefined,
    }));
  }

  private async searchVector(input: EpisodicSearchInput, limit: number): Promise<EpisodicHit[]> {
    if (!this.embeddings?.available()) {
      throw new ValidationError(
        'episodic vector search needs an embeddings model; use backend "fts" or configure embed model',
      );
    }
    const [queryVec] = await this.embeddings.embed([input.query]);
    if (!queryVec) {
      return [];
    }
    const filters = [eq(episodicChunksTable.workspaceId, input.workspaceId)];
    if (input.threadId) {
      filters.push(eq(episodicChunksTable.threadId, input.threadId));
    }
    const rows = this.db
      .select()
      .from(episodicChunksTable)
      .where(and(...filters))
      .all();
    const scored: EpisodicHit[] = [];
    for (const row of rows) {
      const vec = decodeEmbedding(row.embedding as Buffer | null);
      if (!vec) {
        continue;
      }
      scored.push({
        threadId: row.threadId,
        entryId: row.entryId,
        seq: row.seq,
        text: row.text,
        score: cosineSimilarity(queryVec, vec),
      });
    }
    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return scored.slice(0, limit);
  }

  /** Drop chunks previously produced for a covered seq range (optional reindex hygiene). */
  deleteRange(workspaceId: string, threadId: string, fromSeq: number, toSeq: number): void {
    this.db
      .delete(episodicChunksTable)
      .where(
        and(
          eq(episodicChunksTable.workspaceId, workspaceId),
          eq(episodicChunksTable.threadId, threadId),
          gte(episodicChunksTable.seq, fromSeq),
          lte(episodicChunksTable.seq, toSeq),
        ),
      )
      .run();
  }
}
