export type TerminalSessionRecord = {
  id: string;
  workspaceId: string;
  title: string;
  cwd: string;
  createdAt: string;
  exitCode: number | null;
  exited: boolean;
};
