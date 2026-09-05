import { CalendarClockIcon, PlusIcon, WebhookIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { Agent } from '@/entities/agent';
import type { Schedule } from '@/entities/schedule';
import { useThreadStore } from '@/entities/thread';
import type { Webhook } from '@/entities/webhook';
import { useIdeStore } from '@/features/ide';
import {
  confirmDeleteSchedule,
  createSchedule,
  deleteSchedule,
  openScheduleConfigDialog,
  updateSchedule,
} from '@/features/manage-schedule';
import {
  confirmDeleteWebhook,
  createWebhook,
  deleteWebhook,
  openWebhookConfigDialog,
  updateWebhook,
} from '@/features/manage-webhook';
import { useStudioNavigation } from '@/shared/config/navigation';
import { studioPath } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { ScheduleRow } from './schedule-row';
import { WebhookRow } from './webhook-row';

export type AutomationsAddMenuProps = {
  workspaceId: string | null;
  agents: Agent[];
  onDone: () => void;
};

export type AutomationsSectionProps = {
  workspaceId: string | null;
  agents: Agent[];
  schedules: Schedule[];
  webhooks: Webhook[];
  activeScheduleId: string | null;
  activeWebhookId: string | null;
  activeThreadId: string | null;
  onSelectDone: () => void;
};

type AutomationEntry = {
  key: string;
  updatedAt: string;
  node: ReactNode;
};

export function AutomationsAddMenu({ workspaceId, agents, onDone }: AutomationsAddMenuProps) {
  const navigate = useNavigate();

  const createScheduler = () => {
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
        onDone();
      }
    });
  };

  const createHook = () => {
    if (!workspaceId) {
      return;
    }
    void openWebhookConfigDialog(agents, workspaceId).then(async (draft) => {
      if (!draft) {
        return;
      }
      const created = await createWebhook(workspaceId, draft);
      if (created) {
        openWebhookThread(created);
        onDone();
      }
    });
  };

  const openWebhookThread = (item: Webhook) => {
    if (!workspaceId) {
      return;
    }
    const agentId = useThreadStore.getState().byId(item.threadId)?.agentId;
    useIdeStore.getState().openThread(workspaceId, agentId ?? item.targetAgentId, item.threadId);
    void navigate(studioPath.thread(workspaceId, item.threadId, { kind: 'webhook', id: item.id }));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            title="New automation"
            aria-label="New automation"
          />
        }
      >
        <PlusIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
        <span className="sr-only">New automation</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={createScheduler}>
            <CalendarClockIcon />
            New scheduler
          </DropdownMenuItem>
          <DropdownMenuItem onClick={createHook}>
            <WebhookIcon />
            New webhook
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AutomationsSection({
  workspaceId,
  agents,
  schedules,
  webhooks,
  activeScheduleId,
  activeWebhookId,
  activeThreadId,
  onSelectDone,
}: AutomationsSectionProps) {
  const navigate = useNavigate();
  const { openWorkspace } = useStudioNavigation();

  const openScheduleThread = (item: Schedule) => {
    if (!workspaceId) {
      return;
    }
    useIdeStore.getState().openThread(workspaceId, item.targetAgentId, item.threadId);
    void navigate(
      studioPath.thread(workspaceId, item.threadId, { kind: 'scheduler', id: item.id }),
    );
  };

  const openWebhookThread = (item: Webhook) => {
    if (!workspaceId) {
      return;
    }
    const agentId = useThreadStore.getState().byId(item.threadId)?.agentId;
    useIdeStore.getState().openThread(workspaceId, agentId ?? item.targetAgentId, item.threadId);
    void navigate(studioPath.thread(workspaceId, item.threadId, { kind: 'webhook', id: item.id }));
  };

  const entries: AutomationEntry[] = [
    ...schedules.map((item) => ({
      key: `scheduler:${item.id}`,
      updatedAt: item.updatedAt,
      node: (
        <ScheduleRow
          schedule={item}
          selected={activeScheduleId === item.id}
          onSelect={() => {
            openScheduleThread(item);
            onSelectDone();
          }}
          onSettings={() => {
            if (!workspaceId) {
              return;
            }
            void openScheduleConfigDialog(agents, workspaceId, item).then(async (draft) => {
              if (!draft) {
                return;
              }
              await updateSchedule(workspaceId, item.id, draft);
            });
          }}
          onDelete={() => {
            void confirmDeleteSchedule(item).then(async (confirmed) => {
              if (!confirmed || !workspaceId) {
                return;
              }
              const removed = await deleteSchedule(workspaceId, item.id);
              if (removed) {
                useIdeStore.getState().closeByEntity(workspaceId, 'thread', item.threadId);
                if (item.threadId === activeThreadId) {
                  openWorkspace(workspaceId);
                }
              }
            });
          }}
        />
      ),
    })),
    ...webhooks.map((item) => ({
      key: `webhook:${item.id}`,
      updatedAt: item.updatedAt,
      node: (
        <WebhookRow
          webhook={item}
          selected={activeWebhookId === item.id}
          onSelect={() => {
            openWebhookThread(item);
            onSelectDone();
          }}
          onSettings={() => {
            if (!workspaceId) {
              return;
            }
            void openWebhookConfigDialog(agents, workspaceId, item).then(async (draft) => {
              if (!draft) {
                return;
              }
              await updateWebhook(workspaceId, item.id, draft);
            });
          }}
          onDelete={() => {
            void confirmDeleteWebhook(item).then(async (confirmed) => {
              if (!confirmed || !workspaceId) {
                return;
              }
              await deleteWebhook(workspaceId, item);
              useIdeStore.getState().closeByEntity(workspaceId, 'thread', item.threadId);
              if (item.threadId === activeThreadId) {
                openWorkspace(workspaceId);
              }
            });
          }}
        />
      ),
    })),
  ];
  entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (entries.length === 0) {
    return (
      <p className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
        Wire a cron schedule or an inbound webhook.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
      {entries.map((entry) => (
        <Fragment key={entry.key}>{entry.node}</Fragment>
      ))}
    </div>
  );
}
