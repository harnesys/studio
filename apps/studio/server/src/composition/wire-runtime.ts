import {
  askUser,
  createRunClaimer,
  createRunEngine,
  createRunEventBus,
  createRunEventFeed,
  createToolRegistry,
  fetch,
  files,
  type ModelsPort,
  mapTool,
  type RunClaimer,
  type RunEngine,
  type RunEventFeed,
  type RunRecord,
  type RunTargets,
  shell,
  wait,
} from 'harnesys';
import { startAskTicker } from '../adapters/ask-ticker.adapter.ts';
import { type HostToolScope, runInHostToolScope } from '../adapters/host-tool-scope.ts';
import { ScheduleFireQueue } from '../adapters/schedule-fire-queue.adapter.ts';
import type { StudioDb } from '../adapters/store/sqlite/connection.ts';
import { SqliteRunEventStore } from '../adapters/store/sqlite/repos/sqlite-run-events.adapter.ts';
import { SqliteRunLifecycleStore } from '../adapters/store/sqlite/repos/sqlite-run-lifecycle.adapter.ts';
import { startWaitTicker } from '../adapters/wait-ticker.adapter.ts';
import type { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
import { notifyIdleIfFree } from '../application/schedules/fire-due-schedules.use-case.ts';
import { GetThreadUseCase } from '../application/threads/get-thread.use-case.ts';
import { withHandoffCurrentPersist } from '../application/threads/persist-handoff-current.ts';
import { publishDeskThread } from '../application/threads/publish-desk-thread.ts';
import { CLAIMER_SWEEP_MS, TERMINAL_RUN_STATUSES } from '../config/constants.ts';
import { env } from '../config/env.ts';
import { toRuntimeLogger } from '../config/logger.ts';
import type { AgentRepository } from '../domain/agent.port.ts';
import type { DeskEventsPort } from '../domain/desk-events.port.ts';
import type { ThreadRepository } from '../domain/thread.port.ts';

export type WireRuntimeDeps = {
  db: StudioDb;
  threadRepo: ThreadRepository;
  agentRepo: AgentRepository;
  deskEvents: DeskEventsPort;
  modelsPort: ModelsPort;
};

export type StudioRuntime = {
  runEvents: SqliteRunEventStore;
  runLifecycle: SqliteRunLifecycleStore;
  runFeed: RunEventFeed;
  runEngine: RunEngine;
  runClaimer: RunClaimer;
  getThread: GetThreadUseCase;
  instanceId: string;
  scheduleQueue: ScheduleFireQueue;
  webhookQueue: ScheduleFireQueue;
  agentsRef: { current: WorkspaceHarnesysRegistry | null };
  targetRef: { current: RunTargets | null };
};

export function wireRuntime(deps: WireRuntimeDeps): StudioRuntime {
  const { db, threadRepo, agentRepo, deskEvents, modelsPort } = deps;
  const eventBus = createRunEventBus();
  const runEvents = new SqliteRunEventStore(db);
  const runLifecycle = new SqliteRunLifecycleStore(db, runEvents.appendWithinTx.bind(runEvents));
  const getThread = new GetThreadUseCase(threadRepo, agentRepo, runEvents, runLifecycle);
  const runFeed = withHandoffCurrentPersist(
    createRunEventFeed({ events: runEvents, lifecycle: runLifecycle, bus: eventBus }),
    {
      lifecycle: runLifecycle,
      threads: threadRepo,
      agents: agentRepo,
      deskEvents,
      getThread,
    },
  );
  const instanceId = env.STUDIO_INSTANCE_ID ?? 'studio-local';
  const toolRegistry = createToolRegistry([
    ...files(),
    shell(),
    fetch(),
    askUser(),
    mapTool(),
    wait(),
  ]);
  const agentsRef: { current: WorkspaceHarnesysRegistry | null } = { current: null };
  const runEngine = createRunEngine({
    lifecycle: runLifecycle,
    events: runEvents,
    feed: runFeed,
    instanceId,
    models: modelsPort,
    toolRegistry,
    toolMessages: 'ordered',
    agents: {
      resolve: (id) => agentsRef.current?.resolveAgentDefinition(id),
      list: (parent) => agentsRef.current?.listScopedRoster(parent) ?? [],
    },
    logger: toRuntimeLogger('runtime'),
  });
  const scheduleQueue = new ScheduleFireQueue();
  const webhookQueue = new ScheduleFireQueue();
  const scheduleQueueRef: { current: ScheduleFireQueue | null } = { current: scheduleQueue };
  const webhookQueueRef: { current: ScheduleFireQueue | null } = { current: webhookQueue };
  const targetRef: { current: RunTargets | null } = { current: null };
  /** Terminal-only run-finish signal for server-side subscribers (monitors, run buses). */
  const emitRunFinish = (record: RunRecord): void => {
    if (!TERMINAL_RUN_STATUSES.has(record.status)) {
      return;
    }
    const workspaceId = threadRepo.findById(record.threadId)?.workspaceId;
    if (workspaceId !== undefined) {
      deskEvents.emit(workspaceId, { type: 'run-finish', threadId: record.threadId });
    }
  };
  const runClaimer = createRunClaimer({
    lifecycle: runLifecycle,
    targets: {
      resolve: (threadId) => targetRef.current?.resolve(threadId) ?? Promise.resolve(null),
    },
    engine: runEngine,
    instanceId,
    sweepMs: CLAIMER_SWEEP_MS,
    withScope: (target, execute) => runInHostToolScope(target.scope as HostToolScope, execute),
    onComplete: (record) => {
      publishDeskThread(getThread, deskEvents, record.threadId);
      emitRunFinish(record);
      const queue = scheduleQueueRef.current;
      if (queue !== null) {
        notifyIdleIfFree(runLifecycle, queue, record.threadId);
      }
      const nextWebhookQueue = webhookQueueRef.current;
      if (nextWebhookQueue !== null) {
        notifyIdleIfFree(runLifecycle, nextWebhookQueue, record.threadId);
      }
    },
  });
  startAskTicker({
    lifecycle: runLifecycle,
    kick: runClaimer.kick,
    onCancelled: (threadId) => publishDeskThread(getThread, deskEvents, threadId),
  });
  startWaitTicker({
    lifecycle: runLifecycle,
    targets: {
      resolve: (threadId) => targetRef.current?.resolve(threadId) ?? Promise.resolve(null),
    },
    kick: runClaimer.kick,
  });
  return {
    runEvents,
    runLifecycle,
    runFeed,
    runEngine,
    runClaimer,
    getThread,
    instanceId,
    scheduleQueue,
    webhookQueue,
    agentsRef,
    targetRef,
  };
}
