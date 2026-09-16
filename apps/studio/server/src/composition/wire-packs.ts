import {
  agentsCapability,
  coreCapability,
  episodicMemoryCapability,
  fetchCapability,
  filesCapability,
  knowledgeMemoryCapability,
  type PackRegistration,
  pinMemoryCapability,
  planCapability,
  type RunLifecycleStore,
  registerPack,
  schedulerCapability,
  semanticMemoryCapability,
  shellCapability,
  threadsCapability,
  webhookCapability,
} from 'harnesys';
import { lspCapability } from 'harnesys/lsp';
import {
  type PluginAgentsRef,
  SqliteAgentsCatalogPort,
} from '../adapters/capabilities/sqlite-agents-catalog.port.ts';
import { SqlitePlanPort } from '../adapters/capabilities/sqlite-plan.port.ts';
import { SqliteSchedulerPort } from '../adapters/capabilities/sqlite-scheduler.port.ts';
import { SqliteThreadsPort } from '../adapters/capabilities/sqlite-threads.port.ts';
import { SqliteWebhookPort } from '../adapters/capabilities/sqlite-webhook.port.ts';
import { type HostToolScope, requireHostToolScope } from '../adapters/host-tool-scope.ts';
import type { StudioLspAdapter } from '../adapters/lsp/studio-lsp.adapter.ts';
import type { ScheduleFireQueue } from '../adapters/schedule-fire-queue.adapter.ts';
import type { StudioDb } from '../adapters/store/sqlite/connection.ts';
import { SqliteUnitOfWork } from '../adapters/store/sqlite/sqlite-unit-of-work.ts';
import { CreateAgentUseCase } from '../application/agents/create-agent.use-case.ts';
import type { WorkspaceHarnesysSource } from '../application/capabilities/validate-agent-config.use-case.ts';
import { ValidateAgentConfigUseCase } from '../application/capabilities/validate-agent-config.use-case.ts';
import { DeletePlanUseCase } from '../application/plans/delete-plan.use-case.ts';
import { GetThreadPlanUseCase } from '../application/plans/get-thread-plan.use-case.ts';
import { SavePlanUseCase } from '../application/plans/save-plan.use-case.ts';
import { UpdatePlanItemUseCase } from '../application/plans/update-plan-item.use-case.ts';
import { CreateScheduleUseCase } from '../application/schedules/create-schedule.use-case.ts';
import { DeleteScheduleUseCase } from '../application/schedules/delete-schedule.use-case.ts';
import { ListSchedulesUseCase } from '../application/schedules/list-schedules.use-case.ts';
import { PeekScheduleUseCase } from '../application/schedules/peek-schedule.use-case.ts';
import { UpdateScheduleUseCase } from '../application/schedules/update-schedule.use-case.ts';
import type { GetThreadInput } from '../application/threads/get-thread.use-case.ts';
import { ListThreadsUseCase } from '../application/threads/list-threads.use-case.ts';
import { CreateWebhookUseCase } from '../application/webhooks/create-webhook.use-case.ts';
import { DeleteWebhookUseCase } from '../application/webhooks/delete-webhook.use-case.ts';
import { ListWebhooksUseCase } from '../application/webhooks/list-webhooks.use-case.ts';
import { UpdateWebhookUseCase } from '../application/webhooks/update-webhook.use-case.ts';
import type { AgentRepository } from '../domain/agent.port.ts';
import type { AttachmentRepository } from '../domain/attachment.port.ts';
import type { AttachmentsPort } from '../domain/attachments.port.ts';
import type { DeskEventsPort } from '../domain/desk-events.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../domain/llm-provider.port.ts';
import type { ModePresetRepository } from '../domain/mode-preset.port.ts';
import type { ScheduleRepository } from '../domain/schedule.port.ts';
import type { SemanticSessionCleanup } from '../domain/semantic-session.port.ts';
import type { ThreadRepository } from '../domain/thread.port.ts';
import type { WebhookRepository } from '../domain/webhook.port.ts';
import type { WorkspaceRepository } from '../domain/workspace.port.ts';
import type { StudioMemoryPorts } from './wire-memory.ts';

