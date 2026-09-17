import { MoreHorizontalIcon, PauseIcon, PlayIcon } from 'lucide-react';
import { type Agent, useAgentStore } from '@/entities/agent';
import { type Schedule, scheduleStatusLabel, useScheduleStore } from '@/entities/schedule';
import { useThreadStore } from '@/entities/thread';
import { useWebhookStore, type Webhook, webhookStatusLabel } from '@/entities/webhook';
import { useWorkspaceAgents } from '@/features/desk';
import { openScheduleConfigDialog, updateSchedule } from '@/features/manage-schedule';
import { openWebhookConfigDialog, updateWebhook } from '@/features/manage-webhook';
import { HitlPrompt } from '@/features/send-message';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { ThreadJournal } from '@/widgets/thread-journal';

export function ScheduleSurface({
  workspaceId,
  scheduleId,
}: {
  workspaceId: string;
  scheduleId: string;
}) {
  const schedule = useScheduleStore((state) =>
    state.items.find((item) => item.id === scheduleId && item.workspaceId === workspaceId),
  );
  const agents = useWorkspaceAgents(workspaceId);
  if (!schedule) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Schedule not found
      </div>
    );
  }
  return <ScheduleSurfaceView schedule={schedule} agents={agents} />;
}

export function WebhookSurface({
  workspaceId,
  webhookId,
}: {
  workspaceId: string;
  webhookId: string;
}) {
  const webhook = useWebhookStore((state) =>
    state.items.find((item) => item.id === webhookId && item.workspaceId === workspaceId),
  );
  const agents = useWorkspaceAgents(workspaceId);
  if (!webhook) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Webhook not found
      </div>
    );
  }
  return <WebhookSurfaceView webhook={webhook} agents={agents} />;
}

function ScheduleSurfaceView({ schedule, agents }: { schedule: Schedule; agents: Agent[] }) {
  const agent = useAgentStore((state) => state.byId(schedule.targetAgentId) ?? undefined);
  const thread = useThreadStore((state) => state.byId(schedule.threadId) ?? undefined);
  const paused = schedule.status === 'paused';

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-schedule">
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">{schedule.name}</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {schedule.cron} · {scheduleStatusLabel(schedule.status)}
            {agent ? ` · ${agent.name}` : ''}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          title={paused ? 'Resume' : 'Pause'}
          onClick={() => {
            void updateSchedule(schedule.workspaceId, schedule.id, {
              status: paused ? 'active' : 'paused',
            });
          }}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label="Schedule actions" />}
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                void openScheduleConfigDialog(agents, schedule.workspaceId, schedule).then(
                  async (draft) => {
                    if (!draft) {
                      return;
                    }
                    await updateSchedule(schedule.workspaceId, schedule.id, draft);
                  },
                );
              }}
            >
              Configure…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {thread && agent ? (
        <>
          <ThreadJournal threadId={thread.id} agent={agent} kind="schedule" />
          <HitlPrompt />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Journal unavailable
        </div>
      )}
    </div>
  );
}

function WebhookSurfaceView({ webhook, agents }: { webhook: Webhook; agents: Agent[] }) {
  const agent = useAgentStore((state) => state.byId(webhook.targetAgentId) ?? undefined);
  const thread = useThreadStore((state) => state.byId(webhook.threadId) ?? undefined);
  const paused = webhook.status === 'paused';

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-webhook">
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">{webhook.name}</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {webhook.endpoint} · {webhookStatusLabel(webhook.status)}
            {agent ? ` · ${agent.name}` : ''}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          title={paused ? 'Resume' : 'Pause'}
          onClick={() => {
            void updateWebhook(webhook.workspaceId, webhook.id, {
              status: paused ? 'active' : 'paused',
            });
          }}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label="Webhook actions" />}
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                void openWebhookConfigDialog(agents, webhook.workspaceId, webhook).then(
                  async (draft) => {
                    if (!draft) {
                      return;
                    }
                    await updateWebhook(webhook.workspaceId, webhook.id, draft);
                  },
                );
              }}
            >
              Configure…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {thread && agent ? (
        <>
          <ThreadJournal threadId={thread.id} agent={agent} kind="webhook" />
          <HitlPrompt />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Journal unavailable
        </div>
      )}
    </div>
  );
}
