export type ProcessJobMode = 'pipes' | 'pty';
export type ProcessJobStatus = 'running' | 'exited' | 'killed' | 'timed_out';
export type ProcessJobRecord = {
  id: string;
  cwd: string;
  mode: ProcessJobMode;
  title: string;
  command: string;
  status: ProcessJobStatus;
  exitCode: number | null;
  createdAt: string;
  workspaceId?: string;
};
export type ProcessJobReadResult = {
  text: string;
  nextSince: number;
  truncated: boolean;
};
export type ProcessJobRegistry = {
  start(input: {
    cwd: string;
    command: string;
    mode: ProcessJobMode;
    title?: string;
    workspaceId?: string;
    env?: Record<string, string>;
    cols?: number;
    rows?: number;
  }): ProcessJobRecord;
  get(id: string): ProcessJobRecord | null;
  list(filter?: { cwd?: string; workspaceId?: string; mode?: ProcessJobMode }): ProcessJobRecord[];
  read(
    id: string,
    opts?: {
      since?: number;
    },
  ): ProcessJobReadResult | null;
  write(id: string, data: string): boolean;
  resize(id: string, cols: number, rows: number): boolean;
  subscribe(
    id: string,
    onData: (chunk: string) => void,
    onExit?: (code: number | null) => void,
  ): (() => void) | null;
  kill(id: string): boolean;
  delete(id: string): boolean;
};