export type PackRegistrationsDeps = {
  db: StudioDb;
  schedules: ScheduleRepository;
  webhooks: WebhookRepository;
  threads: ThreadRepository;
  agents: AgentRepository;
  modePresets: ModePresetRepository;
  models: LlmModelRepository;
  providers: LlmProviderRepository;
  workspaces: WorkspaceRepository;
  attachments: AttachmentRepository;
  attachmentsFs: AttachmentsPort;
  lifecycle: RunLifecycleStore;
  scheduleQueue: ScheduleFireQueue;
  deskEvents: DeskEventsPort;
  getThread: GetThreadInput;
  semanticSessions?: SemanticSessionCleanup;
  memory: Pick<StudioMemoryPorts, 'pin' | 'semantic' | 'episodic' | 'knowledge'>;
  /** Shared LSP adapter (tools pack + editor WS bridge). Created in create-host. */
  lsp: StudioLspAdapter;
  /** Late-wired `pluginName:agentName` catalog resolver (registry lands after packs). */
  pluginAgentsRef: PluginAgentsRef;
  /** Late-wired registry for write-path §7 validation (same shape, set in create-host). */
  workspaceHarnesysRef: WorkspaceHarnesysSource;
};

export function createPackRegistrations(deps: PackRegistrationsDeps): PackRegistration[] {
  const uow = new SqliteUnitOfWork(deps.db);
  // Memory packs scope pins/semantic records by agent NAME; the run scope carries
  // only ids, so the display name is resolved at scope-read time (ruling R15).
  const resolveScope = () => {
    const scope: HostToolScope = requireHostToolScope();
    return { ...scope, agentName: deps.agents.findById(scope.agentId)?.name };
  };
  // Base packs need no ports and never read the scope; the stub mirrors the
  // library auto-registration (create-runtime dedupes by pack name, first wins).
  const stubScope = () => ({ workspaceId: '_', agentId: '_', threadId: '_' });
  const listThreads = new ListThreadsUseCase(
    deps.threads,
    deps.workspaces,
    deps.agents,
    deps.lifecycle,
  );
  const listSchedules = new ListSchedulesUseCase(deps.schedules, deps.workspaces);
  const listWebhooks = new ListWebhooksUseCase(deps.webhooks, deps.workspaces);
  // Emitter-free: SqliteAgentsCatalogPort publishes desk events for tool-path writes,
  // so the delegated create must stay silent to avoid double-publishing.
  // Tool-path §7 validation runs on the same gate as HTTP (throws → `{error}` via runGuard).
  const createAgent = new CreateAgentUseCase(deps.agents, {
    models: deps.models,
    modePresets: deps.modePresets,
    validateConfig: new ValidateAgentConfigUseCase({
      agents: deps.agents,
      workspaces: deps.workspaces,
      workspaceHarnesys: deps.workspaceHarnesysRef,
    }),
  });

  return [
    // Core pack (ask_user/map/wait): the capability resolver grants it to every
    // agent that carries `core` in capabilities (migration `capability_core_v1`).
    registerPack(coreCapability, { resolveScope: stubScope }),
    registerPack(filesCapability, { resolveScope: stubScope }),
    registerPack(shellCapability, { resolveScope: stubScope }),
    registerPack(fetchCapability, { resolveScope: stubScope }),
    registerPack(lspCapability, {
      ports: { lsp: deps.lsp },
      resolveScope: stubScope,
    }),
    registerPack(agentsCapability, {
      ports: {
        agents: new SqliteAgentsCatalogPort({
          agents: deps.agents,
          createAgent,
          deskEvents: deps.deskEvents,
          threads: deps.threads,
          models: deps.models,
          providers: deps.providers,
          pluginAgents: deps.pluginAgentsRef,
        }),
      },
      resolveScope,
    }),
    registerPack(planCapability, {
      ports: {
        plan: new SqlitePlanPort({
          savePlan: new SavePlanUseCase(uow, deps.deskEvents),
          updatePlanItem: new UpdatePlanItemUseCase(uow, deps.deskEvents),
          getThreadPlan: new GetThreadPlanUseCase(uow),
          deletePlan: new DeletePlanUseCase(uow, deps.deskEvents),
        }),
      },
      resolveScope,
    }),
    registerPack(threadsCapability, {
      ports: { threads: new SqliteThreadsPort({ listThreads, listSchedules }) },
      resolveScope,
    }),
    registerPack(schedulerCapability, {
      ports: {
        scheduler: new SqliteSchedulerPort({
          listSchedules,
          peekSchedule: new PeekScheduleUseCase({
            schedules: deps.schedules,
            workspaces: deps.workspaces,
            getThread: deps.getThread,
          }),
          createSchedule: new CreateScheduleUseCase({
            schedules: deps.schedules,
            threads: deps.threads,
            agents: deps.agents,
            workspaces: deps.workspaces,
            deskEvents: deps.deskEvents,
            db: deps.db,
          }),
          updateSchedule: new UpdateScheduleUseCase({
            schedules: deps.schedules,
            agents: deps.agents,
            workspaces: deps.workspaces,
            threads: deps.threads,
            deskEvents: deps.deskEvents,
            db: deps.db,
          }),
          deleteSchedule: new DeleteScheduleUseCase({
            schedules: deps.schedules,
            threads: deps.threads,
            workspaces: deps.workspaces,
            attachments: deps.attachments,
            attachmentsFs: deps.attachmentsFs,
            lifecycle: deps.lifecycle,
            queue: deps.scheduleQueue,
            deskEvents: deps.deskEvents,
            db: deps.db,
            semanticSessions: deps.semanticSessions,
          }),
        }),
      },
      resolveScope,
    }),
    registerPack(webhookCapability, {
      ports: {
        webhook: new SqliteWebhookPort({
          listWebhooks,
          createWebhook: new CreateWebhookUseCase({
            webhooks: deps.webhooks,
            threads: deps.threads,
            agents: deps.agents,
            workspaces: deps.workspaces,
            deskEvents: deps.deskEvents,
            getThread: deps.getThread,
            db: deps.db,
          }),
          updateWebhook: new UpdateWebhookUseCase({
            webhooks: deps.webhooks,
            agents: deps.agents,
            workspaces: deps.workspaces,
            threads: deps.threads,
            deskEvents: deps.deskEvents,
          }),
          deleteWebhook: new DeleteWebhookUseCase({
            webhooks: deps.webhooks,
            threads: deps.threads,
            workspaces: deps.workspaces,
            attachments: deps.attachments,
            attachmentsFs: deps.attachmentsFs,
            deskEvents: deps.deskEvents,
            db: deps.db,
          }),
        }),
      },
      resolveScope,
    }),
    registerPack(pinMemoryCapability, { ports: { pin: deps.memory.pin }, resolveScope }),
    registerPack(semanticMemoryCapability, {
      ports: { semantic: deps.memory.semantic },
      resolveScope,
    }),
    registerPack(episodicMemoryCapability, {
      ports: { episodic: deps.memory.episodic },
      resolveScope,
    }),
    registerPack(knowledgeMemoryCapability, {
      ports: { knowledge: deps.memory.knowledge },
      resolveScope,
    }),
    // Each pack carries its own Ports type, so the heterogeneous host list
    // cannot satisfy the uniform `PackRegistration` element type directly;
    // asserted once at this boundary. Runtime use only reads `ports` back
    // into the same pack `create`, so the pairing stays intact.
  ] as PackRegistration[];
}
