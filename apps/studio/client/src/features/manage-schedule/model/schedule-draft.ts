import type {
  PermissionMode,
  Schedule,
  ScheduleHistory,
  ScheduleStatus,
} from '@/entities/schedule';

export type ScheduleDraft = {
  name: string;
  status: ScheduleStatus;
  targetAgentId: string;
  detail: string;
  cron: string;
  mode: PermissionMode;
  history: ScheduleHistory;
  historyLast: number;
  threadId: string;
};

export const MODE_LABELS: Record<PermissionMode, string> = {
  ask: 'Ask before changes',
  auto: 'Edit automatically',
  dont_ask: "Don't ask",
  bypass: 'Bypass',
};

export function draftFrom(item: Schedule): ScheduleDraft {
  return {
    name: item.name,
    status: item.status,
    targetAgentId: item.targetAgentId,
    detail: item.detail,
    cron: item.cron,
    mode: item.mode,
    history: item.history,
    historyLast: item.historyLast,
    threadId: item.threadId,
  };
}

export function isDirty(item: Schedule, draft: ScheduleDraft): boolean {
  return (
    draft.name !== item.name ||
    draft.status !== item.status ||
    draft.targetAgentId !== item.targetAgentId ||
    draft.detail !== item.detail ||
    draft.cron !== item.cron ||
    draft.mode !== item.mode ||
    draft.history !== item.history ||
    draft.historyLast !== item.historyLast ||
    draft.threadId !== item.threadId
  );
}
