import { eq } from 'drizzle-orm';
import type { KnowledgeHit } from 'harnesys';
import { ValidationError } from '../../domain/studio.error.ts';
import type { StudioDb } from '../store/sqlite/connection.ts';
import { knowledgeChunksTable } from '../store/sqlite/schema';
import { cosineSimilarity, decodeEmbedding } from './embedding-vec.ts';
import type { EmbeddingsPort } from './embeddings.ts';
import { buildFtsMatchQuery } from './fts-query.ts';
import { sqliteClient } from './sqlite-client.ts';

type KnowledgeFtsRow = {
  id: string;
  title: string | null;
  text: string;
  uri: string;
  rank: number;
};
export function searchKnowledgeFts(
  db: StudioDb,
  workspaceId: string,
  query: string,
  limit: number,
): KnowledgeHit[] {
  const match = buildFtsMatchQuery(query);
  if (!match) {
    return [];
  }
  const sqlite = sqliteClient(db);
  const rows = sqlite
    .query(`SELECT c.id AS id, c.title AS title, c.text AS text, c.uri AS uri,
              bm25(knowledge_chunks_fts) AS rank
       FROM knowledge_chunks_fts
       JOIN knowledge_chunks c ON c.rowid = knowledge_chunks_fts.rowid
       WHERE knowledge_chunks_fts MATCH ? AND c.workspace_id = ?
       ORDER BY rank
       LIMIT ?`)
    .all(match, workspaceId, limit) as KnowledgeFtsRow[];
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    ...(row.title ? { title: row.title } : {}),
    ...(row.uri ? { uri: row.uri } : {}),
    score: typeof row.rank === 'number' ? -row.rank : undefined,
  }));
}
export type SearchKnowledgeVectorInput = {
  db: StudioDb;
  workspaceId: string;
  query: string;
  limit: number;
  embeddings: EmbeddingsPort | undefined;
};
export async function searchKnowledgeVector(
  input: SearchKnowledgeVectorInput,
): Promise<KnowledgeHit[]> {
  const { db, workspaceId, query, limit, embeddings } = input;
  if (!embeddings?.available()) {
    throw new ValidationError(
      'knowledge vector search needs an embeddings model; use backend "fts" or configure embed model',
    );
  }
  const [queryVec] = await embeddings.embed([query]);
  if (!queryVec) {
    return [];
  }
  const rows = db
    .select()
    .from(knowledgeChunksTable)
    .where(eq(knowledgeChunksTable.workspaceId, workspaceId))
    .all();
  const scored: KnowledgeHit[] = [];
  for (const row of rows) {
    const vec = decodeEmbedding(row.embedding as Buffer | null);
    if (!vec) {
      continue;
    }
    scored.push({
      id: row.id,
      text: row.text,
      ...(row.title ? { title: row.title } : {}),
      ...(row.uri ? { uri: row.uri } : {}),
      score: cosineSimilarity(queryVec, vec),
    });
  }
  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, limit);
}
