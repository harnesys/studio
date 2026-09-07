import { CalendarClockIcon, EarthIcon, MessageSquarePlusIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import { type AgentStatus, statusLabel } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import {
  clearActiveThreadId,
  setActiveThreadId,
  type Thread,
  useThreadStore,
} from '@/entities/thread';
import {
  useAgentLiveStatus,
  useAgentThreads,
  useDeskStore,
  useSelectedAgent,
  useWorkspaceAgents,
  useWorkspaceSchedules,
  useWorkspaceWebhooks,
} from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import {
  confirmDeleteSchedule,
  createSchedule,
  deleteSchedule,
  openScheduleConfigDialog,
} from '@/features/manage-schedule';
import {
  confirmDeleteWebhook,
  createWebhook,
  deleteWebhook,
  openWebhookConfigDialog,
} from '@/features/manage-webhook';
import { confirmDeleteThread, openNewThread } from '@/features/switch-thread';
import { deleteThreadRecord, setThreadPinned } from '@/shared/api';
import { studioPath, type ThreadOriginRef } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import {
  CategoryLanding,
  CategoryLandingActionCard,
  CategoryLandingActions,
  CategoryLandingDescription,
  CategoryLandingEyebrow,
  CategoryLandingTitle,
} from '@/shared/ui/category-landing';
import { ThreadSection } from './thread-section';

export function AgentDashboard() {
  const agent = useSelectedAgent();
  const navigate = useNavigate();
  const status = useAgentLiveStatus(agent?.id ?? '');
  const threads = useAgentThreads(agent?.id ?? null);
  const agents = useWorkspaceAgents(agent?.workspaceId ?? null);
  const schedules = useWorkspaceSchedules(agent?.workspaceId ?? null);
  const webhooks = useWorkspaceWebhooks(agent?.workspaceId ?? null);
  const sorted = [...threads].sort((a, b) => {
    const pinDelta = Number(b.pinned === true) - Number(a.pinned === true);
    if (pinDelta !== 0) {
      return pinDelta;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  const chats = sorted.filter((thread) => thread.kind === 'chat');
  const automations = sorted.filter((thread) => thread.kind !== 'chat');

  const openThread = (threadId: string) => {
    if (!agent) {
      return;
    }
    useIdeStore.getState().openThread(agent.workspaceId, agent.id, threadId);
    useDeskStore.getState().setFocusedThreadId(threadId);
    setActiveThreadId(agent.id, threadId);
    void navigate(studioPath.thread(agent.workspaceId, threadId, { kind: 'agent', id: agent.id }));
  };

  const openAutomationThread = (
    targetAgentId: string,
    threadId: string,
    origin: ThreadOriginRef,
  ) => {
    if (!agent) {
      return;
    }
    useIdeStore.getState().openThread(agent.workspaceId, targetAgentId, threadId);
    useDeskStore.getState().setFocusedThreadId(threadId);
    setActiveThreadId(targetAgentId, threadId);
    void navigate(studioPath.thread(agent.workspaceId, threadId, origin));
  };

  const handleNewThread = () => {
    if (!agent) {
      return;
    }
    void openNewThread(agent.id, agent.workspaceId).then((threadId) => {
      if (threadId) {
        openThread(threadId);
      }
    });
  };

  const handleNewScheduler = () => {
    if (!agent) {
      return;
    }
    void openScheduleConfigDialog(agents, agent.workspaceId).then(async (draft) => {
      if (!draft) {
        return;
      }
      const created = await createSchedule(agent.workspaceId, draft);
      if (created) {
        openAutomationThread(created.targetAgentId, created.threadId, {
          kind: 'scheduler',
          id: created.id,
        });
      }
    });
  };

  const handleNewWebhook = () => {
    if (!agent) {
      return;
    }
    void openWebhookConfigDialog(agents, agent.workspaceId).then(async (draft) => {
      if (!draft) {
        return;
      }
      const created = await createWebhook(agent.workspaceId, draft);
      if (created) {
        openAutomationThread(created.targetAgentId, created.threadId, {
          kind: 'webhook',
          id: created.id,
        });
      }
    });
  };

  const syncActiveThread = (agentId: string) => {
    const next = useThreadStore.getState().latestForAgent(agentId)?.id ?? null;
    if (next) {
      setActiveThreadId(agentId, next);
    } else {
      clearActiveThreadId(agentId);
      if (agent) {
        void navigate(studioPath.agent(agent.workspaceId, agentId));
      }
    }
  };

  const handleTogglePin = (thread: Thread) => {
    const next = thread.pinned !== true;
    void setThreadPinned(thread.id, next)
      .catch(() => null)
      .then((record) => {
        useThreadStore.getState().setPinned(thread.id, record ? record.pinned : next);
      });
  };

  const handleDeleteThread = (thread: Thread) => {
    if (!agent) {
      return;
    }
    const workspaceId = agent.workspaceId;
    if (thread.kind === 'schedule') {
      const schedule = schedules.find((item) => item.threadId === thread.id);
      if (!schedule) {
        return;
      }
      void confirmDeleteSchedule(schedule).then(async (confirmed) => {
        if (!confirmed) {
          return;
        }
        const removed = await deleteSchedule(workspaceId, schedule.id).catch(() => false);
        if (removed) {
          useIdeStore.getState().closeByEntity(workspaceId, 'thread', schedule.threadId);
          syncActiveThread(thread.agentId);
        }
      });
      return;
    }
    if (thread.kind === 'webhook') {
      const webhook = webhooks.find((item) => item.threadId === thread.id);
      if (!webhook) {
        return;
      }
      void confirmDeleteWebhook(webhook).then(async (confirmed) => {
        if (!confirmed) {
          return;
        }
        const removed = await deleteWebhook(workspaceId, webhook).catch(() => false);
        if (removed) {
          useIdeStore.getState().closeByEntity(workspaceId, 'thread', webhook.threadId);
          syncActiveThread(thread.agentId);
        }
      });
      return;
    }
    void confirmDeleteThread(thread).then((confirmed) => {
      if (!confirmed) {
        return;
      }
      void deleteThreadRecord(thread.id)
        .catch(() => {})
        .finally(() => {
          useSessionStore.getState().removeForThreads([thread.id]);
          useThreadStore.getState().remove(thread.id);
          useIdeStore.getState().closeByEntity(workspaceId, 'thread', thread.id);
          syncActiveThread(thread.agentId);
        });
    });
  };

  if (!agent) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Agent not found.</p>
      </div>
    );
  }

  return (
    <CategoryLanding
      data-testid="agent-landing"
      className="fade-in animate-in duration-200 [&>div:last-child]:max-w-[640px]"
    >
      <CategoryLandingEyebrow>READY</CategoryLandingEyebrow>
      <CategoryLandingTitle>{agent.name} is on the floor</CategoryLandingTitle>
      <CategoryLandingDescription className="line-clamp-4">
        {agent.instructions || agent.role}
      </CategoryLandingDescription>
      <div className="mt-2 flex items-center gap-2">
        {agent.role && agent.instructions ? (
          <p className="min-w-0 truncate text-[11px] text-muted-foreground leading-4">
            {agent.role}
          </p>
        ) : null}
        <span className={cn('shrink-0 font-mono text-[10px] leading-4', statusInk(status))}>
          {statusLabel(status)}
        </span>
      </div>
      <div className="mt-8">
        <p className="mb-2.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
          Create
        </p>
        <CategoryLandingActions>
          <CategoryLandingActionCard
            icon={<MessageSquarePlusIcon />}
            title="New thread"
            description="Start a fresh conversation."
            onClick={handleNewThread}
          />
          <CategoryLandingActionCard
            icon={<CalendarClockIcon />}
            title="New schedule"
            description="Cron fires a run."
            onClick={handleNewScheduler}
          />
          <CategoryLandingActionCard
            icon={<EarthIcon />}
            title="New webhook"
            description="Inbound trigger for an agent."
            onClick={handleNewWebhook}
          />
        </CategoryLandingActions>
      </div>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <ThreadSection
          label="Chats"
          emptyLabel="No chats yet."
          threads={chats}
          onOpen={(thread) => openThread(thread.id)}
          onPinToggle={handleTogglePin}
          onDelete={handleDeleteThread}
        />
        <ThreadSection
          label="Automations"
          emptyLabel="No automations yet."
          threads={automations}
          onOpen={(thread) => openThread(thread.id)}
          onPinToggle={handleTogglePin}
          onDelete={handleDeleteThread}
        />
      </div>
    </CategoryLanding>
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
