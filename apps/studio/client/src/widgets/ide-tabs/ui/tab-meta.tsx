import { CalendarClockIcon, EarthIcon, FileIcon, MessageSquareIcon } from 'lucide-react';
import { useAgentStore } from '@/entities/agent';
import { useScheduleStore } from '@/entities/schedule';
import { useThreadStore } from '@/entities/thread';
import { useWebhookStore } from '@/entities/webhook';
import { FileTypeIcon } from '@/shared/ui/file-type-icon';

export function TabIcon({ tab }: { tab: { kind: string; path?: string } }) {
  if (tab.kind === 'thread') {
    return <MessageSquareIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'schedule') {
    return <CalendarClockIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'webhook') {
    return <EarthIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'file' && tab.path) {
    return <FileTypeIcon name={tab.path} className="size-3.5 shrink-0 opacity-70" />;
  }
  return <FileIcon className="size-3.5 shrink-0 opacity-70" />;
}

export function tabLabel(tab: {
  kind: string;
  path?: string;
  threadId?: string;
  scheduleId?: string;
  webhookId?: string;
  agentId?: string;
}): string {
  if (tab.kind === 'file' && tab.path) {
    const parts = tab.path.split('/');
    return parts[parts.length - 1] || tab.path;
  }
  if (tab.kind === 'thread' && tab.threadId) {
    const t = useThreadStore.getState().byId(tab.threadId);
    if (t) {
      return t.title || 'Thread';
    }
    return 'Thread';
  }
  if (tab.kind === 'schedule' && tab.scheduleId) {
    const s = useScheduleStore.getState().items.find((x) => x.id === tab.scheduleId);
    if (s) {
      return s.name;
    }
    return 'Schedule';
  }
  if (tab.kind === 'webhook' && tab.webhookId) {
    const w = useWebhookStore.getState().items.find((x) => x.id === tab.webhookId);
    if (w) {
      return w.name;
    }
    return 'Webhook';
  }
  if (tab.kind === 'thread' && tab.agentId) {
    const a = useAgentStore.getState().items.find((x) => x.id === tab.agentId);
    if (a) {
      return a.name;
    }
  }
  return tab.kind;
}
