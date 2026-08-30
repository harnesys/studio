export type MemorySearchBackend = 'fts' | 'vector';

export type KnowledgeFileStatus = 'pending' | 'indexed' | 'skipped' | 'error';

export type KnowledgeIndexStatus = 'idle' | 'running' | 'error';

export type KnowledgeRootRecord = {
  workspaceId: string;
  path: string;
  enabled: boolean;
};

export type KnowledgeSettings = {
  workspaceId: string;
  entireWorkspace: boolean;
  backend: MemorySearchBackend;
  embedProvider: string | null;
  embedModel: string | null;
  watchEnabled: boolean;
  updatedAt: string;
};

export type UpsertKnowledgeSettingsRequest = {
  entireWorkspace?: boolean;
  backend?: MemorySearchBackend;
  embedProvider?: string | null;
  embedModel?: string | null;
  watchEnabled?: boolean;
};

export type KnowledgeFileRecord = {
  workspaceId: string;
  uri: string;
  status: KnowledgeFileStatus;
  skipReason: string | null;
  mtimeMs: number | null;
  sizeBytes: number | null;
  contentHash: string | null;
  chunkCount: number;
  lastError: string | null;
  updatedAt: string;
};

export type KnowledgeIndexState = {
  workspaceId: string;
  status: KnowledgeIndexStatus;
  phase: string | null;
  processed: number;
  total: number;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  currentUri?: string | null;
};

export type KnowledgeFilesByStatus = {
  pending: number;
  indexed: number;
  skipped: number;
  error: number;
};

export type KnowledgeStats = {
  chunkCount: number;
  filesByStatus: KnowledgeFilesByStatus;
};

export type UpsertKnowledgeRootRequest = {
  path: string;
  enabled?: boolean;
};
