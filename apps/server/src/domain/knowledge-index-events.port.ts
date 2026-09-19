import type { KnowledgeIndexState } from '@harnesys/studio-shared';

export type KnowledgeIndexEventsPort = {
  subscribe(workspaceId: string, listener: (state: KnowledgeIndexState) => void): () => void;
  emit(workspaceId: string, state: KnowledgeIndexState): void;
};
