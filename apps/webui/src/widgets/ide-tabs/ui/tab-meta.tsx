import { useQuery } from '@tanstack/react-query';
import {
  CalendarClockIcon,
  EarthIcon,
  FileDiffIcon,
  FileIcon,
  MessageSquareIcon,
  SquareTerminalIcon,
  WorkflowIcon,
} from 'lucide-react';
import { agentColorTintClass, useAgentStore } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import type { IdeTab } from '@/features/ide';
import { listTerminals, terminalsQueryKey } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import { FileTypeIcon } from '@/shared/ui/file-type-icon';

/** Reactive: re-renders when the thread or agent behind the tab hydrates. */
export function TabIcon({ tab }: { tab: IdeTab }) {
  if (tab.kind === 'file' && tab.path) {
    return <FileTypeIcon name={tab.path} className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'thread' && tab.threadId) {
    return <ThreadTabIcon threadId={tab.threadId} />;
  }
  if (tab.kind === 'spawn') {
    return <WorkflowIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'diff') {
    return <FileDiffIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'schedule') {
    return <CalendarClockIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'webhook') {
    return <EarthIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'terminal') {
    return <SquareTerminalIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  return <FileIcon className="size-3.5 shrink-0 opacity-70" />;
}

function ThreadTabIcon({ threadId }: { threadId: string }) {
  const thread = useThreadStore((state) => state.items.find((item) => item.id === threadId));
  const agent = useAgentStore((state) =>
    thread ? state.items.find((item) => item.id === thread.agentId) : undefined,
  );
  const kind = thread?.kind ?? 'chat';
  if (kind === 'schedule') {
    return <CalendarClockIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (kind === 'webhook') {
    return <EarthIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (agent) {
    return (
      <span
        title={agent.name}
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full font-medium text-[8px] leading-none',
          agentColorTintClass(agent.color),
        )}
      >
        {agent.initials.slice(0, 2)}
      </span>
    );
  }
  return <MessageSquareIcon className="size-3.5 shrink-0 opacity-70" />;
}

/** Reactive: file tabs resolve locally, thread tabs follow the thread store. */
export function useTabLabel(tab: IdeTab): string {
  const title = useThreadStore((state) =>
    (tab.kind === 'thread' || tab.kind === 'schedule' || tab.kind === 'webhook') && tab.threadId
      ? (state.items.find((item) => item.id === tab.threadId)?.title ?? null)
      : null,
  );
  const agent = useAgentStore((state) =>
    tab.kind === 'spawn' && tab.agentId ? (state.byId(tab.agentId) ?? undefined) : undefined,
  );
  const terminalsQuery = useQuery({
    queryKey: terminalsQueryKey(tab.workspaceId),
    queryFn: () => listTerminals(tab.workspaceId),
    enabled: tab.kind === 'terminal' && Boolean(tab.terminalSessionId),
    staleTime: 5_000,
  });
  if (tab.kind === 'file' && tab.path) {
    const parts = tab.path.split('/');
    return parts[parts.length - 1] || tab.path;
  }
  if (tab.kind === 'diff' && tab.path) {
    const parts = tab.path.split('/');
    return parts[parts.length - 1] || tab.path;
  }
  if (tab.kind === 'thread' || tab.kind === 'schedule' || tab.kind === 'webhook') {
    return title || (tab.kind === 'thread' ? 'Thread' : tab.kind);
  }
  if (tab.kind === 'spawn') {
    return agent?.name ?? 'Spawn';
  }
  if (tab.kind === 'terminal') {
    const session = terminalsQuery.data?.find((item) => item.id === tab.terminalSessionId);
    return session?.title ?? 'Terminal';
  }
  return tab.kind;
}
