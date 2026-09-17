import type { TerminalSessionRecord } from '@harnesys/studio-shared';

const SCROLLBACK_CHARS = 256_000;

export type TerminalDataListener = (chunk: string) => void;
export type TerminalExitListener = (code: number | null) => void;

type LiveSession = {
  record: TerminalSessionRecord;
  proc: Bun.Subprocess;
  terminal: Bun.Terminal;
  scrollback: string;
  dataListeners: Set<TerminalDataListener>;
  exitListeners: Set<TerminalExitListener>;
};

function decodeChunk(data: string | Uint8Array): string {
  if (typeof data === 'string') {
    return data;
  }
  return new TextDecoder().decode(data);
}

function defaultShell(): string {
  const fromEnv = process.env.SHELL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh';
}

/**
 * In-memory PTY sessions for Studio IDE terminals (Bun.Terminal).
 * One registry per host process; sessions die with the server.
 */
export class TerminalSessionRegistry {
  private readonly byId = new Map<string, LiveSession>();
  private readonly titleIndexByWorkspace = new Map<string, number>();

  list(workspaceId: string): TerminalSessionRecord[] {
    return [...this.byId.values()]
      .filter((session) => session.record.workspaceId === workspaceId)
      .map((session) => session.record)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  get(sessionId: string): TerminalSessionRecord | null {
    return this.byId.get(sessionId)?.record ?? null;
  }

  create(workspaceId: string, cwd: string): TerminalSessionRecord {
    const id = crypto.randomUUID();
    const shell = defaultShell();
    const titleIndex = (this.titleIndexByWorkspace.get(workspaceId) ?? 0) + 1;
    this.titleIndexByWorkspace.set(workspaceId, titleIndex);
    const title = titleIndex === 1 ? 'Terminal' : `Terminal ${titleIndex}`;

    let live: LiveSession | undefined;
    const argv = process.platform === 'win32' ? [shell] : [shell, '-l'];
    const proc = Bun.spawn(argv, {
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
      terminal: {
        cols: 80,
        rows: 24,
        name: 'xterm-256color',
        data: (_terminal, data) => {
          if (!live) {
            return;
          }
          const chunk = decodeChunk(data);
          live.scrollback = appendScrollback(live.scrollback, chunk);
          for (const listener of live.dataListeners) {
            listener(chunk);
          }
        },
      },
      onExit: (_subprocess, exitCode) => {
        if (!live) {
          return;
        }
        const code = typeof exitCode === 'number' ? exitCode : null;
        live.record = {
          ...live.record,
          exited: true,
          exitCode: code,
        };
        for (const listener of live.exitListeners) {
          listener(code);
        }
      },
    });

    if (!proc.terminal) {
      throw new Error('Bun.spawn did not attach a terminal');
    }

    live = {
      record: {
        id,
        workspaceId,
        title,
        cwd,
        createdAt: new Date().toISOString(),
        exitCode: null,
        exited: false,
      },
      proc,
      terminal: proc.terminal,
      scrollback: '',
      dataListeners: new Set(),
      exitListeners: new Set(),
    };
    this.byId.set(id, live);
    return live.record;
  }

  write(sessionId: string, data: string): boolean {
    const live = this.byId.get(sessionId);
    if (!live || live.record.exited || live.terminal.closed) {
      return false;
    }
    live.terminal.write(data);
    return true;
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const live = this.byId.get(sessionId);
    if (!live || live.record.exited || live.terminal.closed) {
      return false;
    }
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 2 || rows < 1) {
      return false;
    }
    live.terminal.resize(Math.floor(cols), Math.floor(rows));
    return true;
  }

  subscribe(
    sessionId: string,
    onData: TerminalDataListener,
    onExit?: TerminalExitListener,
  ): (() => void) | null {
    const live = this.byId.get(sessionId);
    if (!live) {
      return null;
    }
    live.dataListeners.add(onData);
    if (onExit) {
      live.exitListeners.add(onExit);
    }
    return () => {
      live.dataListeners.delete(onData);
      if (onExit) {
        live.exitListeners.delete(onExit);
      }
    };
  }

  scrollback(sessionId: string): string | null {
    return this.byId.get(sessionId)?.scrollback ?? null;
  }

  delete(sessionId: string): boolean {
    const live = this.byId.get(sessionId);
    if (!live) {
      return false;
    }
    this.byId.delete(sessionId);
    try {
      if (!live.proc.killed) {
        live.proc.kill();
      }
    } catch {
      // already dead
    }
    try {
      if (!live.terminal.closed) {
        live.terminal.close();
      }
    } catch {
      // already closed
    }
    live.dataListeners.clear();
    live.exitListeners.clear();
    return true;
  }
}

function appendScrollback(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= SCROLLBACK_CHARS) {
    return next;
  }
  return next.slice(next.length - SCROLLBACK_CHARS);
}

export const terminalSessions = new TerminalSessionRegistry();
