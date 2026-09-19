import type { Hono } from 'hono';
import type { WSContext } from 'hono/ws';
import type { NodeSupervisor } from '../../../composition/node-supervisor.ts';
import { requireNode, scan } from '../../../composition/routing-helpers.ts';
import { NotFoundError, UnavailableError } from '../../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../../domain/workspace.port.ts';
import {
  type TerminalSessionRegistry,
  terminalSessionsFor,
} from '../../terminal/terminal-sessions.ts';
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
  sessions: TerminalSessionRegistry;
  unsubscribe: () => void;
};

/**
 * REST session CRUD + WebSocket PTY bridge over the per-node process job registry.
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
      supervisor?: NodeSupervisor;
    },
  ) {}

  register(): void {
    this.deps.app.get('/api/workspaces/:id/terminals', (c) => {
      const workspaceId = c.req.param('id');
      const node = this.sessionsForWorkspace(workspaceId);
      return c.json(node.sessions.list(workspaceId));
    });

    this.deps.app.post('/api/workspaces/:id/terminals', (c) => {
      const workspaceId = c.req.param('id');
      const node = this.sessionsForWorkspace(workspaceId);
      const record = node.sessions.create(workspaceId, node.cwd);
      return c.json(record, 201);
    });

    this.deps.app.delete('/api/workspaces/:id/terminals/:sessionId', (c) => {
      const workspaceId = c.req.param('id');
      const sessionId = c.req.param('sessionId');
      const node = this.sessionsForWorkspace(workspaceId);
      const session = node.sessions.get(sessionId);
      if (!session || session.workspaceId !== workspaceId) {
        throw new NotFoundError('terminal session not found');
      }
      node.sessions.delete(sessionId);
      return c.body(null, 204);
    });

    this.deps.app.get('/api/terminals/:sessionId', async (c) => {
      const sessionId = c.req.param('sessionId');
      const sessions = this.sessionsForSession(sessionId);
      if (!sessions?.get(sessionId)) {
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

  private sessionsForWorkspace(workspaceId: string): {
    sessions: TerminalSessionRegistry;
    cwd: string;
  } {
    const supervisor = this.deps.supervisor;
    if (!supervisor) {
      if (!this.deps.workspaceRepo.findById(workspaceId)) {
        throw new NotFoundError('workspace not found');
      }
      throw new UnavailableError('workspace runtime not started');
    }
    const node = requireNode(supervisor, workspaceId);
    const workspace = node.store.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    return { sessions: terminalSessionsFor(node.host.jobs), cwd: workspace.path };
  }

  private sessionsForSession(sessionId: string): TerminalSessionRegistry | null {
    const supervisor = this.deps.supervisor;
    if (!supervisor) {
      return null;
    }
    const node = scan(supervisor, (entry) => (entry.host.jobs.get(sessionId) ? entry : undefined));
    return node ? terminalSessionsFor(node.host.jobs) : null;
  }

  private attach(sessionId: string, ws: WSContext, cols: number, rows: number): void {
    const sessions = this.sessionsForSession(sessionId);
    if (!sessions) {
      ws.close(1008, 'terminal session not found');
      return;
    }
    const session = sessions.get(sessionId);
    if (!session) {
      ws.close(1008, 'terminal session not found');
      return;
    }

    sessions.resize(sessionId, cols, rows);

    const history = sessions.scrollback(sessionId) ?? '';
    if (history.length > 0 && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'history', data: history } satisfies ServerMessage));
    }

    if (session.exited && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'exit', code: session.exitCode } satisfies ServerMessage));
    }

    const unsubscribe = sessions.subscribe(
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

    this.attachments.set(rawOf(ws), { sessionId, sessions, unsubscribe });
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
      attachment.sessions.write(attachment.sessionId, message.data);
      return;
    }
    if (message.type === 'resize') {
      if (typeof message.cols !== 'number' || typeof message.rows !== 'number') {
        return;
      }
      attachment.sessions.resize(attachment.sessionId, message.cols, message.rows);
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
