import { useShallow } from 'zustand/react/shallow';
import { useAgentStore } from '@/entities/agent';
import { useSelectedSchedule, useWorkspaceSchedules } from '@/features/desk';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { ScrollArea } from '@/shared/ui/scroll-area';

import { ScheduleSettings } from './schedule-settings';
import { SchedulesEmpty } from './schedules-empty';

export function SchedulesList() {
  const schedule = useSelectedSchedule();
  const { workspaceId } = useStudioLocation();
  const { openSchedule } = useStudioNavigation();
  const agents = useAgentStore(
    useShallow((state) =>
      workspaceId ? state.items.filter((a) => a.workspaceId === workspaceId) : [],
    ),
  );
  const schedules = useWorkspaceSchedules(workspaceId);

  if (!schedule) {
    return (
      <SchedulesEmpty
        workspaceId={workspaceId}
        agents={agents}
        schedules={schedules}
        onOpen={openSchedule}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="schedules-list">
      <ScrollArea className="min-h-0 flex-1">
        <ScheduleSettings key={schedule.id} schedule={schedule} />
      </ScrollArea>
    </div>
  );
}
