import type { LspServerSpec, ModelsPort, PluginComponent } from 'harnesys';
import { createProcessJobRegistry, type ProcessJobRegistry } from 'harnesys';
import { createHarnesysModelsPort } from '../adapters/harnesys-models-port.ts';
import { StudioLspAdapter } from '../adapters/lsp/studio-lsp.adapter.ts';
import type { WorkspacePluginLspServer } from '../adapters/lsp/workspace-lsp-file.ts';
import { resolveWorkspaceLsp } from '../adapters/lsp/workspace-lsp-file.ts';
import { MonitorJobRegistrarAdapter } from '../adapters/monitor-job-registrar.adapter.ts';
import { RunHookBuses } from '../adapters/run-hook-buses.adapter.ts';
import { SqliteRuntimeStateRepo } from '../adapters/store/sqlite/repos/sqlite-runtime-state-repo.adapter.ts';
import { SqliteUnitOfWork } from '../adapters/store/sqlite/sqlite-unit-of-work.ts';
import { StudioRunTargets } from '../adapters/studio-run-targets.adapter.ts';
import { ThreadRuntimeRegistry } from '../adapters/thread-runtime.registry.ts';
import { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
import { createEpisodicOnCompacted } from '../application/memory/episodic-on-compacted.ts';
import { GetThreadPlanUseCase } from '../application/plans/get-thread-plan.use-case.ts';
import type { PluginAgentCatalog } from '../application/plugins/plugin-agents.ts';
import { pluginUserConfig, substituteLspSpec } from '../application/plugins/plugin-user-config.ts';
import type { ThreadRunHooks } from '../application/threads/compact-thread.use-case.ts';
import { SeedBranchStateUseCase } from '../application/threads/seed-branch-state.use-case.ts';
import { SendThreadRunUseCase } from '../application/threads/send-thread-run.use-case.ts';
import { ListWorkspaceSkillsUseCase } from '../application/workspaces/list-workspace-skills.use-case.ts';
import { logger, toRuntimeLogger } from '../config/logger.ts';
import type { SecretStore } from '../domain/secret-store.port.ts';
import type { StudioPlatform } from './create-platform.ts';
import type { StudioStore } from './create-store.ts';
import type { StudioMemoryPorts } from './wire-memory.ts';
import { createPackRegistrations } from './wire-packs.ts';
import type { StudioRuntime } from './wire-runtime.ts';
export type StudioHostOptions = {
  workspaceHarnesys?: WorkspaceHarnesysRegistry;
  secretStore?: SecretStore;
};
export type StudioHost = {
  runtimeStateRepo: SqliteRuntimeStateRepo;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  threadRegistry: ThreadRuntimeRegistry;
  threadRunHooks: ThreadRunHooks;
  getThreadPlan: GetThreadPlanUseCase;
  sendThreadRun: SendThreadRunUseCase;
  lsp: StudioLspAdapter;
  jobs: ProcessJobRegistry;
  modelsPort: ModelsPort;
  secretStore?: SecretStore;
  stop: () => void;
};
export function createStudioHost(args: {
  store: StudioStore;
  platform: StudioPlatform;
  runtime: StudioRuntime;
  memory: StudioMemoryPorts;
  options: StudioHostOptions;
}): StudioHost {
  const { store, platform, runtime, memory, options } = args;
  const modelsPort = createHarnesysModelsPort(store.llmProviderRepo, store.llmModelRepo);
  const runtimeStateRepo = new SqliteRuntimeStateRepo(store.db, (threadId, events) => {
    const compaction = events.find((e) => e.type === 'compaction.completed');
    if (!compaction) {
      return;
    }
    void (async () => {
      const thread = store.threadRepo.findById(threadId);
      if (!thread) {
        return;
      }
      const agentRow = store.agentRepo.findById(thread.agentId);
      if (!agentRow) {
        return;
      }
      const meta = (compaction.metadata ?? {}) as Record<string, unknown>;
      await createEpisodicOnCompacted({
        episodic: memory.episodic,
        workspaceId: thread.workspaceId,
        threadId,
        episodicRef: undefined,
      })({
        fromSeq: typeof meta.coveredFrom === 'number' ? meta.coveredFrom : 0,
        toSeq: typeof meta.coveredUntil === 'number' ? meta.coveredUntil : 0,
        compactionEntryId: typeof meta.id === 'string' ? meta.id : undefined,
      });
    })().catch((e: unknown) => {
      logger.warn(
        { scope: 'compaction' },
        `episodic index failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  });
  const lspServersRef: {
    current: (cwd: string) => LspServerSpec[] | Promise<LspServerSpec[]>;
  } = { current: () => [] };
  const watcherStops = new Map<string, () => void>();
  const lspAdapter = new StudioLspAdapter({
    resolveServers: (cwd) => lspServersRef.current(cwd),
    onDiagnostic: (diagnostic) => {
      const message = `plugin lsp ${diagnostic.code}: ${diagnostic.message}`;
      if (diagnostic.level === 'error') {
        logger.error({ scope: 'lsp' }, message);
      } else {
        logger.warn({ scope: 'lsp' }, message);
      }
    },
    onSessionOpened: (cwd) => {
      if (watcherStops.has(cwd)) {
        return;
      }
      const workspace = store.workspaceRepo
        .list()
        .find((row) => row.path === cwd || row.path.replace(/\/$/, '') === cwd.replace(/\/$/, ''));
      const key = workspace?.id ?? cwd;
      const stop = platform.filesWatcher.watch(key, cwd, (event) => {
        const relPath = event.dir ? `${event.dir}/${event.name}` : event.name;
        if (event.kind === 'delete') {
          lspAdapter.closePathFromDisk(cwd, relPath);
          return;
        }
        void lspAdapter.syncPathFromDisk(cwd, relPath);
      });
      watcherStops.set(cwd, stop);
    },
  });
  const pluginAgentsRef: {
    current: ((workspaceId: string) => Promise<PluginAgentCatalog>) | null;
  } = { current: null };
  const workspaceHarnesysRef: {
    current: WorkspaceHarnesysRegistry | null;
  } = { current: null };
  const jobs = createProcessJobRegistry();
  const packRegistrations = createPackRegistrations({
    db: store.db,
    schedules: store.scheduleRepo,
    webhooks: store.webhookRepo,
    threads: store.threadRepo,
    agents: store.agentRepo,
    modePresets: store.modePresetRepo,
    models: store.llmModelRepo,
    providers: store.llmProviderRepo,
    workspaces: store.workspaceRepo,
    attachments: store.attachmentRepo,
    attachmentsFs: platform.attachments,
    lifecycle: runtime.runLifecycle,
    scheduleQueue: runtime.scheduleQueue,
    deskEvents: platform.deskEvents,
    getThread: runtime.getThread,
    semanticSessions: memory.semantic,
    memory,
    lsp: lspAdapter,
    jobs,
    pluginAgentsRef,
    workspaceHarnesysRef,
  });
  const workspaceHarnesys =
    options.workspaceHarnesys ??
    new WorkspaceHarnesysRegistry(
      modelsPort,
      {
        agents: store.agentRepo,
        modelRepo: store.llmModelRepo,
        providerRepo: store.llmProviderRepo,
        plugins: store.pluginRepo,
      },
      {
        lifecycle: runtime.runLifecycle,
        events: runtime.runEvents,
        feed: runtime.runFeed,
        claimer: runtime.runClaimer,
        instanceId: runtime.instanceId,
        logger: toRuntimeLogger('runtime'),
      },
      packRegistrations,
    );
  runtime.agentsRef.current = workspaceHarnesys;
  workspaceHarnesysRef.current = workspaceHarnesys;
  pluginAgentsRef.current = (workspaceId) => workspaceHarnesys.pluginAgents(workspaceId);
  const runHookBuses = new RunHookBuses({
    filesWatcher: platform.filesWatcher,
    lifecycle: runtime.runLifecycle,
    logger: toRuntimeLogger('hooks'),
    renameThread: (threadId, title) => {
      const trimmed = title.trim();
      if (trimmed.length === 0) {
        return;
      }
      try {
        store.threadRepo.updateTitle(threadId, trimmed);
      } catch {}
    },
  });
  const monitorJobs = new MonitorJobRegistrarAdapter({
    notify: (threadId, text, type) => runHookBuses.emitNotification(threadId, text, type),
    warn: (message) => logger.warn({ scope: 'monitors' }, message),
  });
  platform.deskEvents.subscribeAll((event) => {
    if (event.type !== 'run-finish') {
      return;
    }
    monitorJobs.deregister(event.threadId);
    void runHookBuses.close(event.threadId);
  });
  lspServersRef.current = async (cwd) => {
    const workspace = store.workspaceRepo
      .list()
      .find((row) => row.path === cwd || row.path.replace(/\/$/, '') === cwd.replace(/\/$/, ''));
    if (!workspace) {
      return [];
    }
    const loaded = await workspaceHarnesys.loadEnabledPlugins(workspace.id);
    const disabled = new Set(
      (store.pluginRepo.listDisabledServers(workspace.id) ?? []).map(
        (e) => `${e.pluginName}:${e.serverId}`,
      ),
    );
    const pluginServers: WorkspacePluginLspServer[] = [];
    for (const entry of loaded) {
      const userConfig = pluginUserConfig(entry.ir, entry.record.options);
      for (const component of entry.ir.components.filter(isLspServerComponent)) {
        if (disabled.has(`${entry.ir.identity.name}:${component.spec.serverId}`)) {
          continue;
        }
        const substituted = substituteLspSpec(component.spec, userConfig);
        if ('message' in substituted) {
          logger.warn(
            { scope: 'lsp' },
            `plugin lsp server "${component.spec.serverId}" dropped: ${substituted.message}`,
          );
          continue;
        }
        pluginServers.push({ spec: substituted, pluginName: entry.ir.identity.name });
      }
    }
    return resolveWorkspaceLsp(workspace.path, pluginServers);
  };
  const branchSeeder = new SeedBranchStateUseCase({
    threads: store.threadRepo,
    runEvents: runtime.runEvents,
    runtimeStates: runtimeStateRepo,
  });
  const runTargets = new StudioRunTargets({
    threads: store.threadRepo,
    agents: store.agentRepo,
    models: store.llmModelRepo,
    providers: store.llmProviderRepo,
    workspaces: store.workspaceRepo,
    workspaceHarnesys,
    runtimeStates: runtimeStateRepo,
    branchSeeder,
    runHookBuses,
    monitorJobs,
  });
  runtime.targetRef.current = runTargets;
  const threadRunHooks = {
    ensure: (threadId: string) => runTargets.ensureHooksForThread(threadId),
    release: (threadId: string) => runHookBuses.close(threadId),
  };
  const threadRegistry = new ThreadRuntimeRegistry(runtimeStateRepo);
  const getThreadPlan = new GetThreadPlanUseCase(new SqliteUnitOfWork(store.db));
  const sendThreadRun = new SendThreadRunUseCase({
    threads: store.threadRepo,
    agents: store.agentRepo,
    models: store.llmModelRepo,
    providers: store.llmProviderRepo,
    workspaces: store.workspaceRepo,
    attachments: store.attachmentRepo,
    workspaceHarnesys,
    registry: threadRegistry,
    deskEvents: platform.deskEvents,
    getThread: runtime.getThread,
    listSkills: new ListWorkspaceSkillsUseCase(store.workspaceRepo, workspaceHarnesys),
  });
  const secretStore = options.secretStore;
  return {
    runtimeStateRepo,
    workspaceHarnesys,
    threadRegistry,
    threadRunHooks,
    getThreadPlan,
    sendThreadRun,
    lsp: lspAdapter,
    jobs,
    modelsPort,
    ...(secretStore ? { secretStore } : {}),
    stop: () => {
      for (const stop of watcherStops.values()) {
        stop();
      }
      watcherStops.clear();
      for (const row of store.workspaceRepo.list()) {
        void workspaceHarnesys.forget(row.id);
      }
    },
  };
}
type LspServerComponent = PluginComponent & {
  spec: LspServerSpec;
};
function isLspServerComponent(component: PluginComponent): component is LspServerComponent {
  return (
    component.kind === 'lsp-server' &&
    component.status === 'native' &&
    'command' in component.spec &&
    'extensionToLanguage' in component.spec
  );
}
