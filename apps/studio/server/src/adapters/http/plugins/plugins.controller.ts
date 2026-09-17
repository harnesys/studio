import type { Hono } from 'hono';
import type { ApproveServerInput } from '../../../application/plugins/approve-server.use-case.ts';
import type { InstallPluginInput } from '../../../application/plugins/install-plugin.use-case.ts';
import type { ListPluginsInput } from '../../../application/plugins/list-plugins.use-case.ts';
import type { RemovePluginInput } from '../../../application/plugins/remove-plugin.use-case.ts';
import type { SetGrantsInput } from '../../../application/plugins/set-grants.use-case.ts';
import type { SetPluginOptionInput } from '../../../application/plugins/set-plugin-option.use-case.ts';
import type { UpdatePluginInput } from '../../../application/plugins/update-plugin.use-case.ts';
import {
  approveServerBody,
  installPluginBody,
  removePluginBody,
  updatePluginBody,
} from './plugins.body.ts';
import { setGrantsBody } from './plugins.grants.body.ts';
import { setPluginOptionBody } from './plugins.options.body.ts';

export type PluginsControllerDeps = {
  listPlugins: ListPluginsInput;
  installPlugin: InstallPluginInput;
  updatePlugin: UpdatePluginInput;
  setGrants: SetGrantsInput;
  approveServer: ApproveServerInput;
  setPluginOption: SetPluginOptionInput;
  removePlugin: RemovePluginInput;
};

export class PluginsController {
  constructor(private readonly deps: PluginsControllerDeps) {}

  register(app: Hono): void {
    const base = '/api/workspaces/:workspaceId/plugins';

    app.get(base, async (c) => {
      return c.json(
        await this.deps.listPlugins.execute({ workspaceId: c.req.param('workspaceId') }),
      );
    });

    app.post(`${base}/install`, async (c) => {
      const body = installPluginBody.parse(await c.req.json());
      const result = await this.deps.installPlugin.execute({
        workspaceId: c.req.param('workspaceId'),
        ...(body.source !== undefined ? { source: body.source } : {}),
        ...(body.path !== undefined ? { path: body.path } : {}),
        ...(body.ref !== undefined ? { ref: body.ref } : {}),
        ...(body.registryId !== undefined ? { registryId: body.registryId } : {}),
        ...(body.catalogPluginName !== undefined
          ? { catalogPluginName: body.catalogPluginName }
          : {}),
        ...(body.pluginName !== undefined ? { pluginName: body.pluginName } : {}),
      });
      return c.json(result, 201);
    });

    app.post(`${base}/:name/update`, async (c) => {
      const raw = await c.req.json().catch(() => undefined);
      const body = updatePluginBody.parse(raw ?? {});
      const result = await this.deps.updatePlugin.execute({
        workspaceId: c.req.param('workspaceId'),
        name: c.req.param('name'),
        ...(body.ref !== undefined ? { ref: body.ref } : {}),
      });
      return c.json(result);
    });

    app.put(`${base}/:name/grants`, async (c) => {
      const body = setGrantsBody.parse(await c.req.json());
      const plugin = await this.deps.setGrants.execute({
        workspaceId: c.req.param('workspaceId'),
        name: c.req.param('name'),
        classes: body.classes,
      });
      return c.json({ plugin });
    });

    app.post(`${base}/:name/approvals`, async (c) => {
      const body = approveServerBody.parse(await c.req.json());
      const plugin = await this.deps.approveServer.execute({
        workspaceId: c.req.param('workspaceId'),
        name: c.req.param('name'),
        serverId: body.serverId,
      });
      return c.json({ plugin }, 201);
    });

    app.put(`${base}/:name/options`, async (c) => {
      const body = setPluginOptionBody.parse(await c.req.json());
      const result = await this.deps.setPluginOption.execute({
        workspaceId: c.req.param('workspaceId'),
        name: c.req.param('name'),
        key: body.key,
        value: body.value,
      });
      return c.json(result);
    });

    app.delete(`${base}/:name`, async (c) => {
      const queryDeleteData = c.req.query('deleteData');
      const raw = await c.req.json().catch(() => undefined);
      const body = removePluginBody.parse(raw ?? {});
      const deleteData = body.deleteData ?? (queryDeleteData === 'true' || queryDeleteData === '1');
      await this.deps.removePlugin.execute({
        workspaceId: c.req.param('workspaceId'),
        name: c.req.param('name'),
        ...(deleteData ? { deleteData: true } : {}),
      });
      return c.body(null, 204);
    });
  }
}
