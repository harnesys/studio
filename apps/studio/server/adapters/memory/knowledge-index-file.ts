import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { trace } from '../../trace.ts';
import { chunkText } from './chunk-text.ts';
import { encodeEmbedding } from './embedding-vec.ts';
import type { EmbeddingsPort } from './embeddings.ts';
import type { SqliteKnowledgeIndexRepo } from './knowledge-index-repo.ts';
import type { KnowledgePath } from './knowledge-walk.ts';

export function sha1Hex(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

/** Content hash keyed by index mode so backend/embed changes bust skip. */
export function knowledgeContentHash(raw: string, indexModeKey: string): string {
  return sha1Hex(`${indexModeKey}\0${raw}`);
}

export function upsertWalkEntry(
  repo: SqliteKnowledgeIndexRepo,
  workspaceId: string,
  entry: KnowledgePath,
  updatedAt: string,
): void {
  if (entry.kind === 'skip') {
    repo.upsertFile({
      workspaceId,
      uri: entry.uri,
      status: 'skipped',
      skipReason: entry.reason,
      mtimeMs: entry.mtimeMs ?? null,
      sizeBytes: entry.sizeBytes ?? null,
      contentHash: null,
      chunkCount: 0,
      lastError: null,
      updatedAt,
    });
    return;
  }
  const existing = repo.getFile(workspaceId, entry.uri);
  if (
    existing?.status === 'indexed' &&
    existing.mtimeMs === entry.mtimeMs &&
    existing.contentHash
  ) {
    return;
  }
  repo.upsertFile({
    workspaceId,
    uri: entry.uri,
    status: 'pending',
    skipReason: null,
    mtimeMs: entry.mtimeMs,
    sizeBytes: entry.sizeBytes,
    contentHash: existing?.contentHash ?? null,
    chunkCount: existing?.chunkCount ?? 0,
    lastError: null,
    updatedAt,
  });
}

export type IndexFileResult = 'unchanged' | 'indexed' | 'error';

export async function indexKnowledgeFile(input: {
  repo: SqliteKnowledgeIndexRepo;
  workspaceId: string;
  entry: Extract<KnowledgePath, { kind: 'index' }>;
  wantVector: boolean;
  embeddings: EmbeddingsPort | undefined;
  updatedAt: string;
  /** fts | vector:provider/model — included in stored contentHash. */
  indexModeKey: string;
  signal?: AbortSignal;
}): Promise<IndexFileResult> {
  const { repo, workspaceId, entry, wantVector, embeddings, updatedAt, indexModeKey, signal } =
    input;
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  try {
    const existing = repo.getFile(workspaceId, entry.uri);
    const raw = await readFile(entry.absPath, 'utf8');
    const contentHash = knowledgeContentHash(raw, indexModeKey);
    if (
      existing?.status === 'indexed' &&
      existing.contentHash === contentHash &&
      existing.mtimeMs === entry.mtimeMs
    ) {
      if (
        !wantVector ||
        existing.chunkCount === 0 ||
        repo.uriHasEmbeddings(workspaceId, entry.uri)
      ) {
        return 'unchanged';
      }
    }

    const pieces = chunkText(raw);
    const title = entry.uri.split('/').pop() ?? entry.uri;
    trace('knowledge-indexer', 'file chunks', {
      uri: entry.uri,
      chunks: pieces.length,
      rawChars: raw.length,
    });
    let vectors: number[][] | undefined;
    if (wantVector) {
      if (!embeddings?.available()) {
        throw new Error('vector backend needs an embeddings model');
      }
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      // Batch to keep payload bounded and allow mid-file cancellation
      const batchSize = 64;
      vectors = [];
      for (let i = 0; i < pieces.length; i += batchSize) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const batch = pieces.slice(i, i + batchSize);
        const t0 = Date.now();
        trace('knowledge-indexer', 'embed batch start', {
          uri: entry.uri,
          batch: `${Math.floor(i / batchSize) + 1}/${Math.ceil(pieces.length / batchSize)}`,
          batchSize: batch.length,
        });
        const batchVectors = await embeddings.embed(batch, { signal });
        const elapsed = Date.now() - t0;
        trace('knowledge-indexer', 'embed batch done', {
          uri: entry.uri,
          batchSize: batch.length,
          elapsedMs: elapsed,
          slow: elapsed > 8000,
        });
        if (elapsed > 8000) {
          trace(
            'knowledge-indexer',
            'SLOW embeddings - model cold start? Ensure Ollama keep_alive=10m',
            {
              uri: entry.uri,
              elapsedMs: elapsed,
            },
          );
        }
        vectors.push(...batchVectors);
      }
    }

    repo.deleteChunksForUri(workspaceId, entry.uri);
    if (pieces.length > 0) {
      repo.insertChunks(
        pieces.map((text, i) => ({
          id: crypto.randomUUID(),
          workspaceId,
          uri: entry.uri,
          title,
          text,
          embedding: vectors ? encodeEmbedding(vectors[i] ?? []) : null,
          updatedAt,
        })),
      );
    }

    repo.upsertFile({
      workspaceId,
      uri: entry.uri,
      status: 'indexed',
      skipReason: null,
      mtimeMs: entry.mtimeMs,
      sizeBytes: entry.sizeBytes,
      contentHash,
      chunkCount: pieces.length,
      lastError: null,
      updatedAt,
    });
    return 'indexed';
  } catch (err) {
    if (isAbortError(err)) {
      trace('knowledge-indexer', 'index file abort', { uri: entry.uri });
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    trace('knowledge-indexer', 'index file error', {
      uri: entry.uri,
      error: message.slice(0, 500),
    });
    repo.upsertFile({
      workspaceId,
      uri: entry.uri,
      status: 'error',
      skipReason: null,
      mtimeMs: entry.mtimeMs,
      sizeBytes: entry.sizeBytes,
      contentHash: null,
      chunkCount: 0,
      lastError: message.slice(0, 500),
      updatedAt,
    });
    return 'error';
  }
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}
