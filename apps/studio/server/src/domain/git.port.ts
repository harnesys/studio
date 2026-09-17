import type {
  GitBranch,
  GitDiffResponse,
  GitFileStatusMap,
  GitStatusResponse,
} from '@harnesys/studio-shared';

export type GitPort = {
  getStatus(cwd: string): Promise<GitStatusResponse>;
  getFileStatus(
    cwd: string,
    subPath?: string,
  ): Promise<{ map: GitFileStatusMap; truncated: boolean }>;
  getDiff(cwd: string, filePath: string): Promise<GitDiffResponse>;
  listBranches(cwd: string): Promise<{ local: GitBranch[]; recent: GitBranch[] }>;
  checkout(cwd: string, branch: string): Promise<void>;
  createBranch(cwd: string, name: string, checkout: boolean, from?: string): Promise<void>;
  validateBranchName(cwd: string, name: string): Promise<boolean>;
  stage(cwd: string, paths: string[]): Promise<void>;
  commit(cwd: string, message: string): Promise<void>;
  push(cwd: string): Promise<void>;
  pull(cwd: string): Promise<void>;
  init(cwd: string): Promise<void>;
};
