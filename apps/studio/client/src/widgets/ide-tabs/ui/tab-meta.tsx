import { CalendarClockIcon, EarthIcon, FileIcon, MessageSquareIcon } from 'lucide-react';
import { useThreadStore } from '@/entities/thread';
import { FileTypeIcon } from '@/shared/ui/file-type-icon';

export function TabIcon({ tab }: { tab: { kind: string; path?: string; threadId?: string } }) {
  if (tab.kind === 'file' && tab.path) {
    return <FileTypeIcon name={tab.path} className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'thread' && tab.threadId) {
    const kind = useThreadStore.getState().byId(tab.threadId)?.kind ?? 'chat';
    if (kind === 'schedule') {
      return <CalendarClockIcon className="size-3.5 shrink-0 opacity-70" />;
    }
    if (kind === 'webhook') {
      return <EarthIcon className="size-3.5 shrink-0 opacity-70" />;
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
