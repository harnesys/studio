import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Hono } from 'hono';
import type { WSContext } from 'hono/ws';
import type { StdioLspSession } from '../../lsp/stdio-lsp-session.ts';
import type { StudioLspAdapter } from '../../lsp/studio-lsp.adapter.ts';
import type { SqliteWorkspaceRepo } from '../../store/sqlite/repos/sqlite-workspace.repo.ts';
import { upgradeWebSocket } from './bun-websocket.ts';

const FILE_SCHEME = 'file://';

/**
 * Stable connection key. hono/bun builds a fresh WSContext per event, so the
 * context object cannot key connection state; the wrapped native socket can.
 */
function rawOf(ws: WSContext): object {
  return (ws as { raw?: object }).raw ?? ws;
}

type ConnectionState = {
  /** Undefined while the language server is still starting. */
  session?: StdioLspSession;
  unsubscribe?: () => void;
  /** Client messages received before the session was ready. */
  pending: string[];
  /** LSP languageId per the plugin config; overrides the client's value in didOpen. */
  languageId?: string;
};

/**
 * Raw LSP-over-WebSocket bridge for the Studio editor.
 * GET /api/lsp?workspace=<id>&path=<relative file path>
 *
 * The client speaks plain LSP JSON-RPC with document URIs shaped `file:///<relative>`;
 * this controller rewrites them to absolute `file://` URIs of the workspace checkout
 * on the way in, and back on the way out, so one session serves both the editor and
 * the agent lsp_* tools.
 */
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
          void this.connect(workspaceId, relPath, ws).catch(() => {
            ws.close(1011, 'failed to start language server');
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
    // Flush messages the client sent while the language server was starting.
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
      // Language server still starting — buffer instead of dropping.
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
        params?: { textDocument?: { languageId?: string } };
      };
      // The editor's language id (e.g. Monaco 'typescript') does not distinguish
      // ts from tsx; the plugin config does, and tsserver picks the script kind by it.
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

/** `file:///src/main.tsx` (editor form) → absolute file URI inside the workspace. */
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

/** Absolute file URI under the workspace root → `file:///relative` (editor form). */
function absoluteToEditorUri(uri: string, rootHref: string): string {
  if (rootHref !== FILE_SCHEME && uri.startsWith(`${rootHref}/`)) {
    return `${FILE_SCHEME}/${uri.slice(rootHref.length + 1)}`;
  }
  return uri;
}
