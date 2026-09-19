import { extname, join } from 'node:path';
import type { LspServerSpec, PluginDiagnostic } from 'harnesys';
import type { LspDiagnostic, LspHover, LspLocation, LspPort } from 'harnesys/lsp';
import { StdioLspSession } from './stdio-lsp-session.ts';
export type StudioLspAdapterDeps = {
  resolveServers: (cwd: string) => LspServerSpec[] | Promise<LspServerSpec[]>;
  onSessionOpened?: (cwd: string, firstFilePath: string) => void;
  onDiagnostic?: (diagnostic: PluginDiagnostic) => void;
};
const DEFAULT_MAX_RESTARTS = 3;
type WorkspaceServers = {
  byExtension: Map<string, LspServerSpec>;
};
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
      } catch {}
    }
  }
  async invalidateCwd(cwd: string): Promise<void> {
    this.serversByCwd.delete(cwd);
    const prefix = `${cwd}::`;
    const doomed = [...this.sessions.entries()].filter(([k]) => k.startsWith(prefix));
    for (const [k] of doomed) {
      this.sessions.delete(k);
    }
    for (const [, p] of doomed) {
      try {
        (await p).dispose();
      } catch {}
    }
  }
  async hasServerFor(cwd: string, filePath: string): Promise<boolean> {
    const servers = await this.effectiveServers(cwd);
    return servers.byExtension.has(extname(filePath));
  }
  async languageIdFor(cwd: string, filePath: string): Promise<string | undefined> {
    const servers = await this.effectiveServers(cwd);
    return servers.byExtension.get(extname(filePath))?.extensionToLanguage[extname(filePath)];
  }
  openSession(cwd: string, filePath: string): Promise<StdioLspSession> {
    return this.configFor(cwd, filePath).then((config) => this.sessionFor(config, cwd, filePath));
  }
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
      } catch {}
    }
  }
  closePathFromDisk(cwd: string, relPath: string): void {
    const prefix = `${cwd}::`;
    const absPath = join(cwd, relPath);
    for (const [key, promise] of this.sessions) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      void promise
        .then((session) => {
          session.closePath(absPath);
        })
        .catch(() => {});
    }
  }
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
        'No LSP servers configured. Enable a workspace plugin that declares lspServers (e.g. typescript-lsp) and grant it the process class.',
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
      .catch(() => {});
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
