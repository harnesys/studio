import type { KnowledgeIndexState } from '../../shared/knowledge.ts';

export type KnowledgeIndexEventsPort = {
  subscribe(workspaceId: string, listener: (state: KnowledgeIndexState) => void): () => void;
  emit(workspaceId: string, state: KnowledgeIndexState): void;
};
