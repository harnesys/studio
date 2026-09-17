export type TerminalSessionRecord = {
  id: string;
  workspaceId: string;
  title: string;
  cwd: string;
  createdAt: string;
  /** Present after the shell process exits; session stays listable until deleted. */
  exitCode: number | null;
  exited: boolean;
};
