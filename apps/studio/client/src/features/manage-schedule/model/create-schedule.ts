import { type Schedule, toClientSchedule, useScheduleStore } from '@/entities/schedule';
import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { createScheduleRecord } from '@/shared/api';
import type { ScheduleFormDraft } from './schedule-draft';

export async function createSchedule(
  workspaceId: string,
  draft: ScheduleFormDraft,
): Promise<Schedule | null> {
  const name = draft.name.trim();
  if (!workspaceId || !name || !draft.targetAgentId) {
    return null;
  }
  const created = await createScheduleRecord(workspaceId, {
    name,
    targetAgentId: draft.targetAgentId,
    detail: draft.detail.trim() || undefined,
    cron: draft.cron.trim() || undefined,
    mode: draft.mode,
    history: draft.history,
    historyLast: draft.historyLast,
    threadId: draft.threadId || undefined,
  });
  const schedule = toClientSchedule(created.schedule);
  useScheduleStore.getState().upsert(schedule);
  useThreadStore.getState().upsert(toClientThread(created.thread));
  if (created.thread.kind !== 'chat') {
    useSessionStore.getState().replaceEvents(created.thread.id, created.thread.events);
  }
  return schedule;
}
