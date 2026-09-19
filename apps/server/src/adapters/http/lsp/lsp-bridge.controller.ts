import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Hono } from 'hono';
import type { WSContext } from 'hono/ws';
import type { StdioLspSession } from '../../lsp/stdio-lsp-session.ts';
import type { StudioLspAdapter } from '../../lsp/studio-lsp.adapter.ts';
import type { SqliteWorkspaceRepo } from '../../store/sqlite/repos/sqlite-workspace.repo.ts';
import { upgradeWebSocket } from './bun-websocket.ts';

const FILE_SCHEME = 'file://';
function rawOf(ws: WSContext): object {
  return (
    (
      ws as {
        raw?: object;
      }
    ).raw ?? ws
  );
}
type ConnectionState = {
  session?: StdioLspSession;
  unsubscribe?: () => void;
  pending: string[];
  languageId?: string;
};
export class LspBridgeController {
  private readonly connections = new WeakMap<object, ConnectionState>();
  constructor(
    private readonly deps: {
      app: Hono;
      workspaceRepo: SqliteWorkspaceRepo;
      lsp: StudioLspAdapter;
    },
  ) {}
  register(): void {
    this.deps.app.get('/api/lsp', async (c) => {
      const workspaceId = c.req.query('workspace') ?? '';
      const relPath = c.req.query('path') ?? '';
      const workspace = this.deps.workspaceRepo.findById(workspaceId);
      if (!workspace || relPath.length === 0) {
        return c.json({ error: 'workspace or path not found' }, 404);
      }
      if (!(await this.deps.lsp.hasServerFor(workspace.path, relPath))) {
        return c.json({ error: 'no LSP server for this file' }, 404);
      }
      const upgrade = upgradeWebSocket(() => ({
        onOpen: (_evt, ws) => {
          this.connections.set(rawOf(ws), { pending: [] });
          void this.connect(workspaceId, relPath, ws).catch((error: unknown) => {
            const detail = error instanceof Error ? error.message : String(error);
            ws.close(1011, truncateCloseReason(`failed to start language server: ${detail}`));
          });
        },
        onMessage: (evt, ws) => {
          this.forward(ws, evt.data);
        },
        onClose: (_evt, ws) => {
          this.teardown(ws);
        },
      }));
      return upgrade(c, async () => {});
    });
  }
  private async connect(workspaceId: string, relPath: string, ws: WSContext): Promise<void> {
    const workspace = this.deps.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      ws.close(1008, 'workspace not found');
      return;
    }
    const session = await this.deps.lsp.openSession(workspace.path, relPath);
    const rootHref = pathToFileURL(session.workspaceRoot).href;
    const unsubscribe = session.onMessage((message) => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(rewriteUris(message, (uri) => absoluteToEditorUri(uri, rootHref))));
      }
    });
    const state = this.connections.get(rawOf(ws));
    if (!state) {
      unsubscribe();
      return;
    }
    state.session = session;
    state.unsubscribe = unsubscribe;
    state.languageId = await this.deps.lsp.languageIdFor(workspace.path, relPath);
    for (const raw of state.pending.splice(0)) {
      this.forwardRaw(ws, raw);
    }
  }
  private forward(ws: WSContext, data: unknown): void {
    const state = this.connections.get(rawOf(ws));
    if (!state || typeof data !== 'string') {
      return;
    }
    if (!state.session) {
      if (state.pending.length < 100) {
        state.pending.push(data);
      }
      return;
    }
    this.forwardRaw(ws, data);
  }
  private forwardRaw(ws: WSContext, data: string): void {
    const state = this.connections.get(rawOf(ws));
    if (!state?.session) {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (parsed !== null && typeof parsed === 'object') {
      const root = state.session.workspaceRoot;
      const message = parsed as {
        method?: string;
        params?: {
          textDocument?: {
            languageId?: string;
          };
        };
      };
      if (
        message.method === 'textDocument/didOpen' &&
        message.params?.textDocument &&
        state.languageId
      ) {
        message.params.textDocument.languageId = state.languageId;
      }
      state.session.sendRaw(
        rewriteUris(message as Record<string, unknown>, (uri) => editorToAbsoluteUri(uri, root)),
      );
    }
  }
  private teardown(ws: WSContext): void {
    const state = this.connections.get(rawOf(ws));
    state?.unsubscribe?.();
    this.connections.delete(ws);
  }
}
function rewriteUris<T>(value: T, map: (uri: string) => string): T {
  if (typeof value === 'string') {
    return (value.startsWith(FILE_SCHEME) ? map(value) : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteUris(item, map)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = rewriteUris(item, map);
    }
    return out as T;
  }
  return value;
}
function editorToAbsoluteUri(uri: string, workspaceRoot: string): string {
  if (!uri.startsWith(FILE_SCHEME) || uri === FILE_SCHEME) {
    return uri;
  }
  const rest = uri.slice(FILE_SCHEME.length);
  if (rest.startsWith('/')) {
    const rel = decodeURIComponent(rest.slice(1));
    return pathToFileURL(join(workspaceRoot, rel)).href;
  }
  return uri;
}
function absoluteToEditorUri(uri: string, rootHref: string): string {
  if (rootHref !== FILE_SCHEME && uri.startsWith(`${rootHref}/`)) {
    return `${FILE_SCHEME}/${uri.slice(rootHref.length + 1)}`;
  }
  return uri;
}
function truncateCloseReason(reason: string): string {
  return reason.length <= 120 ? reason : `${reason.slice(0, 117)}...`;
}
