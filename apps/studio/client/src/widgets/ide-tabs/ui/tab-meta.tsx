import { CalendarClockIcon, EarthIcon, FileIcon, MessageSquareIcon } from 'lucide-react';
import { useAgentStore } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import { FileTypeIcon } from '@/shared/ui/file-type-icon';

export function TabIcon({ tab }: { tab: { kind: string; path?: string; threadId?: string } }) {
  if (tab.kind === 'file' && tab.path) {
    return <FileTypeIcon name={tab.path} className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'thread' && tab.threadId) {
    const thread = useThreadStore.getState().byId(tab.threadId);
    const kind = thread?.kind ?? 'chat';
    if (kind === 'schedule') {
      return <CalendarClockIcon className="size-3.5 shrink-0 opacity-70" />;
    }
    if (kind === 'webhook') {
      return <EarthIcon className="size-3.5 shrink-0 opacity-70" />;
    }
    const agent = thread ? useAgentStore.getState().byId(thread.agentId) : undefined;
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
  return <FileIcon className="size-3.5 shrink-0 opacity-70" />;
}

export function tabLabel(tab: { kind: string; path?: string; threadId?: string }): string {
  if (tab.kind === 'file' && tab.path) {
    const parts = tab.path.split('/');
    return parts[parts.length - 1] || tab.path;
  }
  if (tab.kind === 'thread' && tab.threadId) {
    return useThreadStore.getState().byId(tab.threadId)?.title || 'Thread';
  }
  return tab.kind;
}
