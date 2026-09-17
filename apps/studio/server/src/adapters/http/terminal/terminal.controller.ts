import type { Hono } from 'hono';
import type { WSContext } from 'hono/ws';
import { NotFoundError } from '../../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../../domain/workspace.port.ts';
import { terminalSessions } from '../../terminal/terminal-sessions.ts';
import { upgradeWebSocket } from '../lsp/bun-websocket.ts';

type ClientMessage = { type: 'in'; data: string } | { type: 'resize'; cols: number; rows: number };

type ServerMessage =
  | { type: 'history'; data: string }
  | { type: 'out'; data: string }
  | { type: 'exit'; code: number | null };

function rawOf(ws: WSContext): object {
  return (ws as { raw?: object }).raw ?? ws;
}

type Attachment = {
  sessionId: string;
  unsubscribe: () => void;
};

/**
 * REST session CRUD + WebSocket PTY bridge.
 * GET /api/workspaces/:id/terminals
 * POST /api/workspaces/:id/terminals
 * DELETE /api/workspaces/:id/terminals/:sessionId
 * GET /api/terminals/:sessionId  (WebSocket)
 */
export class TerminalController {
  private readonly attachments = new WeakMap<object, Attachment>();

  constructor(
    private readonly deps: {
      app: Hono;
      workspaceRepo: WorkspaceRepository;
    },
  ) {}

  register(): void {
    this.deps.app.get('/api/workspaces/:id/terminals', (c) => {
      const workspaceId = c.req.param('id');
      const workspace = this.deps.workspaceRepo.findById(workspaceId);
      if (!workspace) {
        throw new NotFoundError('workspace not found');
      }
      return c.json(terminalSessions.list(workspaceId));
    });

    this.deps.app.post('/api/workspaces/:id/terminals', (c) => {
      const workspaceId = c.req.param('id');
      const workspace = this.deps.workspaceRepo.findById(workspaceId);
      if (!workspace) {
        throw new NotFoundError('workspace not found');
      }
      const record = terminalSessions.create(workspaceId, workspace.path);
      return c.json(record, 201);
    });

    this.deps.app.delete('/api/workspaces/:id/terminals/:sessionId', (c) => {
      const workspaceId = c.req.param('id');
      const sessionId = c.req.param('sessionId');
      const workspace = this.deps.workspaceRepo.findById(workspaceId);
      if (!workspace) {
        throw new NotFoundError('workspace not found');
      }
      const session = terminalSessions.get(sessionId);
      if (!session || session.workspaceId !== workspaceId) {
        throw new NotFoundError('terminal session not found');
      }
      terminalSessions.delete(sessionId);
      return c.body(null, 204);
    });

    this.deps.app.get('/api/terminals/:sessionId', async (c) => {
      const sessionId = c.req.param('sessionId');
      const session = terminalSessions.get(sessionId);
      if (!session) {
        return c.json({ error: 'terminal session not found' }, 404);
      }

      const cols = Number(c.req.query('cols') ?? '80');
      const rows = Number(c.req.query('rows') ?? '24');

      const upgrade = upgradeWebSocket(() => ({
        onOpen: (_evt, ws) => {
          this.attach(sessionId, ws, cols, rows);
        },
        onMessage: (evt, ws) => {
          this.onMessage(ws, evt.data);
        },
        onClose: (_evt, ws) => {
          this.detach(ws);
        },
      }));
      return await upgrade(c, async () => {});
    });
  }

  private attach(sessionId: string, ws: WSContext, cols: number, rows: number): void {
    const session = terminalSessions.get(sessionId);
    if (!session) {
      ws.close(1008, 'terminal session not found');
      return;
    }

    terminalSessions.resize(sessionId, cols, rows);

    const history = terminalSessions.scrollback(sessionId) ?? '';
    if (history.length > 0 && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'history', data: history } satisfies ServerMessage));
    }

    if (session.exited && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'exit', code: session.exitCode } satisfies ServerMessage));
    }

    const unsubscribe = terminalSessions.subscribe(
      sessionId,
      (chunk) => {
        if (ws.readyState !== 1) {
          return;
        }
        ws.send(JSON.stringify({ type: 'out', data: chunk } satisfies ServerMessage));
      },
      (code) => {
        if (ws.readyState !== 1) {
          return;
        }
        ws.send(JSON.stringify({ type: 'exit', code } satisfies ServerMessage));
      },
    );
    if (!unsubscribe) {
      ws.close(1011, 'failed to attach');
      return;
    }

    this.attachments.set(rawOf(ws), { sessionId, unsubscribe });
  }

  private onMessage(ws: WSContext, data: unknown): void {
    const attachment = this.attachments.get(rawOf(ws));
    if (!attachment || typeof data !== 'string') {
      return;
    }
    let message: ClientMessage;
    try {
      message = JSON.parse(data) as ClientMessage;
    } catch {
      return;
    }
    if (message.type === 'in') {
      if (typeof message.data !== 'string') {
        return;
      }
      terminalSessions.write(attachment.sessionId, message.data);
      return;
    }
    if (message.type === 'resize') {
      if (typeof message.cols !== 'number' || typeof message.rows !== 'number') {
        return;
      }
      terminalSessions.resize(attachment.sessionId, message.cols, message.rows);
    }
  }

  private detach(ws: WSContext): void {
    const attachment = this.attachments.get(rawOf(ws));
    if (!attachment) {
      return;
    }
    attachment.unsubscribe();
    this.attachments.delete(rawOf(ws));
  }
}
