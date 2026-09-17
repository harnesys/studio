import { CalendarClockIcon, WebhookIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { Agent } from '@/entities/agent';
import type { Schedule } from '@/entities/schedule';
import { useThreadStore } from '@/entities/thread';
import type { Webhook } from '@/entities/webhook';
import { useWorkspaces, type Workspace } from '@/entities/workspace';
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
import { DropdownMenuGroup, DropdownMenuItem } from '@/shared/ui/dropdown-menu';
import { ScheduleRow } from './schedule-row';
import { SectionMenu } from './section-menu';
import { WebhookRow } from './webhook-row';
import { WorkspaceGroupLabel } from './workspace-group';

export type AutomationsAddMenuProps = {
  workspaceId: string | null;
  agents: Agent[];
  onDone: () => void;
};

export type AutomationsSectionProps = {
  workspaceIds: string[];
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
    <SectionMenu label="Automations actions">
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={createScheduler}>
          <CalendarClockIcon className="size-3" />
          New scheduler
        </DropdownMenuItem>
        <DropdownMenuItem onClick={createHook}>
          <WebhookIcon className="size-3" />
          New webhook
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </SectionMenu>
  );
}

export function AutomationsSection({
  workspaceIds,
  agents,
  schedules,
  webhooks,
  activeScheduleId,
  activeWebhookId,
  activeThreadId,
  onSelectDone,
}: AutomationsSectionProps) {
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];
  const navigate = useNavigate();
  const { openWorkspace } = useStudioNavigation();

  const openScheduleThread = (item: Schedule) => {
    useIdeStore.getState().openThread(item.workspaceId, item.targetAgentId, item.threadId);
    void navigate(
      studioPath.thread(item.workspaceId, item.threadId, { kind: 'scheduler', id: item.id }),
    );
  };

  const openWebhookThread = (item: Webhook) => {
    const agentId = useThreadStore.getState().byId(item.threadId)?.agentId;
    useIdeStore
      .getState()
      .openThread(item.workspaceId, agentId ?? item.targetAgentId, item.threadId);
    void navigate(
      studioPath.thread(item.workspaceId, item.threadId, { kind: 'webhook', id: item.id }),
    );
  };

  const buildEntries = (workspaceId: string, workspaceAgents: Agent[]): AutomationEntry[] => {
    const groupSchedules = schedules.filter((item) => item.workspaceId === workspaceId);
    const groupWebhooks = webhooks.filter((item) => item.workspaceId === workspaceId);
    const entries: AutomationEntry[] = [
      ...groupSchedules.map((item) => ({
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
              void openScheduleConfigDialog(workspaceAgents, workspaceId, item).then(
                async (draft) => {
                  if (!draft) {
                    return;
                  }
                  await updateSchedule(workspaceId, item.id, draft);
                },
              );
            }}
            onDelete={() => {
              void confirmDeleteSchedule(item).then(async (confirmed) => {
                if (!confirmed) {
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
      ...groupWebhooks.map((item) => ({
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
              void openWebhookConfigDialog(workspaceAgents, workspaceId, item).then(
                async (draft) => {
                  if (!draft) {
                    return;
                  }
                  await updateWebhook(workspaceId, item.id, draft);
                },
              );
            }}
            onDelete={() => {
              void confirmDeleteWebhook(item).then(async (confirmed) => {
                if (!confirmed) {
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
    return entries;
  };

  const groups: { workspace: Workspace; entries: AutomationEntry[] }[] = [];
  for (const id of workspaceIds) {
    const workspace = workspaces.find((item) => item.id === id);
    if (!workspace) {
      continue;
    }
    const workspaceAgents = agents.filter((item) => item.workspaceId === id);
    const entries = buildEntries(id, workspaceAgents);
    if (entries.length === 0) {
      continue;
    }
    groups.push({ workspace, entries });
  }

  if (groups.length === 0) {
    return (
      <p className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
        Wire a cron schedule or an inbound webhook.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
      {groups.map((group) => (
        <div key={group.workspace.id}>
          <WorkspaceGroupLabel name={group.workspace.name} count={group.entries.length} />
          {group.entries.map((entry) => (
            <Fragment key={entry.key}>{entry.node}</Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}
