import { extname, join } from 'node:path';
import type { LspServerSpec, PluginDiagnostic } from 'harnesys';
import type { LspDiagnostic, LspHover, LspLocation, LspPort } from 'harnesys/lsp';
import { StdioLspSession } from './stdio-lsp-session.ts';

export type StudioLspAdapterDeps = {
  /** Resolve LSP server configs for a workspace cwd. */
  resolveServers: (cwd: string) => LspServerSpec[] | Promise<LspServerSpec[]>;
  /**
   * Called once per workspace when the first session starts. The host uses it to
   * subscribe the FS watcher so external edits are pushed into open documents.
   */
  onSessionOpened?: (cwd: string, firstFilePath: string) => void;
  /** Bind diagnostics (lsp_shadowed): the host decides where they surface. */
  onDiagnostic?: (diagnostic: PluginDiagnostic) => void;
};

/** Restart cap when `restartOnCrash` is set without an explicit `maxRestarts`. */
const DEFAULT_MAX_RESTARTS = 3;

type WorkspaceServers = {
  /** One server per extension: first in the resolved list wins. */
  byExtension: Map<string, LspServerSpec>;
};

/**
 * Per-workspace LSP sessions. Servers start on first tool use and stay warm.
 * The resolved server list is deduplicated per extension (`lsp_shadowed` for
 * the losers); sessions with `restartOnCrash` respawn up to `maxRestarts`.
 */
export class StudioLspAdapter implements LspPort {
  private readonly sessions = new Map<string, Promise<StdioLspSession>>();
  private readonly serversByCwd = new Map<string, Promise<WorkspaceServers>>();

  constructor(private readonly deps: StudioLspAdapterDeps) {}

  async diagnostics(request: { cwd: string; path: string }): Promise<LspDiagnostic[]> {
    const config = await this.configFor(request.cwd, request.path);
    if (config.diagnostics === false) {
      return [];
    }
    const session = await this.sessionFor(config, request.cwd, request.path);
    return session.diagnostics(request.path);
  }

  async definition(request: {
    cwd: string;
    path: string;
    line: number;
    character: number;
  }): Promise<LspLocation[]> {
    const config = await this.configFor(request.cwd, request.path);
    const session = await this.sessionFor(config, request.cwd, request.path);
    return session.definition(request.path, request.line, request.character);
  }

  async references(request: {
    cwd: string;
    path: string;
    line: number;
    character: number;
  }): Promise<LspLocation[]> {
    const config = await this.configFor(request.cwd, request.path);
    const session = await this.sessionFor(config, request.cwd, request.path);
    return session.references(request.path, request.line, request.character);
  }

  async hover(request: {
    cwd: string;
    path: string;
    line: number;
    character: number;
  }): Promise<LspHover | null> {
    const config = await this.configFor(request.cwd, request.path);
    const session = await this.sessionFor(config, request.cwd, request.path);
    return session.hover(request.path, request.line, request.character);
  }

  async disposeAll(): Promise<void> {
    const pending = [...this.sessions.values()];
    this.sessions.clear();
    for (const promise of pending) {
      try {
        const session = await promise;
        await session.dispose();
      } catch {
        // ignore
      }
    }
  }

  /** True when some enabled server maps this file extension (does not start anything). */
  async hasServerFor(cwd: string, filePath: string): Promise<boolean> {
    const servers = await this.effectiveServers(cwd);
    return servers.byExtension.has(extname(filePath));
  }

  /** LSP languageId for the file's extension per the resolved server config. */
  async languageIdFor(cwd: string, filePath: string): Promise<string | undefined> {
    const servers = await this.effectiveServers(cwd);
    return servers.byExtension.get(extname(filePath))?.extensionToLanguage[extname(filePath)];
  }

  /** Raw session for the file's language server (editor bridge). Starts it if needed. */
  openSession(cwd: string, filePath: string): Promise<StdioLspSession> {
    return this.configFor(cwd, filePath).then((config) => this.sessionFor(config, cwd, filePath));
  }

