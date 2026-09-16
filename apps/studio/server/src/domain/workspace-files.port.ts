import type { WorkspaceFileEntry } from '@harnesys/studio-shared';

export type WorkspaceFilesPort = {
  listDir(absPath: string): Promise<WorkspaceFileEntry[]>;
  createFile(absPath: string): Promise<void>;
  createDir(absPath: string): Promise<void>;
  delete(absPath: string): Promise<void>;
  /** Move or rename a file/directory. Atomic on one filesystem, copy+remove across devices. */
  move(fromAbsPath: string, toAbsPath: string): Promise<void>;
  stat(absPath: string): Promise<{ size: number; modifiedAt: string } | undefined>;
  readFile(absPath: string): Promise<{ bytes: Uint8Array; mimeType: string }>;
  writeFile(absPath: string, content: string): Promise<void>;
};
