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
    app.get('/api/providers', async (c) => {
      return c.json(await this.deps.listProviders.execute());
    });

    app.post('/api/providers', async (c) => {
      const body = createProviderBody.parse(await c.req.json());
      const provider = await this.deps.createProvider.execute({
        name: body.name,
        driver: body.driver,
        apiUrl: body.apiUrl ?? undefined,
        apiKey: body.apiKey ?? undefined,
        enabled: body.enabled,
      });
      return c.json(provider, 201);
    });

    // Static /export and /import must precede /:id lookups.
    app.get('/api/providers/export', async (c) => {
      return c.json(await this.deps.exportProviders.execute());
    });

    app.post('/api/providers/import', async (c) => {
      const body = importProvidersBody.parse(await c.req.json());
      return c.json(await this.deps.importProviders.execute({ providers: body.providers }));
    });

    app.get('/api/providers/:id', async (c) => {
      return c.json(await this.deps.getProvider.execute({ id: c.req.param('id') }));
    });

    app.patch('/api/providers/:id', async (c) => {
      const body = updateProviderBody.parse(await c.req.json());
      return c.json(
        await this.deps.updateProvider.execute({
          id: c.req.param('id'),
          ...body,
        }),
      );
    });

    app.delete('/api/providers/:id', async (c) => {
      await this.deps.deleteProvider.execute({ id: c.req.param('id') });
      return c.body(null, 204);
    });

    app.post('/api/providers/:id/discover', async (c) => {
      const found = await this.deps.discoverProviderModels.execute({ id: c.req.param('id') });
      return c.json({ found });
    });

    app.post('/api/providers/:id/models', async (c) => {
      const body = (await c.req.json()) as { name: string; kind?: string; metadata?: unknown };
      const model = await this.deps.createProviderModel.execute({
        providerId: c.req.param('id'),
        name: body.name,
        kind: body.kind,
        metadata: body.metadata,
      });
      return c.json(model, 201);
    });

    app.patch('/api/providers/:id/models/:modelId', async (c) => {
      const body = (await c.req.json()) as { name?: string; kind?: string; metadata?: unknown };
      const model = await this.deps.updateProviderModel.execute({
        providerId: c.req.param('id'),
        modelId: c.req.param('modelId'),
        name: body.name,
        kind: body.kind,
        metadata: body.metadata,
      });
      return c.json(model);
    });

    app.delete('/api/providers/:id/models/:modelId', async (c) => {
      await this.deps.deleteProviderModel.execute({
        providerId: c.req.param('id'),
        modelId: c.req.param('modelId'),
      });
      return c.body(null, 204);
    });
  }
}
