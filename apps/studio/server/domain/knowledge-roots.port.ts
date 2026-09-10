import type {
  KnowledgeFileRecord,
  KnowledgeFileStatus,
  KnowledgeFilesByStatus,
  KnowledgeIndexState,
  KnowledgeRootRecord,
  KnowledgeSettings,
  KnowledgeStats,
  UpsertKnowledgeSettingsRequest,
} from '@harnesys/studio-shared';

export type {
  KnowledgeFileRecord,
  KnowledgeFileStatus,
  KnowledgeFilesByStatus,
  KnowledgeIndexState,
  KnowledgeRootRecord,
  KnowledgeSettings,
  KnowledgeStats,
  UpsertKnowledgeSettingsRequest,
};

export type UpsertKnowledgeRootInput = {
  workspaceId: string;
  path: string;
  enabled?: boolean;
};

export type KnowledgeRootsPort = {
  listRoots(workspaceId: string): KnowledgeRootRecord[];
  upsertRoot(input: UpsertKnowledgeRootInput): KnowledgeRootRecord;
  deleteRoot(workspaceId: string, path: string): void;
  countChunks(workspaceId: string): number;
  countFilesByStatus(workspaceId: string): KnowledgeFilesByStatus;
  getSettings(workspaceId: string): KnowledgeSettings;
  putSettings(workspaceId: string, patch: UpsertKnowledgeSettingsRequest): KnowledgeSettings;
  listFiles(workspaceId: string, status?: KnowledgeFileStatus): KnowledgeFileRecord[];
  getIndexState(workspaceId: string): KnowledgeIndexState;
  startReindex(workspaceId: string): Promise<KnowledgeIndexState>;
  cancelIndex(workspaceId: string): KnowledgeIndexState;
};
