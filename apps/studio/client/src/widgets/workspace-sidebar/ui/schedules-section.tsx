import { Calendar } from 'lucide-react';
import type { Agent } from '@/entities/agent';
import type { Schedule } from '@/entities/schedule';
import { useSelectThread } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import {
  confirmDeleteSchedule,
  createSchedule,
  deleteSchedule,
  openCreateScheduleDialog,
} from '@/features/manage-schedule';
import { useStudioNavigation } from '@/shared/config/navigation';
import { RailSection } from './rail-section';
import { ScheduleRow } from './schedule-row';

type SchedulesSectionProps = {
  workspaceId: string | null;
  agents: Agent[];
  schedules: Schedule[];
  selectedScheduleId: string | null;
  selected: boolean;
  onOpen: (workspaceId: string, scheduleId: string) => void;
  onSelectDone: () => void;
};

export function SchedulesSection({
  workspaceId,
  agents,
  schedules,
  selectedScheduleId,
  selected,
  onOpen,
  onSelectDone,
}: SchedulesSectionProps) {
  const { openSchedules } = useStudioNavigation();
  const selectThread = useSelectThread();

  const create = () => {
    void openCreateScheduleDialog(agents).then(async (draft) => {
      if (!draft || !workspaceId) {
        return;
      }
      const created = await createSchedule(workspaceId, draft);
      if (created) {
        useIdeStore.getState().openSchedule(workspaceId, created.id);
        onOpen(workspaceId, created.id);
      }
    });
  };

  return (
    <RailSection
      id="schedules"
      icon={<Calendar />}
      title="Schedules"
      addLabel="New schedule"
      selected={selected}
      onHeaderClick={() => {
        if (workspaceId) {
          openSchedules(workspaceId);
          onSelectDone();
        }
      }}
      onAdd={create}
      testId="nav-schedules"
    >
      {schedules.length === 0 ? (
        <button
          type="button"
          className="group/empty flex w-full flex-col gap-1 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
          onClick={create}
        >
          <span className="flex items-center gap-1.5">
            <span className="live-dot size-1 rounded-full bg-live" />
            <span className="font-mono text-[10px] text-live tracking-[0.16em]">QUIET</span>
          </span>
          <span className="text-[11px] text-muted-foreground leading-snug">
            Wire a cron schedule.
          </span>
        </button>
      ) : (
        <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
          {schedules.map((item) => (
            <ScheduleRow
              key={item.id}
              schedule={item}
              selected={item.id === selectedScheduleId && selected}
              onSelect={(waiting) => {
                if (workspaceId) {
                  if (waiting) {
                    useIdeStore
                      .getState()
                      .openThread(workspaceId, item.targetAgentId, item.threadId);
                    selectThread(workspaceId, item.targetAgentId, item.threadId);
                  } else {
                    useIdeStore.getState().openSchedule(workspaceId, item.id);
                    onOpen(workspaceId, item.id);
                  }
                }
                onSelectDone();
              }}
              onDelete={() => {
                void confirmDeleteSchedule(item).then(async (confirmed) => {
                  if (!confirmed || !workspaceId) {
                    return;
                  }
                  const removed = await deleteSchedule(workspaceId, item.id);
                  if (removed) {
                    useIdeStore.getState().closeByEntity(workspaceId, 'schedule', item.id);
                    if (item.id === selectedScheduleId) {
                      openSchedules(workspaceId);
                    }
                  }
                });
              }}
            />
          ))}
        </div>
      )}
    </RailSection>
  );
}
