import type { Agent } from '@/entities/agent';
import type {
  PermissionMode,
  Schedule,
  ScheduleHistory,
  ScheduleStatus,
} from '@/entities/schedule';

export type ScheduleFormDraft = {
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

export function draftFrom(item: Schedule): ScheduleFormDraft {
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

export function emptyScheduleDraft(agents: Agent[]): ScheduleFormDraft {
  return {
    name: '',
    status: 'active',
    targetAgentId: agents[0]?.id ?? '',
    detail: '',
    cron: '0 * * * *',
    mode: 'auto',
    history: 'none',
    historyLast: 1,
    threadId: '',
  };
}
