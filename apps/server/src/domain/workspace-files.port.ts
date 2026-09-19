import type { WorkspaceFileEntry } from '@harnesys/studio-shared';
export type WorkspaceFilesPort = {
  listDir(absPath: string): Promise<WorkspaceFileEntry[]>;
  listTree(
    absRoot: string,
    options?: {
      includeSafety?: boolean;
    },
  ): Promise<WorkspaceFileEntry[]>;
  createFile(absPath: string): Promise<void>;
  createDir(absPath: string): Promise<void>;
  delete(absPath: string): Promise<void>;
  move(fromAbsPath: string, toAbsPath: string): Promise<void>;
  stat(absPath: string): Promise<
    | {
        size: number;
        modifiedAt: string;
      }
    | undefined
  >;
  readFile(absPath: string): Promise<{
    bytes: Uint8Array;
    mimeType: string;
  }>;
  writeFile(absPath: string, content: string): Promise<void>;
};
