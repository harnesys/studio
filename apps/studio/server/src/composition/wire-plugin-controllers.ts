import type { Hono } from 'hono';
import { LspBridgeController } from '../adapters/http/lsp/lsp-bridge.controller.ts';
import { PluginRegistriesController } from '../adapters/http/plugins/plugin-registries.controller.ts';
import { PluginsController } from '../adapters/http/plugins/plugins.controller.ts';
import type { StudioLspAdapter } from '../adapters/lsp/studio-lsp.adapter.ts';
import type { SqlitePluginRegistriesAdapter } from '../adapters/store/sqlite/repos/sqlite-plugin-registries.adapter.ts';
import type { SqlitePluginsAdapter } from '../adapters/store/sqlite/repos/sqlite-plugins.adapter.ts';
import type { SqliteWorkspaceRepo } from '../adapters/store/sqlite/repos/sqlite-workspace.repo.ts';
import type { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
import { ApproveServerUseCase } from '../application/plugins/approve-server.use-case.ts';
import { EnableWorkspacePluginUseCase } from '../application/plugins/enable-workspace-plugin.use-case.ts';
import { InstallPluginUseCase } from '../application/plugins/install-plugin.use-case.ts';
import { ListPluginsUseCase } from '../application/plugins/list-plugins.use-case.ts';
import { RemovePluginUseCase } from '../application/plugins/remove-plugin.use-case.ts';
import { SetGrantsUseCase } from '../application/plugins/set-grants.use-case.ts';
import {
  AddPluginRegistryUseCase,
  EnsureDefaultPluginRegistriesUseCase,
  ListPluginCatalogUseCase,
  ListPluginRegistriesUseCase,
  RemovePluginRegistryUseCase,
  SyncPluginRegistryUseCase,
} from '../application/plugins/sync-plugin-registry.use-case.ts';
import { UpdatePluginUseCase } from '../application/plugins/update-plugin.use-case.ts';

export type WirePluginControllersDeps = {
  app: Hono;
  home: string;
  pluginRepo: SqlitePluginsAdapter;
  pluginRegistryRepo: SqlitePluginRegistriesAdapter;
  workspaceRepo: SqliteWorkspaceRepo;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  lsp: StudioLspAdapter;
};

export function wirePluginControllers(d: WirePluginControllersDeps): void {
  const syncPluginRegistry = new SyncPluginRegistryUseCase(d.pluginRegistryRepo, d.home);
  const addPluginRegistry = new AddPluginRegistryUseCase(
    d.pluginRegistryRepo,
    d.home,
    syncPluginRegistry,
  );
  const ensureDefaultPluginRegistries = new EnsureDefaultPluginRegistriesUseCase(
    d.pluginRegistryRepo,
    addPluginRegistry,
    syncPluginRegistry,
  );

  new PluginsController({
    listPlugins: new ListPluginsUseCase(d.pluginRepo),
    installPlugin: new InstallPluginUseCase(
      d.pluginRepo,
      d.home,
      d.workspaceHarnesys,
      d.pluginRegistryRepo,
    ),
    updatePlugin: new UpdatePluginUseCase(
      d.pluginRepo,
      d.workspaceHarnesys,
      d.pluginRegistryRepo,
      syncPluginRegistry,
    ),
    setGrants: new SetGrantsUseCase(d.pluginRepo, d.workspaceHarnesys),
    approveServer: new ApproveServerUseCase(d.pluginRepo, d.workspaceHarnesys),
    enableWorkspacePlugin: new EnableWorkspacePluginUseCase(
      d.pluginRepo,
      d.workspaceRepo,
      d.workspaceHarnesys,
    ),
    removePlugin: new RemovePluginUseCase(d.pluginRepo, d.workspaceHarnesys),
  }).register(d.app);

  new PluginRegistriesController({
    listRegistries: new ListPluginRegistriesUseCase(
      d.pluginRegistryRepo,
      ensureDefaultPluginRegistries,
    ),
    addRegistry: addPluginRegistry,
    syncRegistry: syncPluginRegistry,
    removeRegistry: new RemovePluginRegistryUseCase(d.pluginRegistryRepo),
    listCatalog: new ListPluginCatalogUseCase(d.pluginRegistryRepo, ensureDefaultPluginRegistries),
  }).register(d.app);

  new LspBridgeController({
    app: d.app,
    workspaceRepo: d.workspaceRepo,
    lsp: d.lsp,
  }).register();
}
