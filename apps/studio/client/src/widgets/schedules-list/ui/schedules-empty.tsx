import { CalendarClockIcon } from 'lucide-react';
import type { Agent } from '@/entities/agent';
import type { Schedule } from '@/entities/schedule';
import { scheduleInk, scheduleStatusLabel } from '@/entities/schedule';
import { createSchedule, openCreateScheduleDialog } from '@/features/manage-schedule';
import {
  CategoryLanding,
  CategoryLandingActionCard,
  CategoryLandingActions,
  CategoryLandingDescription,
  CategoryLandingEyebrow,
  CategoryLandingList,
  CategoryLandingListItem,
  CategoryLandingSection,
  CategoryLandingTitle,
} from '@/shared/ui/category-landing';

type SchedulesEmptyProps = {
  workspaceId: string | null;
  agents: Agent[];
  schedules: Schedule[];
  onOpen: (workspaceId: string, scheduleId: string) => void;
};

export function SchedulesEmpty({ workspaceId, agents, schedules, onOpen }: SchedulesEmptyProps) {
  return (
    <CategoryLanding data-testid="schedules-list">
      <CategoryLandingEyebrow>QUIET</CategoryLandingEyebrow>
      <CategoryLandingTitle>No schedules yet</CategoryLandingTitle>
      <CategoryLandingDescription>
        Cron wakes an agent without opening a thread. Wire one when you want a run on the clock.
      </CategoryLandingDescription>

      <div className="mt-8">
        <p className="mb-2.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
          Wire one
        </p>
        <CategoryLandingActions>
          <CategoryLandingActionCard
            icon={<CalendarClockIcon />}
            title="Schedule"
            description="Cron fires a run on the clock."
            meta="0 2 * * *"
            onClick={() => {
              if (!workspaceId) {
                return;
              }
              void openCreateScheduleDialog(agents).then(async (draft) => {
                if (!draft || !workspaceId) {
                  return;
                }
                const created = await createSchedule(workspaceId, draft);
                if (created) {
                  onOpen(workspaceId, created.id);
                }
              });
            }}
          />
        </CategoryLandingActions>
      </div>

      {schedules.length > 0 ? (
        <CategoryLandingSection label="Existing">
          <CategoryLandingList>
            {schedules.map((item) => (
              <CategoryLandingListItem
                key={item.id}
                icon={<CalendarClockIcon />}
                title={item.name}
                subtitle={item.cron}
                status={
                  <span className={scheduleInk(item.status)}>
                    {scheduleStatusLabel(item.status)}
                  </span>
                }
                onClick={() => {
                  if (workspaceId) {
                    onOpen(workspaceId, item.id);
                  }
                }}
              />
            ))}
          </CategoryLandingList>
        </CategoryLandingSection>
      ) : null}
    </CategoryLanding>
  );
}
