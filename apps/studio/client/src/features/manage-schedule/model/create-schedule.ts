import { useJournalStore } from '@/entities/journal';
import {
  type Schedule,
  type ScheduleDraft,
  toClientSchedule,
  useScheduleStore,
} from '@/entities/schedule';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { createScheduleRecord } from '@/shared/api';

export async function createSchedule(
  workspaceId: string,
  draft: ScheduleDraft,
): Promise<Schedule | null> {
  const name = draft.name.trim();
  if (!workspaceId || !name || !draft.targetAgentId) {
    return null;
  }
  const created = await createScheduleRecord(workspaceId, {
    name,
    targetAgentId: draft.targetAgentId,
    threadId: draft.threadId || undefined,
  });
  const schedule = toClientSchedule(created.schedule);
  useScheduleStore.getState().upsert(schedule);
  useThreadStore.getState().upsert(toClientThread(created.thread));
  if (created.thread.kind !== 'chat') {
    useJournalStore.getState().replaceJournal(created.thread.id, created.thread.journal);
  }
  return schedule;
}
