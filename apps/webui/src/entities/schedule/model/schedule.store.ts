import { create } from 'zustand';
import type { Schedule, ScheduleHistory, ScheduleStatus } from './schedule';
export type SchedulePatch = {
  name?: string;
  status?: ScheduleStatus;
  targetAgentId?: string;
  detail?: string;
  cron?: string;
  modeId?: string;
  history?: ScheduleHistory;
  historyLast?: number;
  threadId?: string;
};
type ScheduleStore = {
  items: Schedule[];
  byId: (id: string) => Schedule | undefined;
  inWorkspace: (workspaceId: string) => Schedule[];
  upsert: (schedule: Schedule) => void;
  replaceWorkspace: (workspaceId: string, schedules: Schedule[]) => void;
  update: (scheduleId: string, patch: SchedulePatch) => void;
  remove: (scheduleId: string) => void;
};
export const useScheduleStore = create<ScheduleStore>((set, get) => ({
  items: [],
  byId: (id) => get().items.find((item) => item.id === id),
  inWorkspace: (workspaceId) => get().items.filter((item) => item.workspaceId === workspaceId),
  upsert: (schedule) => {
    set((state) => ({
      items: state.items.some((item) => item.id === schedule.id)
        ? state.items.map((item) => (item.id === schedule.id ? schedule : item))
        : [...state.items, schedule],
    }));
  },
  replaceWorkspace: (workspaceId, schedules) => {
    set((state) => ({
      items: [...state.items.filter((item) => item.workspaceId !== workspaceId), ...schedules],
    }));
  },
  update: (scheduleId, patch) => {
    const current = get().items.find((item) => item.id === scheduleId);
    if (!current) {
      return;
    }
    const name = patch.name?.trim();
    if (patch.name !== undefined && !name) {
      return;
    }
    set((state) => ({
      items: state.items.map((item) =>
        item.id === scheduleId
          ? {
              ...item,
              name: name ?? item.name,
              status: patch.status ?? item.status,
              targetAgentId: patch.targetAgentId ?? item.targetAgentId,
              detail: patch.detail?.trim() || item.detail,
              cron: patch.cron?.trim() || item.cron,
              modeId: patch.modeId ?? item.modeId,
            }
          : item,
      ),
    }));
  },
  remove: (scheduleId) => {
    set((state) => ({
      items: state.items.filter((item) => item.id !== scheduleId),
    }));
  },
}));
