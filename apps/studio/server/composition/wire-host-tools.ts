import type { RunLifecycleStore, ToolDefinition } from 'harnesys';
import type { ScheduleFireQueue } from '../adapters/schedule-fire-queue.adapter.ts';
import type { StudioDb } from '../adapters/store/sqlite/connection.ts';
import { SqliteUnitOfWork } from '../adapters/store/sqlite/sqlite-unit-of-work.ts';
import type { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
import { createMemoryTools } from '../application/host-tools/create-memory-tools.ts';
import { createPlanTools } from '../application/host-tools/create-plan-tools.ts';
import { createScheduleTools } from '../application/host-tools/create-schedule-tools.ts';
import { createWebhookTools } from '../application/host-tools/create-webhook-tools.ts';
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

export type WireHostToolsDeps = {
  db: StudioDb;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  toolRegistry: Map<string, ToolDefinition>;
  schedules: ScheduleRepository;
  webhooks: WebhookRepository;
  threads: ThreadRepository;
  agents: AgentRepository;
  workspaces: WorkspaceRepository;
  attachments: AttachmentRepository;
  attachmentsFs: AttachmentsPort;
  lifecycle: RunLifecycleStore;
  queue: ScheduleFireQueue;
  deskEvents: DeskEventsPort;
  getThread: GetThreadInput;
  semanticSessions?: SemanticSessionCleanup;
  memory: StudioMemoryPorts;
};

export function wireHostTools(deps: WireHostToolsDeps): void {
  const uow = new SqliteUnitOfWork(deps.db);
  const extraTools = [
    ...createPlanTools({
      savePlan: new SavePlanUseCase(uow, deps.deskEvents),
      updatePlanItem: new UpdatePlanItemUseCase(uow, deps.deskEvents),
      getThreadPlan: new GetThreadPlanUseCase(uow),
    }),
    ...createScheduleTools({
      listSchedules: new ListSchedulesUseCase(deps.schedules, deps.workspaces),
      listThreads: new ListThreadsUseCase(deps.threads, deps.workspaces, deps.agents),
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
        queue: deps.queue,
        deskEvents: deps.deskEvents,
        db: deps.db,
        semanticSessions: deps.semanticSessions,
      }),
    }),
    ...createWebhookTools({
      listWebhooks: new ListWebhooksUseCase(deps.webhooks, deps.workspaces),
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
    ...createMemoryTools({
      pin: deps.memory.pin,
      semantic: deps.memory.semantic,
      episodic: deps.memory.episodic,
      knowledge: deps.memory.knowledge,
      workspaces: deps.workspaces,
      agents: deps.agents,
    }),
  ];
  deps.workspaceHarnesys.setExtraTools(extraTools);
  for (const tool of extraTools) {
    deps.toolRegistry.set(tool.name, tool);
  }
}
