export type GitFileStatus =
  | 'modified'
  | 'staged'
  | 'added'
  | 'untracked'
  | 'conflicted'
  | 'ignored'
  | 'deleted'
  | 'renamed';

export type GitFileStatusMap = Record<string, GitFileStatus>;

export type GitBranch = {
  name: string;
  current: boolean;
};

export type GitStatusCounts = {
  added: number;
  modified: number;
  deleted: number;
  untracked: number;
  staged: number;
  conflicted: number;
  renamed: number;
};

export type GitStatusBase =
  | { isGit: false }
  | {
      isGit: true;
      branch: string | null;
      detached: boolean;
      head: string | null;
      ahead: number;
      behind: number;
      dirty: boolean;
      dirtyCount: number;
      counts?: GitStatusCounts;
      noCommits: boolean;
      truncated?: boolean;
    };

export type GitStatusResponse = GitStatusBase & {
  gitVersion?: string | null;
  gitUser?: { name: string | null; email: string | null } | null;
  remote?: string | null;
  branches?: { local: GitBranch[]; recent: GitBranch[] };
};

export type GitCheckoutRequest = {
  branch: string;
};

export type GitCreateBranchRequest = {
  name: string;
  checkout?: boolean;
  from?: string;
};

export type GitDiffResponse = {
  path: string;
  status: GitFileStatus;
  original: string | null;
  current: string | null;
  diff: string | null;
  isBinary: boolean;
  truncated?: boolean;
};
