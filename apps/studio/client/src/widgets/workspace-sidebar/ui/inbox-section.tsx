import type { ThreadKind } from '@harnesys/studio-shared';
import { CalendarClockIcon, EarthIcon, MessageSquareIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Agent } from '@/entities/agent';
import { useAgentStore } from '@/entities/agent';
import type { Thread } from '@/entities/thread';
import { useWorkspaces, type Workspace } from '@/entities/workspace';
import { formatDayTime } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { useOpenThread } from '../model/thread-actions';
import { WorkspaceGroupLabel } from './workspace-group';

export function InboxSection({
  workspaceIds,
  threads,
  activeThreadId,
  onSelectDone,
}: {
  workspaceIds: string[];
  threads: Thread[];
  activeThreadId: string | null;
  onSelectDone: () => void;
}) {
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];
  const agents = useAgentStore((state) => state.items);
  const openThread = useOpenThread();

  const groups: { workspace: Workspace; threads: Thread[] }[] = [];
  for (const id of workspaceIds) {
    const workspace = workspaces.find((item) => item.id === id);
    if (!workspace) {
      continue;
    }
    const groupThreads = threads
      .filter((item) => item.workspaceId === id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (groupThreads.length === 0) {
      continue;
    }
    groups.push({ workspace, threads: groupThreads });
  }

  if (groups.length === 0) {
    return (
      <p className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
        No waiting items.
      </p>
    );
  }

  const agentName = (thread: Thread): string => {
    const agent: Agent | undefined = agents.find((item) => item.id === thread.agentId);
    return agent?.name ?? thread.agentId;
  };

  const multi = workspaceIds.length > 1;

  return (
    <div className="flex flex-col gap-0.5 pb-1">
      {groups.map((group) => (
        <div key={group.workspace.id}>
          <WorkspaceGroupLabel
            name={group.workspace.name}
            count={group.threads.length}
            visible={multi}
          />
          {group.threads.map((thread) => (
            <InboxRow
              key={thread.id}
              thread={thread}
              agentName={agentName(thread)}
              selected={activeThreadId === thread.id}
              onSelect={() => {
                openThread(thread);
                onSelectDone();
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function InboxRow({
  thread,
  agentName,
  selected,
  onSelect,
}: {
  thread: Thread;
  agentName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        'group/inbox relative flex items-start rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
        'group-data-[collapsible=icon]:justify-center',
      )}
      data-testid={`inbox-thread-${thread.id}`}
      data-selected={selected ? 'true' : 'false'}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-left group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
              onClick={onSelect}
            />
          }
        >
          <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground group-data-[collapsible=icon]:mt-0">
            {threadIcon(thread.kind)}
          </span>
          <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="block truncate pr-4 text-sm leading-4">{thread.title}</span>
            <span className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground leading-4">
                {agentName} · {formatDayTime(thread.updatedAt)}
              </span>
              <span className="shrink-0 font-mono text-[8px] text-live/70">waiting</span>
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">{thread.title}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function threadIcon(kind: ThreadKind): ReactNode {
  if (kind === 'schedule') {
    return <CalendarClockIcon className="size-3.5" />;
  }
  if (kind === 'webhook') {
    return <EarthIcon className="size-3.5" />;
  }
  return <MessageSquareIcon className="size-3.5" />;
}
