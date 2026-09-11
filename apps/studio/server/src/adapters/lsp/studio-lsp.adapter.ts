import { extname, join } from 'node:path';
import type { PluginLspServer } from 'harnesys';
import type { LspDiagnostic, LspHover, LspLocation, LspPort } from 'harnesys/lsp';
import { StdioLspSession } from './stdio-lsp-session.ts';

export type StudioLspAdapterDeps = {
  /** Resolve LSP server configs for a workspace cwd. */
  resolveServers: (cwd: string) => PluginLspServer[] | Promise<PluginLspServer[]>;
  /**
   * Called once per workspace when the first session starts. The host uses it to
   * subscribe the FS watcher so external edits are pushed into open documents.
   */
  onSessionOpened?: (cwd: string, firstFilePath: string) => void;
};

/**
 * Per-workspace LSP sessions. Servers start on first tool use and stay warm.
 */
export class StudioLspAdapter implements LspPort {
  private readonly sessions = new Map<string, Promise<StdioLspSession>>();

  constructor(private readonly deps: StudioLspAdapterDeps) {}

  async diagnostics(request: { cwd: string; path: string }): Promise<LspDiagnostic[]> {
    const session = await this.sessionFor(request.cwd, request.path);
    return session.diagnostics(request.path);
  }

  async definition(request: {
    cwd: string;
    path: string;
    line: number;
    character: number;
  }): Promise<LspLocation[]> {
    const session = await this.sessionFor(request.cwd, request.path);
    return session.definition(request.path, request.line, request.character);
  }

  async references(request: {
    cwd: string;
    path: string;
    line: number;
    character: number;
  }): Promise<LspLocation[]> {
    const session = await this.sessionFor(request.cwd, request.path);
    return session.references(request.path, request.line, request.character);
  }

  async hover(request: {
    cwd: string;
    path: string;
    line: number;
    character: number;
  }): Promise<LspHover | null> {
    const session = await this.sessionFor(request.cwd, request.path);
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
    const servers = await this.deps.resolveServers(cwd);
    if (servers.length === 0) {
      return false;
    }
    const ext = extname(filePath);
    return servers.some((server) => ext in server.extensionToLanguage);
  }

  /** LSP languageId for the file's extension per the resolved server config. */
  async languageIdFor(cwd: string, filePath: string): Promise<string | undefined> {
    const servers = await this.deps.resolveServers(cwd);
    const ext = extname(filePath);
    return servers.find((server) => ext in server.extensionToLanguage)?.extensionToLanguage[ext];
  }

  /** Raw session for the file's language server (editor bridge). Starts it if needed. */
  openSession(cwd: string, filePath: string): Promise<StdioLspSession> {
    return this.sessionFor(cwd, filePath);
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

  private async sessionFor(cwd: string, filePath: string): Promise<StdioLspSession> {
    const servers = await this.deps.resolveServers(cwd);
    if (servers.length === 0) {
      throw new Error(
        'No LSP servers configured. Enable a workspace plugin that declares lspServers (e.g. typescript-lsp) and trust it.',
      );
    }
    const ext = extname(filePath);
    const config = servers.find((server) => ext in server.extensionToLanguage);
    if (!config) {
      throw new Error(
        `No LSP server maps extension ${ext || '(none)'}. Enabled servers: ${servers
          .map((server) => server.serverId)
          .join(', ')}`,
      );
    }
    const key = `${cwd}::${config.serverId}`;
    let promise = this.sessions.get(key);
    if (!promise) {
      promise = StdioLspSession.start(config, cwd).catch((err) => {
        this.sessions.delete(key);
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to start LSP "${config.serverId}" (${config.command}): ${detail}. Install the binary or ensure it is on PATH (e.g. npm i -g typescript-language-server typescript).`,
        );
      });
      this.sessions.set(key, promise);
      void promise
        .then((session) => {
          // Drop dead sessions so the next call starts a fresh server (fresh
          // document state — no stale caches).
          void session.exited.then(() => {
            if (this.sessions.get(key) === promise) {
              this.sessions.delete(key);
            }
          });
          this.deps.onSessionOpened?.(cwd, filePath);
        })
        .catch(() => {
          // start failure is handled by the sessionFor caller
        });
    }
    return promise;
  }
}
