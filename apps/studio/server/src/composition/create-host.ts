import type { PluginLspServer } from 'harnesys';
import { StudioLspAdapter } from '../adapters/lsp/studio-lsp.adapter.ts';
import { SqliteRuntimeStateRepo } from '../adapters/store/sqlite/repos/sqlite-runtime-state-repo.adapter.ts';
import { SqliteUnitOfWork } from '../adapters/store/sqlite/sqlite-unit-of-work.ts';
import { StudioRunTargets } from '../adapters/studio-run-targets.adapter.ts';
import { ThreadRuntimeRegistry } from '../adapters/thread-runtime.registry.ts';
import { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
import { createEpisodicOnCompacted } from '../application/memory/episodic-on-compacted.ts';
import { GetThreadPlanUseCase } from '../application/plans/get-thread-plan.use-case.ts';
import { SeedBranchStateUseCase } from '../application/threads/seed-branch-state.use-case.ts';
import { SendThreadRunUseCase } from '../application/threads/send-thread-run.use-case.ts';
import { logger, toRuntimeLogger } from '../config/logger.ts';
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
  getThreadPlan: GetThreadPlanUseCase;
  sendThreadRun: SendThreadRunUseCase;
  lsp: StudioLspAdapter;
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
    current: (cwd: string) => PluginLspServer[] | Promise<PluginLspServer[]>;
  } = { current: () => [] };

  // FS/git watcher → LSP: when a session for a workspace starts, subscribe the
  // watcher once so external edits (agent tools, git) are pushed into open
  // documents. The pull-based resync on every lsp_* call stays as the
  // correctness guarantee; this only makes editor diagnostics arrive live.
  const watcherStops = new Map<string, () => void>();

  const lspAdapter = new StudioLspAdapter({
    resolveServers: (cwd) => lspServersRef.current(cwd),
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

  lspServersRef.current = async (cwd) => {
    const workspace = store.workspaceRepo
      .list()
      .find((row) => row.path === cwd || row.path.replace(/\/$/, '') === cwd.replace(/\/$/, ''));
    if (!workspace) {
      return [];
    }
    const loaded = await workspaceHarnesys.loadEnabledPlugins(workspace.id);
    return loaded.flatMap((entry) => entry.plugin.lspServers);
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
  });
  runtime.targetRef.current = runTargets;

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

  return {
    runtimeStateRepo,
    workspaceHarnesys,
    threadRegistry,
    getThreadPlan,
    sendThreadRun,
    lsp: lspAdapter,
  };
}
