import type { Hono } from 'hono';
import type {
  AddPluginRegistryInput,
  ListPluginCatalogInput,
  ListPluginRegistriesInput,
  RemovePluginRegistryInput,
  SyncPluginRegistryInput,
} from '../../../application/plugins/sync-plugin-registry.use-case.ts';
import { addPluginRegistryBody } from './plugin-registries.body.ts';
export type PluginRegistriesControllerDeps = {
  listRegistries: ListPluginRegistriesInput;
  addRegistry: AddPluginRegistryInput;
  syncRegistry: SyncPluginRegistryInput;
  removeRegistry: RemovePluginRegistryInput;
  listCatalog: ListPluginCatalogInput;
};
export class PluginRegistriesController {
  constructor(private readonly deps: PluginRegistriesControllerDeps) {}
  register(app: Hono): void {
    app.get('/api/plugin-registries', async (c) => {
      return c.json(await this.deps.listRegistries.execute());
    });
    app.post('/api/plugin-registries', async (c) => {
      const body = addPluginRegistryBody.parse(await c.req.json());
      const registry = await this.deps.addRegistry.execute({
        source: body.source,
        ...(body.kind ? { kind: body.kind } : {}),
      });
      return c.json(registry, 201);
    });
    app.post('/api/plugin-registries/:id/refresh', async (c) => {
      const registry = await this.deps.syncRegistry.execute(c.req.param('id'));
      return c.json(registry);
    });
    app.delete('/api/plugin-registries/:id', async (c) => {
      await this.deps.removeRegistry.execute(c.req.param('id'));
      return c.body(null, 204);
    });
    app.get('/api/plugin-catalog', async (c) => {
      const q = c.req.query('q') ?? undefined;
      const registryId = c.req.query('registryId') ?? undefined;
      return c.json(
        await this.deps.listCatalog.execute({
          ...(q ? { q } : {}),
          ...(registryId ? { registryId } : {}),
        }),
      );
    });
  }
}
