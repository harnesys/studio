import type { Agent } from '@/entities/agent';
import type { Schedule } from '@/entities/schedule';
import { alert, dialog } from '@/shared/services/overlay';

import { ScheduleConfigDialog } from '../ui/schedule-config-dialog';

export function openScheduleConfigDialog(
  agents: Agent[],
  workspaceId: string,
  schedule?: Schedule,
) {
  return dialog.open(ScheduleConfigDialog, {
    title: schedule ? `Configure ${schedule.name}` : 'New scheduler',
    className: 'sm:max-w-2xl',
    testId: 'schedule-config-dialog',
    data: { agents, workspaceId, schedule: schedule ?? null },
  });
}

export function confirmDeleteSchedule(schedule: Schedule) {
  return alert.confirm({
    title: `Delete ${schedule.name}?`,
    description: 'The schedule and its thread will be permanently deleted.',
    confirmText: 'Delete schedule',
    variant: 'destructive',
    testId: 'delete-schedule-dialog',
  });
}
