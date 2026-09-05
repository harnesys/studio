import {
  CalendarClockIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  SettingsIcon,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { type AgentStatus, statusLabel } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { setActiveThreadId, type Thread } from '@/entities/thread';
import {
  useAgentLiveStatus,
  useAgentThreads,
  useDeskStore,
  useSelectedAgent,
  useThreadWaiting,
} from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { openEditAgentDialog, updateAgent } from '@/features/manage-agent';
import { openNewThread } from '@/features/switch-thread';
import { studioPath } from '@/shared/config/routes';
import { formatDayTime } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { CategoryLandingList, CategoryLandingListItem } from '@/shared/ui/category-landing';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/shared/ui/sidebar';
import { WorkspaceSidebar } from '@/widgets/workspace-sidebar';

export function AgentLandingPage() {
  const agent = useSelectedAgent();
  const navigate = useNavigate();
  const status = useAgentLiveStatus(agent?.id ?? '');
  const threads = useAgentThreads(agent?.id ?? null);
  const sorted = [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const openThread = (threadId: string) => {
    if (!agent) {
      return;
    }
    useIdeStore.getState().openThread(agent.workspaceId, agent.id, threadId);
    useDeskStore.getState().setFocusedThreadId(threadId);
    setActiveThreadId(agent.id, threadId);
    void navigate(studioPath.workspaceThread(agent.workspaceId, agent.id, threadId));
  };

  return (
    <SidebarProvider
      style={{ '--sidebar-width': '15rem' } as CSSProperties}
      className="h-svh overflow-hidden"
    >
      <WorkspaceSidebar />
      <SidebarInset className="min-w-0 bg-background">
        <div className="flex h-11 shrink-0 items-center gap-2 px-3">
          <SidebarTrigger />
        </div>
        {!agent ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <p className="text-muted-foreground text-sm">Agent not found.</p>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 pb-3">
              <div className="min-w-0">
                <h1 className="truncate font-medium text-base leading-5">{agent.name}</h1>
                <div className="mt-0.5 flex items-baseline gap-2">
                  {agent.role ? (
                    <p className="min-w-0 truncate text-[11px] text-muted-foreground leading-4">
                      {agent.role}
                    </p>
                  ) : null}
                  <span
                    className={cn('shrink-0 font-mono text-[10px] leading-4', statusInk(status))}
                  >
                    {statusLabel(status)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void openNewThread(agent.id, agent.workspaceId).then((threadId) => {
                      if (threadId) {
                        openThread(threadId);
                      }
                    });
                  }}
                >
                  <MessageSquarePlusIcon />
                  New thread
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void openEditAgentDialog(agent).then((draft) => {
                      if (draft) {
                        void updateAgent(agent.workspaceId, agent.id, draft);
                      }
                    });
                  }}
                >
                  <SettingsIcon />
                  Settings
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {sorted.length === 0 ? (
                <p className="px-2 text-muted-foreground text-sm">No threads yet.</p>
              ) : (
                <CategoryLandingList>
                  {sorted.map((thread) => (
                    <ThreadRow
                      key={thread.id}
                      thread={thread}
                      onOpen={() => openThread(thread.id)}
                    />
                  ))}
                </CategoryLandingList>
              )}
            </div>
          </>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

function ThreadRow({ thread, onOpen }: { thread: Thread; onOpen: () => void }) {
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
    <CategoryLandingListItem
      icon={thread.kind === 'schedule' ? <CalendarClockIcon /> : <MessageSquareIcon />}
      title={thread.title}
      subtitle={formatDayTime(thread.updatedAt)}
      status={status}
      onClick={onOpen}
    />
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
