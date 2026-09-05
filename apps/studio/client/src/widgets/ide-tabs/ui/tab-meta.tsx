import { CalendarClockIcon, EarthIcon, FileIcon, MessageSquareIcon } from 'lucide-react';
import { useAgentStore } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import type { IdeTab } from '@/features/ide';
import { FileTypeIcon } from '@/shared/ui/file-type-icon';

/** Reactive: re-renders when the thread or agent behind the tab hydrates. */
export function TabIcon({ tab }: { tab: IdeTab }) {
  if (tab.kind === 'file' && tab.path) {
    return <FileTypeIcon name={tab.path} className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'thread' && tab.threadId) {
    return <ThreadTabIcon threadId={tab.threadId} />;
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
        className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--live)_12%,transparent)] font-medium text-[8px] text-foreground leading-none"
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
    tab.kind === 'thread' && tab.threadId
      ? (state.items.find((item) => item.id === tab.threadId)?.title ?? null)
      : null,
  );
  if (tab.kind === 'file' && tab.path) {
    const parts = tab.path.split('/');
    return parts[parts.length - 1] || tab.path;
  }
  if (tab.kind === 'thread') {
    return title || 'Thread';
  }
  return tab.kind;
}
