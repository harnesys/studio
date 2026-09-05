import { Calendar } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { Agent } from '@/entities/agent';
import type { Schedule } from '@/entities/schedule';
import { useIdeStore } from '@/features/ide';
import {
  confirmDeleteSchedule,
  createSchedule,
  deleteSchedule,
  openScheduleConfigDialog,
} from '@/features/manage-schedule';
import { studioPath } from '@/shared/config/routes';
import { RailSection } from './rail-section';
import { ScheduleRow } from './schedule-row';

type SchedulesSectionProps = {
  workspaceId: string | null;
  agents: Agent[];
  schedules: Schedule[];
  onSelectDone: () => void;
};

export function SchedulesSection({
  workspaceId,
  agents,
  schedules,
  onSelectDone,
}: SchedulesSectionProps) {
  const navigate = useNavigate();

  const create = () => {
    if (!workspaceId) {
      return;
    }
    void openScheduleConfigDialog(agents, workspaceId).then(async (draft) => {
      if (!draft) {
        return;
      }
      const created = await createSchedule(workspaceId, draft);
      if (created) {
        useIdeStore.getState().openThread(workspaceId, created.targetAgentId, created.threadId);
        void navigate(
          studioPath.thread(workspaceId, created.threadId, { kind: 'scheduler', id: created.id }),
        );
        onSelectDone();
      }
    });
  };

  return (
    <RailSection
      id="schedules"
      icon={<Calendar />}
      title="Schedules"
      addLabel="New schedule"
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
              selected={false}
              onSelect={() => {
                if (workspaceId) {
                  useIdeStore.getState().openThread(workspaceId, item.targetAgentId, item.threadId);
                  void navigate(
                    studioPath.thread(workspaceId, item.threadId, {
                      kind: 'scheduler',
                      id: item.id,
                    }),
                  );
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
                    useIdeStore.getState().closeByEntity(workspaceId, 'thread', item.threadId);
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
