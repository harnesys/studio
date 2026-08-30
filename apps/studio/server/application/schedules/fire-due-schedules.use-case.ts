import { SCHEDULE_HUMAN_ORIGIN, scheduledTaskText } from '../../../shared/schedule-prompt.ts';
import type { ActiveRunRegistry } from '../../adapters/active-runs.adapter.ts';
import type { ScheduleFireQueue } from '../../adapters/schedule-fire-queue.adapter.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { Schedule, ScheduleRepository } from '../../domain/schedule.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { GetThreadInput } from '../threads/get-thread.use-case.ts';
import { publishDeskThread } from '../threads/publish-desk-thread.ts';
import type { SendThreadRunInput } from '../threads/send-thread-run.use-case.ts';
import { isValidCron, nextCronRunAt } from './cron-next.ts';
import { toScheduleRecord } from './schedule-record.ts';

export type FireDueSchedulesInput = {
  execute(): Promise<void>;
  fireSchedule(scheduleId: string): Promise<void>;
};

export type FireDueSchedulesDeps = {
  schedules: ScheduleRepository;
  threads: ThreadRepository;
  sendThreadRun: SendThreadRunInput;
  activeRuns: ActiveRunRegistry;
  queue: ScheduleFireQueue;
  deskEvents: DeskEventsPort;
  getThread: GetThreadInput;
};

export class FireDueSchedulesUseCase implements FireDueSchedulesInput {
  private readonly schedules: ScheduleRepository;
  private readonly threads: ThreadRepository;
  private readonly sendThreadRun: SendThreadRunInput;
  private readonly activeRuns: ActiveRunRegistry;
  private readonly queue: ScheduleFireQueue;
  private readonly deskEvents: DeskEventsPort;
  private readonly getThread: GetThreadInput;

  constructor(deps: FireDueSchedulesDeps) {
    this.schedules = deps.schedules;
    this.threads = deps.threads;
    this.sendThreadRun = deps.sendThreadRun;
    this.activeRuns = deps.activeRuns;
    this.queue = deps.queue;
    this.deskEvents = deps.deskEvents;
    this.getThread = deps.getThread;
  }

  async execute(): Promise<void> {
    const now = new Date().toISOString();
    const due = this.schedules.listDue(now);
    for (const schedule of due) {
      await this.tryFire(schedule, now);
    }
  }

  async fireSchedule(scheduleId: string): Promise<void> {
    const schedule = this.schedules.findById(scheduleId);
    if (schedule?.status !== 'active') {
      return;
    }
    await this.tryFire(schedule, new Date().toISOString());
  }

  private async tryFire(schedule: Schedule, nowIso: string): Promise<void> {
    if (!schedule.detail.trim()) {
      this.advanceOnly(schedule, nowIso);
      return;
    }

    if (this.activeRuns.findByThread(schedule.threadId)) {
      this.queue.enqueue(schedule.threadId, schedule.id);
      return;
    }

    if (!this.claim(schedule, nowIso)) {
      return;
    }

    try {
      await this.sendThreadRun.execute({
        threadId: schedule.threadId,
        text: scheduledTaskText(schedule.name, schedule.detail),
        mode: schedule.mode,
        origin: SCHEDULE_HUMAN_ORIGIN,
      });
      this.threads.touch(schedule.threadId);
      this.publishThread(schedule.threadId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'fire failed';
      if (cannotStart(error)) {
        this.fail(schedule, nowIso);
      }
      this.noteError(schedule.threadId, message);
    }
  }

  private fail(schedule: Schedule, nowIso: string): void {
    this.schedules.update(schedule.id, {
      status: 'failed',
      updatedAt: nowIso,
    });
    this.publishSchedule(schedule.id);
  }

  private noteError(threadId: string, message: string): void {
    if (!this.threads.findById(threadId)) {
      return;
    }
    this.threads.touch(threadId);
    this.publishThread(threadId);
  }

  private claim(schedule: Schedule, nowIso: string): boolean {
    const current = this.schedules.findById(schedule.id);
    if (current?.status !== 'active') {
      return false;
    }
    if (!current.nextRunAt || current.nextRunAt > nowIso) {
      return false;
    }
    if (this.activeRuns.findByThread(current.threadId)) {
      this.queue.enqueue(current.threadId, current.id);
      return false;
    }

    if (!isValidCron(current.cron)) {
      this.schedules.update(current.id, {
        status: 'failed',
        updatedAt: nowIso,
      });
      this.publishSchedule(current.id);
      return false;
    }

    const nextRunAt = nextCronRunAt(current.cron, new Date(nowIso));
    this.schedules.update(current.id, {
      lastFiredAt: nowIso,
      nextRunAt,
      updatedAt: nowIso,
    });
    this.publishSchedule(current.id);
    return true;
  }

  private advanceOnly(schedule: Schedule, nowIso: string): void {
    if (!isValidCron(schedule.cron)) {
      this.schedules.update(schedule.id, {
        status: 'failed',
        updatedAt: nowIso,
      });
      this.publishSchedule(schedule.id);
      return;
    }
    this.schedules.update(schedule.id, {
      nextRunAt: nextCronRunAt(schedule.cron, new Date(nowIso)),
      updatedAt: nowIso,
    });
    this.publishSchedule(schedule.id);
  }

  private publishSchedule(scheduleId: string): void {
    const schedule = this.schedules.findById(scheduleId);
    if (!schedule) {
      return;
    }
    this.deskEvents.emit(schedule.workspaceId, {
      type: 'schedule',
      schedule: toScheduleRecord(schedule),
    });
  }

  private publishThread(threadId: string): void {
    publishDeskThread(this.getThread, this.deskEvents, threadId);
  }
}

function cannotStart(error: unknown): boolean {
  if (error instanceof NotFoundError) {
    return true;
  }
  return error instanceof ValidationError && error.message === 'agent has no model';
}
