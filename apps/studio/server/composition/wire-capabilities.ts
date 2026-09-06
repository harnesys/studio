import {
  type CapabilityRegistration,
  episodicMemoryCapability,
  knowledgeMemoryCapability,
  pinMemoryCapability,
  planCapability,
  type RunLifecycleStore,
  registerCapability,
  schedulerCapability,
  semanticMemoryCapability,
  threadsCapability,
  webhookCapability,
} from 'harnesys';
import { SqlitePlanPort } from '../adapters/capabilities/sqlite-plan.port.ts';
import { SqliteSchedulerPort } from '../adapters/capabilities/sqlite-scheduler.port.ts';
import { SqliteThreadsPort } from '../adapters/capabilities/sqlite-threads.port.ts';
import { SqliteWebhookPort } from '../adapters/capabilities/sqlite-webhook.port.ts';
import { type HostToolScope, requireHostToolScope } from '../adapters/host-tool-scope.ts';
import type { ScheduleFireQueue } from '../adapters/schedule-fire-queue.adapter.ts';
import type { StudioDb } from '../adapters/store/sqlite/connection.ts';
import { SqliteUnitOfWork } from '../adapters/store/sqlite/sqlite-unit-of-work.ts';
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
import type { ScheduleRepository } from '../domain/schedule.port.ts';
import type { SemanticSessionCleanup } from '../domain/semantic-session.port.ts';
import type { ThreadRepository } from '../domain/thread.port.ts';
import type { WebhookRepository } from '../domain/webhook.port.ts';
import type { WorkspaceRepository } from '../domain/workspace.port.ts';
import type { StudioMemoryPorts } from './wire-memory.ts';

export type CapabilityRegistrationsDeps = {
  db: StudioDb;
  schedules: ScheduleRepository;
  webhooks: WebhookRepository;
  threads: ThreadRepository;
  agents: AgentRepository;
  workspaces: WorkspaceRepository;
  attachments: AttachmentRepository;
  attachmentsFs: AttachmentsPort;
  lifecycle: RunLifecycleStore;
  scheduleQueue: ScheduleFireQueue;
  deskEvents: DeskEventsPort;
  getThread: GetThreadInput;
  semanticSessions?: SemanticSessionCleanup;
  memory: Pick<StudioMemoryPorts, 'pin' | 'semantic' | 'episodic' | 'knowledge'>;
};

export function createCapabilityRegistrations(
  deps: CapabilityRegistrationsDeps,
): CapabilityRegistration[] {
  const uow = new SqliteUnitOfWork(deps.db);
  // Memory packs scope pins/semantic records by agent NAME; the run scope carries
  // only ids, so the display name is resolved at scope-read time (ruling R15).
  const resolveScope = () => {
    const scope: HostToolScope = requireHostToolScope();
    return { ...scope, agentName: deps.agents.findById(scope.agentId)?.name };
  };
  const listThreads = new ListThreadsUseCase(deps.threads, deps.workspaces, deps.agents);
  const listSchedules = new ListSchedulesUseCase(deps.schedules, deps.workspaces);
  const listWebhooks = new ListWebhooksUseCase(deps.webhooks, deps.workspaces);
  return [
    registerCapability(
      planCapability,
      {
        plan: new SqlitePlanPort({
          savePlan: new SavePlanUseCase(uow, deps.deskEvents),
          updatePlanItem: new UpdatePlanItemUseCase(uow, deps.deskEvents),
          getThreadPlan: new GetThreadPlanUseCase(uow),
        }),
      },
      resolveScope,
    ),
    registerCapability(
      threadsCapability,
      { threads: new SqliteThreadsPort({ listThreads, listSchedules }) },
      resolveScope,
    ),
    registerCapability(
      schedulerCapability,
      {
        scheduler: new SqliteSchedulerPort({
          listSchedules,
          peekSchedule: new PeekScheduleUseCase({
            schedules: deps.schedules,
            workspaces: deps.workspaces,
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
    ),
    registerCapability(
      webhookCapability,
      {
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
          }),
        }),
      },
      resolveScope,
    ),
    registerCapability(pinMemoryCapability, { pin: deps.memory.pin }, resolveScope),
    registerCapability(semanticMemoryCapability, { semantic: deps.memory.semantic }, resolveScope),
    registerCapability(episodicMemoryCapability, { episodic: deps.memory.episodic }, resolveScope),
    registerCapability(
      knowledgeMemoryCapability,
      { knowledge: deps.memory.knowledge },
      resolveScope,
    ),
  ];
}
