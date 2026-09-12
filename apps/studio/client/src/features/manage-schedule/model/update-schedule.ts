import {
  type Schedule,
  type SchedulePatch,
  toClientSchedule,
  useScheduleStore,
} from '@/entities/schedule';
import { useThreadStore } from '@/entities/thread';
import { updateScheduleRecord } from '@/shared/api';

export async function updateSchedule(
  workspaceId: string,
  scheduleId: string,
  patch: SchedulePatch,
): Promise<Schedule | null> {
  const current = useScheduleStore.getState().byId(scheduleId);
  if (!current || current.workspaceId !== workspaceId) {
    return null;
  }

  const name = patch.name?.trim();
  if (patch.name !== undefined && !name) {
    return null;
  }

  const cron = patch.cron?.trim();
  if (patch.cron !== undefined && !cron) {
    return null;
  }

  const record = await updateScheduleRecord(workspaceId, scheduleId, {
    name,
    status: patch.status,
    targetAgentId: patch.targetAgentId,
    detail: patch.detail,
    cron,
    modeId: patch.modeId,
    history: patch.history,
    historyLast: patch.historyLast,
    threadId: patch.threadId,
  });
  const schedule = toClientSchedule(record);
  useScheduleStore.getState().upsert(schedule);

  if (patch.threadId && patch.threadId !== current.threadId) {
    const previous = useThreadStore.getState().items.find((item) => item.id === current.threadId);
    if (previous?.kind === 'schedule') {
      useThreadStore.getState().remove(current.threadId);
    }
  }

  if (name && name !== current.name) {
    useThreadStore.setState((state) => ({
      items: state.items.map((item) =>
        item.id === schedule.threadId ? { ...item, title: name } : item,
      ),
    }));
  }

  return schedule;
}
