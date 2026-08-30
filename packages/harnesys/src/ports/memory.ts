export type MemoryScopeId = {
  workspaceId: string;
  agentName: string;
  threadId?: string;
};

export type PinSource = 'agent' | 'human';

export type PinRecord = {
  key: string;
  text: string;
  updatedAt: string;
  source: PinSource;
};

export type PinUpsertInput = {
  key: string;
  text: string;
  source: PinSource;
};

export type PinPort = {
  list(scope: MemoryScopeId): Promise<PinRecord[]>;
  upsert(scope: MemoryScopeId, input: PinUpsertInput): Promise<PinRecord>;
  remove(scope: MemoryScopeId, key: string): Promise<void>;
  projectForWindow(scope: MemoryScopeId, budgetTokens: number): Promise<string>;
};

export type SemanticScope = 'session' | 'long';
export type SemanticSessionTtl = 'thread' | '24h';
export type MemoryRecordSource = 'agent' | 'human' | 'compaction';

export type MemoryRecord = {
  id: string;
  scope: SemanticScope;
  text: string;
  key?: string;
  createdAt: string;
  updatedAt: string;
  source: MemoryRecordSource;
  threadId?: string;
};

export type SemanticListQuery = {
  scope?: SemanticScope;
  limit?: number;
  sessionTtl?: SemanticSessionTtl;
};

export type SemanticProjectInput = {
  scopes: SemanticScope[];
  limit: number;
  budgetTokens: number;
  sessionTtl?: SemanticSessionTtl;
};

export type SemanticUpsertInput = {
  scope: SemanticScope;
  text: string;
  key?: string;
  threadId?: string;
  source: MemoryRecordSource;
  sessionTtl?: SemanticSessionTtl;
};

export type SemanticMemoryPort = {
  list(scopeId: MemoryScopeId, query: SemanticListQuery): Promise<MemoryRecord[]>;
  upsert(scopeId: MemoryScopeId, input: SemanticUpsertInput): Promise<MemoryRecord>;
  remove(scopeId: MemoryScopeId, id: string): Promise<void>;
  projectForWindow?(scopeId: MemoryScopeId, input: SemanticProjectInput): Promise<string>;
};

export type EpisodicHit = {
  threadId: string;
  entryId?: string;
  seq?: number;
  text: string;
  score?: number;
};

export type EpisodicIndexInput = {
  workspaceId: string;
  threadId: string;
  fromSeq: number;
  toSeq: number;
  compactionEntryId?: string;
};

export type EpisodicSearchInput = {
  workspaceId: string;
  query: string;
  threadId?: string;
  limit?: number;
};

export type EpisodicPort = {
  index?(input: EpisodicIndexInput): Promise<void>;
  search(input: EpisodicSearchInput): Promise<EpisodicHit[]>;
};

export type KnowledgeHit = {
  id: string;
  title?: string;
  text: string;
  uri?: string;
  score?: number;
};

export type KnowledgeSearchInput = {
  workspaceId: string;
  query: string;
  limit?: number;
};

export type KnowledgeReadInput = {
  workspaceId: string;
  id: string;
};

export type KnowledgeReadResult = {
  id: string;
  text: string;
  uri?: string;
};

export type KnowledgeReindexInput = {
  workspaceId: string;
};

export type KnowledgePort = {
  search(input: KnowledgeSearchInput): Promise<KnowledgeHit[]>;
  read?(input: KnowledgeReadInput): Promise<KnowledgeReadResult>;
  reindex?(input: KnowledgeReindexInput): Promise<void>;
};
