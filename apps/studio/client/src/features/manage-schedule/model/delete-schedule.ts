import { useSessionStore } from '@/entities/session';
import { useScheduleStore } from '@/entities/schedule';
import { useThreadStore } from '@/entities/thread';
import { deleteScheduleRecord } from '@/shared/api';

export async function deleteSchedule(workspaceId: string, scheduleId: string): Promise<boolean> {
  const current = useScheduleStore.getState().byId(scheduleId);
  if (!current || current.workspaceId !== workspaceId) {
    return false;
  }

  await deleteScheduleRecord(workspaceId, scheduleId);
  useScheduleStore.getState().remove(scheduleId);
  const thread = useThreadStore.getState().byId(current.threadId);
  if (thread?.kind === 'schedule') {
    useSessionStore.getState().removeForThreads([current.threadId]);
    useThreadStore.getState().remove(current.threadId);
  }
  return true;
}
