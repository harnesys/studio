import { extname } from 'node:path';
import type { PluginLspServer } from 'harnesys';
import type { LspDiagnostic, LspHover, LspLocation, LspPort } from 'harnesys/lsp';
import { StdioLspSession } from './stdio-lsp-session.ts';

export type StudioLspAdapterDeps = {
  /** Resolve LSP server configs for a workspace cwd. */
  resolveServers: (cwd: string) => PluginLspServer[] | Promise<PluginLspServer[]>;
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
    }
    return promise;
  }
}
