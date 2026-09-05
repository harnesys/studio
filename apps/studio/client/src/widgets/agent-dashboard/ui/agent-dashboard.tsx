import {
  CalendarClockIcon,
  EarthIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  MoreHorizontalIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
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
  useThreadWaiting,
  useWorkspaceAgents,
} from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { createSchedule, openScheduleConfigDialog } from '@/features/manage-schedule';
import { createWebhook, openWebhookConfigDialog } from '@/features/manage-webhook';
import { confirmDeleteThread, openNewThread } from '@/features/switch-thread';
import { deleteThreadRecord } from '@/shared/api';
import { studioPath, type ThreadOriginRef } from '@/shared/config/routes';
import { formatDayTime } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  CategoryLanding,
  CategoryLandingActionCard,
  CategoryLandingActions,
  CategoryLandingDescription,
  CategoryLandingEyebrow,
  CategoryLandingList,
  CategoryLandingSectionLabel,
  CategoryLandingTitle,
} from '@/shared/ui/category-landing';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

export function AgentDashboard() {
  const agent = useSelectedAgent();
  const navigate = useNavigate();
  const status = useAgentLiveStatus(agent?.id ?? '');
  const threads = useAgentThreads(agent?.id ?? null);
  const agents = useWorkspaceAgents(agent?.workspaceId ?? null);
  const sorted = [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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

  const handleDeleteThread = (thread: Thread) => {
    if (!agent) {
      return;
    }
    const workspaceId = agent.workspaceId;
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
          const next = useThreadStore.getState().latestForAgent(thread.agentId)?.id ?? null;
          if (next) {
            setActiveThreadId(thread.agentId, next);
          } else {
            clearActiveThreadId(thread.agentId);
          }
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
      <CategoryLandingDescription>{agent.instructions || agent.role}</CategoryLandingDescription>
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
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="min-w-0">
          <SectionHeader
            label={`Chats · ${chats.length}`}
            action={
              <Button
                variant="ghost"
                size="icon-xs"
                title="New thread"
                aria-label="New thread"
                onClick={handleNewThread}
              >
                <PlusIcon />
                <span className="sr-only">New thread</span>
              </Button>
            }
          />
          {chats.length === 0 ? (
            <p className="text-muted-foreground text-sm">No chats yet.</p>
          ) : (
            <div className="max-h-[416px] overflow-y-auto pr-1">
              <CategoryLandingList>
                {chats.map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    onOpen={() => openThread(thread.id)}
                    onDelete={() => handleDeleteThread(thread)}
                  />
                ))}
              </CategoryLandingList>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <SectionHeader
            label={`Automations · ${automations.length}`}
            action={
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
                  <PlusIcon />
                  <span className="sr-only">New automation</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={handleNewScheduler}>
                      <CalendarClockIcon />
                      New scheduler
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleNewWebhook}>
                      <WebhookIcon />
                      New webhook
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
          {automations.length === 0 ? (
            <p className="text-muted-foreground text-sm">No automations yet.</p>
          ) : (
            <div className="max-h-[416px] overflow-y-auto pr-1">
              <CategoryLandingList>
                {automations.map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    onOpen={() => openThread(thread.id)}
                    onDelete={() => handleDeleteThread(thread)}
                  />
                ))}
              </CategoryLandingList>
            </div>
          )}
        </div>
      </div>
    </CategoryLanding>
  );
}

function SectionHeader({ label, action }: { label: string; action: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
        {label}
      </p>
      {action}
    </div>
  );
}

function ThreadRow({
  thread,
  onOpen,
  onDelete,
}: {
  thread: Thread;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const running = useSessionStore((state) => Boolean(state.activeRuns[thread.id]));
  const waiting = useThreadWaiting(thread.id);
  let runState: 'running' | 'waiting' | null = null;
  if (running) {
    runState = 'running';
  } else if (waiting) {
    runState = 'waiting';
  }
  const parts: string[] = [];
  if (runState) {
    parts.push(runState);
  }
  if (thread.unread) {
    parts.push('unread');
  }
  let status: ReactNode = null;
  if (parts.length > 0) {
    const tone = runState === 'waiting' ? 'text-live/70' : 'text-live';
    status = <span className={tone}>{parts.join(' · ')}</span>;
  }
  return (
    <li className="group/row relative">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 rounded-lg border border-transparent py-2 pr-9 pl-2 text-left transition-colors hover:border-border/70 hover:bg-background/60 focus-visible:border-live/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/15"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground [&_svg]:size-3.5">
          {thread.kind === 'schedule' ? <CalendarClockIcon /> : <MessageSquareIcon />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm leading-4">{thread.title}</span>
          <span className="block truncate font-mono text-[11px] text-muted-foreground leading-4">
            {formatDayTime(thread.updatedAt)}
          </span>
        </span>
        {status ? (
          <span className="shrink-0 font-mono text-[10px] leading-none">{status}</span>
        ) : null}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-1 right-1 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 data-open:opacity-100"
            />
          }
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontalIcon />
          <span className="sr-only">Thread actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
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
