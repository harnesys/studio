import type { Schedule } from '@/entities/schedule';
import { alert } from '@/shared/services/overlay';

export function confirmDeleteSchedule(schedule: Schedule) {
  return alert.confirm({
    title: `Delete ${schedule.name}?`,
    description: 'The schedule and its thread will be permanently deleted.',
    confirmText: 'Delete schedule',
    variant: 'destructive',
    testId: 'delete-schedule-dialog',
  });
}
