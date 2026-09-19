import type { ScheduleRepository } from '../../domain/schedule.port.ts';
import { ValidationError } from '../../domain/studio.error.ts';
import type { Thread, ThreadRepository } from '../../domain/thread.port.ts';

export type BindScheduleThreadInput = {
  threads: ThreadRepository;
  schedules: ScheduleRepository;
  workspaceId: string;
  agentId: string;
  threadId: string;
  exceptScheduleId?: string;
};

/** Existing chat (or other) thread this schedule will fire into. */
export function requireBindableThread(input: BindScheduleThreadInput): Thread {
  const threadId = input.threadId.trim();
  if (!threadId) {
    throw new ValidationError('threadId cannot be empty');
  }
  const thread = input.threads.findById(threadId);
  if (!thread || thread.workspaceId !== input.workspaceId) {
    throw new ValidationError('thread not found');
  }
  if (thread.agentId !== input.agentId) {
    throw new ValidationError('thread belongs to another agent');
  }
  const occupied = input.schedules.findByThreadId(thread.id);
  if (occupied && occupied.id !== input.exceptScheduleId) {
    throw new ValidationError('thread already has a schedule');
  }
  return thread;
}
