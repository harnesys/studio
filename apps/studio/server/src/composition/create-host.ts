import type { LspServerSpec, PluginComponent } from 'harnesys';
import { StudioLspAdapter } from '../adapters/lsp/studio-lsp.adapter.ts';
import { MonitorJobRegistrarAdapter } from '../adapters/monitor-job-registrar.adapter.ts';
import { RunHookBuses } from '../adapters/run-hook-buses.adapter.ts';
import { MacosSecretStoreAdapter } from '../adapters/secret-store-macos.adapter.ts';
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
import { logger, toRuntimeLogger } from '../config/logger.ts';
import type { SecretStore } from '../domain/secret-store.port.ts';
import type { StudioPlatform } from './create-platform.ts';
import type { StudioStore } from './create-store.ts';
import type { StudioMemoryPorts } from './wire-memory.ts';
import { createPackRegistrations } from './wire-packs.ts';
import type { StudioRuntime } from './wire-runtime.ts';

export type StudioHostOptions = {
  workspaceHarnesys?: WorkspaceHarnesysRegistry;
};

export type StudioHost = {
  runtimeStateRepo: SqliteRuntimeStateRepo;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  threadRegistry: ThreadRuntimeRegistry;
  /** Хук-шина рана для вне-рановых проходов (ручная компакция). */
  threadRunHooks: ThreadRunHooks;
  getThreadPlan: GetThreadPlanUseCase;
  sendThreadRun: SendThreadRunUseCase;
  lsp: StudioLspAdapter;
  /** Undefined when the platform has no Keychain access; sensitive options then refuse to save. */
  secretStore?: SecretStore;
};

export function createStudioHost(args: {
  store: StudioStore;
  platform: StudioPlatform;
  runtime: StudioRuntime;
  memory: StudioMemoryPorts;
  options: StudioHostOptions;
}): StudioHost {
  const { store, platform, runtime, memory, options } = args;

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

  // FS/git watcher → LSP: when a session for a workspace starts, subscribe the
  // watcher once so external edits (agent tools, git) are pushed into open
  // documents. The pull-based resync on every lsp_* call stays as the
  // correctness guarantee; this only makes editor diagnostics arrive live.
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
        if (event.kind === 'delete') {
          return;
        }
        const relPath = event.dir ? `${event.dir}/${event.name}` : event.name;
        void lspAdapter.syncPathFromDisk(cwd, relPath);
      });
      watcherStops.set(cwd, stop);
    },
  });

  // Late wiring: the agents catalog port (pack registrations) resolves
  // `pluginName:agentName` ids through the registry once it exists.
  const pluginAgentsRef: {
    current: ((workspaceId: string) => Promise<PluginAgentCatalog>) | null;
  } = { current: null };

  // Late wiring: tool-path §7 validation dereferences the registry at call time
  // (tool calls happen post-boot, after the registry below exists).
  const workspaceHarnesysRef: { current: WorkspaceHarnesysRegistry | null } = { current: null };

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
    pluginAgentsRef,
    workspaceHarnesysRef,
  });

  const workspaceHarnesys =
    options.workspaceHarnesys ??
    new WorkspaceHarnesysRegistry(
      platform.modelsPort,
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

  // Host-driven hook emissions (FileChanged from the workspace watcher,
  // Notification from monitor stdout) share the run's hook bus: the bus is
  // created here and carried via RunTarget.hooksEmit. Closed on run-finish.
  const runHookBuses = new RunHookBuses({
    filesWatcher: platform.filesWatcher,
    lifecycle: runtime.runLifecycle,
    logger: toRuntimeLogger('hooks'),
    renameThread: (threadId, title) => {
      const trimmed = title.trim();
      if (trimmed.length === 0) {
        return;
      }
      // Async hook может дожить до rename уже удалённого треда — не роняем emit.
      try {
        store.threadRepo.updateTitle(threadId, trimmed);
      } catch {
        // thread gone
      }
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
    const servers: LspServerSpec[] = [];
    for (const entry of loaded) {
      // First-wins dedupe by extension (lsp_shadowed) happens in the adapter.
      const userConfig = pluginUserConfig(entry.ir, entry.record.options);
      for (const component of entry.ir.components.filter(isLspServerComponent)) {
        const substituted = substituteLspSpec(component.spec, userConfig);
        if ('message' in substituted) {
          logger.warn(
            { scope: 'lsp' },
            `plugin lsp server "${component.spec.serverId}" dropped: ${substituted.message}`,
          );
          continue;
        }
        servers.push(substituted);
      }
    }
    return servers;
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

  /** Хук-шина для вне-рановых проходов тредa (ручная компакция). */
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
  });

  let secretStore: SecretStore | undefined;
  try {
    secretStore = new MacosSecretStoreAdapter();
  } catch (err) {
    logger.warn(
      { scope: 'plugins' },
      `SecretStore unavailable, sensitive plugin options will refuse to save: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  return {
    runtimeStateRepo,
    workspaceHarnesys,
    threadRegistry,
    threadRunHooks,
    getThreadPlan,
    sendThreadRun,
    lsp: lspAdapter,
    ...(secretStore ? { secretStore } : {}),
  };
}

type LspServerComponent = PluginComponent & { spec: LspServerSpec };

function isLspServerComponent(component: PluginComponent): component is LspServerComponent {
  return (
    component.kind === 'lsp-server' &&
    component.status === 'native' &&
    'command' in component.spec &&
    'extensionToLanguage' in component.spec
  );
}
