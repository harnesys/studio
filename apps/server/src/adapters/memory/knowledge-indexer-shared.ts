import type { KnowledgeIndexEventsPort } from '../../domain/knowledge-index-events.port.ts';
import type { EmbeddingsPort, StudioEmbeddingsDeps } from './embeddings.ts';
import type { SqliteKnowledgeIndexRepo } from './knowledge-index-repo.ts';
import type { KnowledgeIndexStatePatch, KnowledgeIndexStateRecord, KnowledgeSettingsRecord } from './knowledge-index-types.ts';

export type KnowledgeIndexerOptions = {
  resolveWorkspacePath: (workspaceId: string) => string | undefined;
  listEnabledRoots: (workspaceId: string) => string[];
  embeddings?: EmbeddingsPort;
  embeddingsDeps?: StudioEmbeddingsDeps;
  events?: KnowledgeIndexEventsPort;
};
export type WorkspaceJob = {
  cancel: boolean;
  chain: Promise<void>;
  pendingUris: string[];
  busy: boolean;
  currentUri: string | null;
  controller?: AbortController;
};
export type KnowledgeIndexerHost = {
  repo: SqliteKnowledgeIndexRepo;
  options: KnowledgeIndexerOptions;
  resolveEmbeddings(
    workspaceId: string,
    settings: KnowledgeSettingsRecord,
  ): EmbeddingsPort | undefined;
  ensureJob(workspaceId: string): WorkspaceJob;
  upsertState(
    workspaceId: string,
    patch: KnowledgeIndexStatePatch,
  ): KnowledgeIndexStateRecord;
  emitState(workspaceId: string): void;
  bumpProcessed(workspaceId: string): void;
};
export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}
