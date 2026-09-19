import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { CancelKnowledgeIndexInput } from '../../../application/memory/cancel-knowledge-index.use-case.ts';
import type { DeleteKnowledgeRootInput } from '../../../application/memory/delete-knowledge-root.use-case.ts';
import type { GetKnowledgeIndexStateInput } from '../../../application/memory/get-knowledge-index-state.use-case.ts';
import type { GetKnowledgeSettingsInput } from '../../../application/memory/get-knowledge-settings.use-case.ts';
import type { GetKnowledgeStatsInput } from '../../../application/memory/get-knowledge-stats.use-case.ts';
import type { ListKnowledgeFilesInput } from '../../../application/memory/list-knowledge-files.use-case.ts';
import type { ListKnowledgeRootsInput } from '../../../application/memory/list-knowledge-roots.use-case.ts';
import type { PutKnowledgeSettingsInput } from '../../../application/memory/put-knowledge-settings.use-case.ts';
import type { ReindexKnowledgeInput } from '../../../application/memory/reindex-knowledge.use-case.ts';
import type { SearchKnowledgeInput } from '../../../application/memory/search-knowledge.use-case.ts';
import type { UpsertKnowledgeRootInput } from '../../../application/memory/upsert-knowledge-root.use-case.ts';
import { SSE_KEEP_ALIVE_MS } from '../../../config/constants.ts';
import type { KnowledgeIndexEventsPort } from '../../../domain/knowledge-index-events.port.ts';
import type { WorkspaceRepository } from '../../../domain/workspace.port.ts';
import {
  listKnowledgeFilesQuery,
  putKnowledgeSettingsBody,
  searchMemoryQuery,
  upsertKnowledgeRootBody,
} from './memory.body.ts';

export type KnowledgeControllerDeps = {
  listKnowledgeRoots: ListKnowledgeRootsInput;
  upsertKnowledgeRoot: UpsertKnowledgeRootInput;
  deleteKnowledgeRoot: DeleteKnowledgeRootInput;
  getKnowledgeSettings: GetKnowledgeSettingsInput;
  putKnowledgeSettings: PutKnowledgeSettingsInput;
  listKnowledgeFiles: ListKnowledgeFilesInput;
  getKnowledgeIndexState: GetKnowledgeIndexStateInput;
  getKnowledgeStats: GetKnowledgeStatsInput;
  reindexKnowledge: ReindexKnowledgeInput;
  cancelKnowledgeIndex: CancelKnowledgeIndexInput;
  searchKnowledge: SearchKnowledgeInput;
  indexEvents: KnowledgeIndexEventsPort;
  workspaces: WorkspaceRepository;
};

export class KnowledgeController {
  constructor(private readonly deps: KnowledgeControllerDeps) {}

  register(app: Hono): void {
    const base = '/api/workspaces/:workspaceId/knowledge';

    app.get(`${base}/settings`, async (c) => {
      const settings = await this.deps.getKnowledgeSettings.execute({
        workspaceId: c.req.param('workspaceId'),
      });
      return c.json(settings);
    });

    app.put(`${base}/settings`, async (c) => {
      const body = putKnowledgeSettingsBody.parse(await c.req.json());
      const settings = await this.deps.putKnowledgeSettings.execute({
        workspaceId: c.req.param('workspaceId'),
        ...body,
      });
      return c.json(settings);
    });

    app.get(`${base}/roots`, async (c) => {
      const roots = await this.deps.listKnowledgeRoots.execute({
        workspaceId: c.req.param('workspaceId'),
      });
      return c.json(roots);
    });

    app.put(`${base}/roots`, async (c) => {
      const body = upsertKnowledgeRootBody.parse(await c.req.json());
      const root = await this.deps.upsertKnowledgeRoot.execute({
        workspaceId: c.req.param('workspaceId'),
        path: body.path,
        enabled: body.enabled,
      });
      return c.json(root);
    });

    app.delete(`${base}/roots`, async (c) => {
      const path = c.req.query('path');
      await this.deps.deleteKnowledgeRoot.execute({
        workspaceId: c.req.param('workspaceId'),
        path: path ?? '',
      });
      return c.body(null, 204);
    });

    app.get(`${base}/files`, async (c) => {
      const query = listKnowledgeFilesQuery.parse(c.req.query());
      const files = await this.deps.listKnowledgeFiles.execute({
        workspaceId: c.req.param('workspaceId'),
        status: query.status,
      });
      return c.json(files);
    });

    app.get(`${base}/index-state`, async (c) => {
      const state = await this.deps.getKnowledgeIndexState.execute({
        workspaceId: c.req.param('workspaceId'),
      });
      return c.json(state);
    });

    app.get(`${base}/index-state/stream`, async (c) => {
      const workspaceId = c.req.param('workspaceId');
      const ws = this.deps.workspaces.findById(workspaceId);
      if (!ws) {
        return c.body(null, 404);
      }

      c.header('Cache-Control', 'no-cache, no-transform');
      c.header('X-Accel-Buffering', 'no');
      c.header('Connection', 'keep-alive');

      const initial = await this.deps.getKnowledgeIndexState.execute({ workspaceId });

      return streamSSE(c, async (stream) => {
        const keepAlive = setInterval(() => {
          void stream.write(':\n\n').catch(() => {});
        }, SSE_KEEP_ALIVE_MS);

        await stream.writeSSE({
          event: 'index-state',
          data: JSON.stringify(initial),
        });

        const unsubscribe = this.deps.indexEvents.subscribe(workspaceId, (state) => {
          void stream
            .writeSSE({
              event: 'index-state',
              data: JSON.stringify(state),
            })
            .catch(() => {});
        });

        stream.onAbort(() => {
          clearInterval(keepAlive);
          unsubscribe();
        });

        await new Promise<void>((resolve) => {
          stream.onAbort(resolve);
        });
      });
    });

    app.get(`${base}/stats`, async (c) => {
      const stats = await this.deps.getKnowledgeStats.execute({
        workspaceId: c.req.param('workspaceId'),
      });
      return c.json(stats);
    });

    app.post(`${base}/reindex`, async (c) => {
      const state = await this.deps.reindexKnowledge.execute({
        workspaceId: c.req.param('workspaceId'),
      });
      return c.json(state, 202);
    });

    app.post(`${base}/index/cancel`, async (c) => {
      const state = await this.deps.cancelKnowledgeIndex.execute({
        workspaceId: c.req.param('workspaceId'),
      });
      return c.json(state);
    });

    app.get(`${base}/search`, async (c) => {
      const query = searchMemoryQuery.parse(c.req.query());
      const hits = await this.deps.searchKnowledge.execute({
        workspaceId: c.req.param('workspaceId'),
        query: query.query,
        limit: query.limit,
      });
      return c.json(hits);
    });
  }
}
