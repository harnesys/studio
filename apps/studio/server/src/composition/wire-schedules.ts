import type { RunLifecycleStore } from 'harnesys';
import type { Hono } from 'hono';
import { ScheduleController } from '../adapters/http/schedule/schedule.controller.ts';
import type { ScheduleFireQueue } from '../adapters/schedule-fire-queue.adapter.ts';
import { startScheduleTicker } from '../adapters/schedule-ticker.adapter.ts';
import type { StudioDb } from '../adapters/store/sqlite/connection.ts';
import { CreateScheduleUseCase } from '../application/schedules/create-schedule.use-case.ts';
import { DeleteScheduleUseCase } from '../application/schedules/delete-schedule.use-case.ts';
import { FireDueSchedulesUseCase } from '../application/schedules/fire-due-schedules.use-case.ts';
import { ListSchedulesUseCase } from '../application/schedules/list-schedules.use-case.ts';
import { UpdateScheduleUseCase } from '../application/schedules/update-schedule.use-case.ts';
import type { GetThreadInput } from '../application/threads/get-thread.use-case.ts';
import type { SendThreadRunInput } from '../application/threads/send-thread-run.use-case.ts';
import type { AgentRepository } from '../domain/agent.port.ts';
import type { AttachmentRepository } from '../domain/attachment.port.ts';
import type { AttachmentsPort } from '../domain/attachments.port.ts';
import type { DeskEventsPort } from '../domain/desk-events.port.ts';
import type { ScheduleRepository } from '../domain/schedule.port.ts';
import type { SemanticSessionCleanup } from '../domain/semantic-session.port.ts';
import type { ThreadRepository } from '../domain/thread.port.ts';
import type { WorkspaceRepository } from '../domain/workspace.port.ts';

export type WireSchedulesDeps = {
  app: Hono;
  db: StudioDb;
  startTicker: boolean;
  schedules: ScheduleRepository;
  threads: ThreadRepository;
  agents: AgentRepository;
  workspaces: WorkspaceRepository;
  attachments: AttachmentRepository;
  attachmentsFs: AttachmentsPort;
  lifecycle: RunLifecycleStore;
  deskEvents: DeskEventsPort;
  sendThreadRun: SendThreadRunInput;
  getThread: GetThreadInput;
  semanticSessions?: SemanticSessionCleanup;
  queue: ScheduleFireQueue;
};

export function wireSchedules(deps: WireSchedulesDeps): void {
  const queue = deps.queue;
  const fireDueSchedules = new FireDueSchedulesUseCase({
    schedules: deps.schedules,
    threads: deps.threads,
    sendThreadRun: deps.sendThreadRun,
    lifecycle: deps.lifecycle,
    queue,
    deskEvents: deps.deskEvents,
    getThread: deps.getThread,
  });
  queue.setHandler((scheduleId) => fireDueSchedules.fireSchedule(scheduleId));
  if (deps.startTicker) {
    startScheduleTicker(fireDueSchedules);
  }

  new ScheduleController({
    listSchedules: new ListSchedulesUseCase(deps.schedules, deps.workspaces),
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
      queue,
      deskEvents: deps.deskEvents,
      db: deps.db,
      semanticSessions: deps.semanticSessions,
    }),
  }).register(deps.app);
}
