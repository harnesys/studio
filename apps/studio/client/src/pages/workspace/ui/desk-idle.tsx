import { BotIcon, CalendarClockIcon } from 'lucide-react';
import { type Agent, type AgentStatus, statusLabel } from '@/entities/agent';
import { useOpenAgent, useWorkspaceAgents } from '@/features/desk';
import { createAgent, openCreateAgentDialog } from '@/features/manage-agent';
import { createSchedule, openCreateScheduleDialog } from '@/features/manage-schedule';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { cn } from '@/shared/lib/utils';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import {
  CategoryLanding,
  CategoryLandingActionCard,
  CategoryLandingActions,
  CategoryLandingDescription,
  CategoryLandingEyebrow,
  CategoryLandingSection,
  CategoryLandingTitle,
} from '@/shared/ui/category-landing';

export function DeskIdle() {
  const { workspaceId } = useStudioLocation();
  const { openSchedule } = useStudioNavigation();
  const openAgent = useOpenAgent();
  const agents = useWorkspaceAgents(workspaceId);

  return (
    <CategoryLanding data-testid="chat-empty-agent">
      <CategoryLandingEyebrow>STANDBY</CategoryLandingEyebrow>
      <CategoryLandingTitle>Nobody on comms</CategoryLandingTitle>
      <CategoryLandingDescription>
        Open an agent to start a thread, or wire a schedule so one of them wakes without you.
      </CategoryLandingDescription>

      <div className="mt-8">
        <p className="mb-2.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
          Start with
        </p>
        <CategoryLandingActions>
          <CategoryLandingActionCard
            icon={<BotIcon />}
            title="New agent"
            description="Name and a job. Open it to start a thread."
            onClick={() => {
              void openCreateAgentDialog().then(async (draft) => {
                if (!draft || !workspaceId) {
                  return;
                }
                const result = await createAgent(workspaceId, draft);
                if (result) {
                  openAgent(workspaceId, result.agent.id);
                }
              });
            }}
          />
          <CategoryLandingActionCard
            icon={<CalendarClockIcon />}
            title="New schedule"
            description="Cron fires a run. Webhooks live in the sidebar."
            onClick={() => {
              void openCreateScheduleDialog(agents).then(async (draft) => {
                if (!draft || !workspaceId) {
                  return;
                }
                const schedule = await createSchedule(workspaceId, draft);
                if (schedule) {
                  openSchedule(workspaceId, schedule.id);
                }
              });
            }}
          />
        </CategoryLandingActions>
      </div>

      {agents.length > 0 ? (
        <CategoryLandingSection label="Talk" icon={<BotIcon className="size-3" />}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {agents.map((agent) => (
              <li key={agent.id}>
                <AgentCard
                  agent={agent}
                  onSelect={() => {
                    if (workspaceId) {
                      openAgent(workspaceId, agent.id);
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        </CategoryLandingSection>
      ) : null}
    </CategoryLanding>
  );
}

function AgentCard({ agent, onSelect }: { agent: Agent; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex h-full w-full items-start gap-2.5 rounded-xl border border-border/70 bg-background/65 px-3 py-2.5 text-left backdrop-blur-[2px]',
        'shadow-[inset_0_1px_0_color-mix(in_oklab,white_6%,transparent)] transition-colors hover:border-live/30 hover:bg-[color-mix(in_oklab,var(--live)_6%,var(--background))]',
        'focus-visible:border-live/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/15',
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted transition-colors group-hover:border-live/15 group-hover:bg-[color-mix(in_oklab,var(--live)_14%,transparent)]">
        <Avatar size="sm" className="size-8 after:hidden">
          <AvatarFallback className="rounded-lg bg-transparent text-[10px] group-hover:text-live">
            {agent.initials}
          </AvatarFallback>
        </Avatar>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium text-sm leading-4">{agent.name}</span>
          <span className={cn('shrink-0 font-mono text-[10px] leading-4', statusInk(agent.status))}>
            {statusLabel(agent.status)}
          </span>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[11px] text-muted-foreground leading-snug">
          {agent.role || agent.instructions}
        </span>
      </span>
    </button>
  );
}

function statusInk(status: AgentStatus): string {
  switch (status) {
    case 'running':
      return 'text-live';
    case 'waiting':
      return 'text-live/70';
    case 'error':
      return 'text-destructive';
    case 'offline':
      return 'text-muted-foreground/70';
    case 'idle':
      return 'text-muted-foreground';
  }
}
