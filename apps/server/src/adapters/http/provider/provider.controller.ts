import type { Hono } from 'hono';
import type { CreateProviderInput } from '../../../application/providers/create-provider.use-case.ts';
import type { CreateProviderModelInput } from '../../../application/providers/create-provider-model.use-case.ts';
import type { DeleteProviderInput } from '../../../application/providers/delete-provider.use-case.ts';
import type { DeleteProviderModelInput } from '../../../application/providers/delete-provider-model.use-case.ts';
import type { DiscoverProviderModelsInput } from '../../../application/providers/discover-provider-models.use-case.ts';
import type { ExportProvidersInput } from '../../../application/providers/export-providers.use-case.ts';
import type { GetProviderInput } from '../../../application/providers/get-provider.use-case.ts';
import type { ImportProvidersInput } from '../../../application/providers/import-providers.use-case.ts';
import type { ListProvidersInput } from '../../../application/providers/list-providers.use-case.ts';
import type { UpdateProviderInput } from '../../../application/providers/update-provider.use-case.ts';
import type { UpdateProviderModelInput } from '../../../application/providers/update-provider-model.use-case.ts';
import { createProviderBody, importProvidersBody, updateProviderBody } from './provider.body.ts';
export type ProviderControllerDeps = {
  listProviders: ListProvidersInput;
  getProvider: GetProviderInput;
  createProvider: CreateProviderInput;
  updateProvider: UpdateProviderInput;
  deleteProvider: DeleteProviderInput;
  exportProviders: ExportProvidersInput;
  importProviders: ImportProvidersInput;
  discoverProviderModels: DiscoverProviderModelsInput;
  createProviderModel: CreateProviderModelInput;
  updateProviderModel: UpdateProviderModelInput;
  deleteProviderModel: DeleteProviderModelInput;
};
export class ProviderController {
  constructor(private readonly deps: ProviderControllerDeps) {}
  register(app: Hono): void {
    const base = '/api/workspaces/:workspaceId/providers';
    app.get(base, async (c) => {
      return c.json(
        await this.deps.listProviders.execute({ workspaceId: c.req.param('workspaceId') }),
      );
    });
    app.post(base, async (c) => {
      const body = createProviderBody.parse(await c.req.json());
      const provider = await this.deps.createProvider.execute({
        workspaceId: c.req.param('workspaceId'),
        name: body.name,
        driver: body.driver,
        apiUrl: body.apiUrl ?? undefined,
        apiKey: body.apiKey ?? undefined,
        enabled: body.enabled,
      });
      return c.json(provider, 201);
    });
    app.get(`${base}/export`, async (c) => {
      return c.json(
        await this.deps.exportProviders.execute({ workspaceId: c.req.param('workspaceId') }),
      );
    });
    app.post(`${base}/import`, async (c) => {
      const body = importProvidersBody.parse(await c.req.json());
      return c.json(
        await this.deps.importProviders.execute({
          workspaceId: c.req.param('workspaceId'),
          providers: body.providers,
        }),
      );
    });
    app.get(`${base}/:id`, async (c) => {
      return c.json(
        await this.deps.getProvider.execute({
          workspaceId: c.req.param('workspaceId'),
          id: c.req.param('id'),
        }),
      );
    });
    app.patch(`${base}/:id`, async (c) => {
      const body = updateProviderBody.parse(await c.req.json());
      return c.json(
        await this.deps.updateProvider.execute({
          workspaceId: c.req.param('workspaceId'),
          id: c.req.param('id'),
          ...body,
        }),
      );
    });
    app.delete(`${base}/:id`, async (c) => {
      await this.deps.deleteProvider.execute({
        workspaceId: c.req.param('workspaceId'),
        id: c.req.param('id'),
      });
      return c.body(null, 204);
    });
    app.post(`${base}/:id/discover`, async (c) => {
      const found = await this.deps.discoverProviderModels.execute({
        workspaceId: c.req.param('workspaceId'),
        id: c.req.param('id'),
      });
      return c.json({ found });
    });
    app.post(`${base}/:id/models`, async (c) => {
      const body = (await c.req.json()) as {
        name: string;
        kind?: string;
        metadata?: unknown;
      };
      const model = await this.deps.createProviderModel.execute({
        workspaceId: c.req.param('workspaceId'),
        providerId: c.req.param('id'),
        name: body.name,
        kind: body.kind,
        metadata: body.metadata,
      });
      return c.json(model, 201);
    });
    app.patch(`${base}/:id/models/:modelId`, async (c) => {
      const body = (await c.req.json()) as {
        name?: string;
        kind?: string;
        metadata?: unknown;
      };
      const model = await this.deps.updateProviderModel.execute({
        workspaceId: c.req.param('workspaceId'),
        providerId: c.req.param('id'),
        modelId: c.req.param('modelId'),
        name: body.name,
        kind: body.kind,
        metadata: body.metadata,
      });
      return c.json(model);
    });
    app.delete(`${base}/:id/models/:modelId`, async (c) => {
      await this.deps.deleteProviderModel.execute({
        workspaceId: c.req.param('workspaceId'),
        providerId: c.req.param('id'),
        modelId: c.req.param('modelId'),
      });
      return c.body(null, 204);
    });
  }
}
