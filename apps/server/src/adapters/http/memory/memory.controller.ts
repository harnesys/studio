import type { Hono } from 'hono';
import type { DeletePinInput } from '../../../application/memory/delete-pin.use-case.ts';
import type { DeleteSemanticInput } from '../../../application/memory/delete-semantic.use-case.ts';
import type { ListPinsInput } from '../../../application/memory/list-pins.use-case.ts';
import type { ListSemanticInput } from '../../../application/memory/list-semantic.use-case.ts';
import type { SearchEpisodicInput } from '../../../application/memory/search-episodic.use-case.ts';
import type { UpdateSemanticInput } from '../../../application/memory/update-semantic.use-case.ts';
import type { UpsertPinInput } from '../../../application/memory/upsert-pin.use-case.ts';
import type { UpsertSemanticInput } from '../../../application/memory/upsert-semantic.use-case.ts';
import {
  listSemanticQuery,
  searchMemoryQuery,
  updateSemanticBody,
  upsertPinBody,
  upsertSemanticBody,
} from './memory.body.ts';
export type MemoryControllerDeps = {
  listPins: ListPinsInput;
  upsertPin: UpsertPinInput;
  deletePin: DeletePinInput;
  listSemantic: ListSemanticInput;
  upsertSemantic: UpsertSemanticInput;
  updateSemantic: UpdateSemanticInput;
  deleteSemantic: DeleteSemanticInput;
  searchEpisodic: SearchEpisodicInput;
};
export class MemoryController {
  constructor(private readonly deps: MemoryControllerDeps) {}
  register(app: Hono): void {
    this.registerAgentMemory(app);
    this.registerWorkspaceMemory(app);
  }
  private registerAgentMemory(app: Hono): void {
    const base = '/api/workspaces/:workspaceId/agents/:agentId';
    app.get(`${base}/pins`, async (c) => {
      const pins = await this.deps.listPins.execute({
        workspaceId: c.req.param('workspaceId'),
        agentId: c.req.param('agentId'),
      });
      return c.json(pins);
    });
    app.put(`${base}/pins/:key`, async (c) => {
      const body = upsertPinBody.parse(await c.req.json());
      const pin = await this.deps.upsertPin.execute({
        workspaceId: c.req.param('workspaceId'),
        agentId: c.req.param('agentId'),
        key: c.req.param('key'),
        text: body.text,
      });
      return c.json(pin);
    });
    app.delete(`${base}/pins/:key`, async (c) => {
      await this.deps.deletePin.execute({
        workspaceId: c.req.param('workspaceId'),
        agentId: c.req.param('agentId'),
        key: c.req.param('key'),
      });
      return c.body(null, 204);
    });
    app.get(`${base}/semantic`, async (c) => {
      const query = listSemanticQuery.parse(c.req.query());
      const rows = await this.deps.listSemantic.execute({
        workspaceId: c.req.param('workspaceId'),
        agentId: c.req.param('agentId'),
        scope: query.scope,
        limit: query.limit,
      });
      return c.json(rows);
    });
    app.post(`${base}/semantic`, async (c) => {
      const body = upsertSemanticBody.parse(await c.req.json());
      const row = await this.deps.upsertSemantic.execute({
        workspaceId: c.req.param('workspaceId'),
        agentId: c.req.param('agentId'),
        scope: body.scope,
        text: body.text,
        key: body.key,
        threadId: body.threadId,
      });
      return c.json(row, 201);
    });
    app.patch(`${base}/semantic/:id`, async (c) => {
      const body = updateSemanticBody.parse(await c.req.json());
      const row = await this.deps.updateSemantic.execute({
        workspaceId: c.req.param('workspaceId'),
        agentId: c.req.param('agentId'),
        id: c.req.param('id'),
        text: body.text,
      });
      return c.json(row);
    });
    app.delete(`${base}/semantic/:id`, async (c) => {
      await this.deps.deleteSemantic.execute({
        workspaceId: c.req.param('workspaceId'),
        agentId: c.req.param('agentId'),
        id: c.req.param('id'),
      });
      return c.body(null, 204);
    });
  }
  private registerWorkspaceMemory(app: Hono): void {
    const base = '/api/workspaces/:workspaceId';
    app.get(`${base}/episodic/search`, async (c) => {
      const query = searchMemoryQuery.parse(c.req.query());
      const hits = await this.deps.searchEpisodic.execute({
        workspaceId: c.req.param('workspaceId'),
        query: query.query,
        threadId: query.threadId,
        limit: query.limit,
      });
      return c.json(hits);
    });
  }
}