  /**
   * Watcher-driven push: resync every session of the workspace whose open document
   * matches the changed file. No-op for docs nobody opened.
   */
  async syncPathFromDisk(cwd: string, relPath: string): Promise<void> {
    const prefix = `${cwd}::`;
    const absPath = join(cwd, relPath);
    for (const [key, promise] of this.sessions) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      try {
        const session = await promise;
        await session.syncPath(absPath);
      } catch {
        // session failed to start or path outside root — skip
      }
    }
  }

  /** Deduplicated map, resolved once per workspace cwd. */
  private effectiveServers(cwd: string): Promise<WorkspaceServers> {
    const cached = this.serversByCwd.get(cwd);
    if (cached) {
      return cached;
    }
    const pending = Promise.resolve(this.deps.resolveServers(cwd)).then((servers) => {
      const byExtension = new Map<string, LspServerSpec>();
      for (const server of servers) {
        for (const ext of Object.keys(server.extensionToLanguage)) {
          const winner = byExtension.get(ext);
          if (winner !== undefined) {
            this.deps.onDiagnostic?.({
              level: 'warning',
              code: 'lsp_shadowed',
              message: `lsp server "${server.serverId}" is shadowed for ${ext} by "${winner.serverId}" (first wins)`,
              path: server.serverId,
            });
            continue;
          }
          byExtension.set(ext, server);
        }
      }
      return { byExtension };
    });
    this.serversByCwd.set(cwd, pending);
    return pending;
  }

  private async configFor(cwd: string, filePath: string): Promise<LspServerSpec> {
    const servers = await this.effectiveServers(cwd);
    if (servers.byExtension.size === 0) {
      throw new Error(
        'No LSP servers configured. Enable a workspace plugin that declares lspServers (e.g. typescript-lsp) and trust it.',
      );
    }
    const ext = extname(filePath);
    const config = servers.byExtension.get(ext);
    if (!config) {
      throw new Error(
        `No LSP server maps extension ${ext || '(none)'}. Enabled servers: ${[...new Set([...servers.byExtension.values()].map((server) => server.serverId))].join(', ')}`,
      );
    }
    return config;
  }

  private sessionFor(
    config: LspServerSpec,
    cwd: string,
    filePath: string,
  ): Promise<StdioLspSession> {
    return this.sessionForRequest({ config, cwd, filePath, attempt: 0 });
  }

  /** Map key is stable per server; the map holds the newest session of the key. */
  private sessionForRequest(request: SessionRequest): Promise<StdioLspSession> {
    const key = sessionKey(request.cwd, request.config.serverId);
    let promise = this.sessions.get(key);
    if (!promise) {
      promise = this.startSession(request, key);
    }
    return promise;
  }

  private startSession(request: SessionRequest, key: string): Promise<StdioLspSession> {
    const promise = this.spawn(request, key);
    this.sessions.set(key, promise);
    return promise;
  }

  private spawn(request: SessionRequest, key: string): Promise<StdioLspSession> {
    const promise = StdioLspSession.start(request.config, request.cwd).catch((err: unknown) => {
      if (this.sessions.get(key) === promise) {
        this.sessions.delete(key);
      }
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to start LSP "${request.config.serverId}" (${request.config.command}): ${detail}. Install the binary or ensure it is on PATH (e.g. npm i -g typescript-language-server typescript).`,
      );
    });
    void promise
      .then((session) => {
        // Crash policy: a dead session is dropped; restartOnCrash respawns up to
        // maxRestarts (fresh document state — no stale caches). Disposed or
        // replaced entries never resurrect: the map identity check gates below.
        void session.exited.then(() => {
          if (this.sessions.get(key) !== promise) {
            return;
          }
          this.sessions.delete(key);
          const maxRestarts = request.config.maxRestarts ?? DEFAULT_MAX_RESTARTS;
          if (request.config.restartOnCrash === true && request.attempt < maxRestarts) {
            void this.sessionForRequest({ ...request, attempt: request.attempt + 1 });
          }
        });
        this.deps.onSessionOpened?.(request.cwd, request.filePath);
      })
      .catch(() => {
        // start failure is handled by the sessionFor caller
      });
    return promise;
  }
}

type SessionRequest = {
  config: LspServerSpec;
  cwd: string;
  filePath: string;
  attempt: number;
};

function sessionKey(cwd: string, serverId: string): string {
  return `${cwd}::${serverId}`;
}
