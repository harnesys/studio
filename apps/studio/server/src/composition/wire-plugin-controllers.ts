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
import { InstallPluginUseCase } from '../application/plugins/install-plugin.use-case.ts';
import type {
  LspByWorkspace,
  LspWorkspaceRef,
} from '../application/plugins/invalidate-plugin-workspaces.ts';
import { ListPluginsUseCase } from '../application/plugins/list-plugins.use-case.ts';
import { RemovePluginUseCase } from '../application/plugins/remove-plugin.use-case.ts';
import { SetGrantsUseCase } from '../application/plugins/set-grants.use-case.ts';
import { SetPluginOptionUseCase } from '../application/plugins/set-plugin-option.use-case.ts';
import {
  AddPluginRegistryUseCase,
  EnsureDefaultPluginRegistriesUseCase,
  ListPluginCatalogUseCase,
  ListPluginRegistriesUseCase,
  RemovePluginRegistryUseCase,
  SyncPluginRegistryUseCase,
} from '../application/plugins/sync-plugin-registry.use-case.ts';
import { UpdatePluginUseCase } from '../application/plugins/update-plugin.use-case.ts';
import type { SecretStore } from '../domain/secret-store.port.ts';
import type { NodeSupervisor } from './node-supervisor.ts';
import { requireNode } from './routing-helpers.ts';

export type WirePluginControllersDeps = {
  app: Hono;
  home: string;
  pluginRepo: SqlitePluginsAdapter;
  pluginRegistryRepo: SqlitePluginRegistriesAdapter;
  workspaceRepo: SqliteWorkspaceRepo;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  lsp: StudioLspAdapter;
  secretStore?: SecretStore;
  supervisor?: NodeSupervisor;
};

export function wirePluginControllers(d: WirePluginControllersDeps): void {
  const lspByWorkspace = createLspByWorkspace(d);
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
      d.workspaceRepo,
      d.workspaceHarnesys,
      d.pluginRegistryRepo,
      lspByWorkspace,
    ),
    updatePlugin: new UpdatePluginUseCase(
      d.pluginRepo,
      d.workspaceHarnesys,
      d.pluginRegistryRepo,
      syncPluginRegistry,
      lspByWorkspace,
    ),
    setGrants: new SetGrantsUseCase(d.pluginRepo, d.workspaceHarnesys, lspByWorkspace),
    approveServer: new ApproveServerUseCase(d.pluginRepo, d.workspaceHarnesys, lspByWorkspace),
    setPluginOption: new SetPluginOptionUseCase(
      d.pluginRepo,
      d.workspaceHarnesys,
      d.secretStore,
      lspByWorkspace,
    ),
    removePlugin: new RemovePluginUseCase(d.pluginRepo, d.workspaceHarnesys, lspByWorkspace),
  }).register(d.app);

  new PluginRegistriesController({
    listRegistries: new ListPluginRegistriesUseCase(
      d.pluginRegistryRepo,
      ensureDefaultPluginRegistries,
    ),
    addRegistry: addPluginRegistry,
    syncRegistry: syncPluginRegistry,
    removeRegistry: new RemovePluginRegistryUseCase(d.pluginRegistryRepo),
    listCatalog: new ListPluginCatalogUseCase(
      d.pluginRegistryRepo,
      ensureDefaultPluginRegistries,
      d.pluginRepo,
    ),
  }).register(d.app);

  new LspBridgeController({
    app: d.app,
    workspaceRepo: d.workspaceRepo,
    lsp: d.lsp,
  }).register();
}

/**
 * Plugin mutations invalidate the runtime plus the workspace LSP sessions.
 * Routing contexts resolve the node-local adapter via the supervisor;
 * node-local wiring uses the workspace repo row plus the shared adapter.
 */
function createLspByWorkspace(d: WirePluginControllersDeps): LspByWorkspace {
  const supervisor = d.supervisor;
  if (supervisor) {
    return (id: string): LspWorkspaceRef | undefined => {
      try {
        const node = requireNode(supervisor, id);
        const workspace = node.store.workspaceRepo.findById(id);
        return { cwd: workspace?.path ?? node.node.path, lsp: node.host.lsp };
      } catch {
        return undefined;
      }
    };
  }
  return (id: string): LspWorkspaceRef | undefined => {
    const workspace = d.workspaceRepo.findById(id);
    if (!workspace) {
      return undefined;
    }
    return { cwd: workspace.path, lsp: d.lsp };
  };
}
