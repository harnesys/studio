import type { WorkspaceStatus } from '@harnesys/studio-shared';

export type WorkspacePort = {
  inspect(path: string): Promise<WorkspaceStatus>;
  ensureDir(path: string): Promise<void>;
  pick(): Promise<string | undefined>;
  reveal(path: string): Promise<void>;
};

export type Workspace = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
};

export type WorkspaceInsert = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
};

export type WorkspacePatch = {
  name?: string;
  path?: string;
};

export type WorkspaceRepository = {
  list(): Workspace[];
  findById(id: string): Workspace | undefined;
  insert(rec: WorkspaceInsert): Workspace;
  update(id: string, patch: WorkspacePatch): Workspace;
  delete(id: string): void;
};
