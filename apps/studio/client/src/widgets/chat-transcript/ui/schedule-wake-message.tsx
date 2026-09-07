import {
  type HumanEntry,
  isScheduledHumanText,
  SCHEDULE_HUMAN_ORIGIN,
  scheduledTaskName,
  visibleScheduledText,
} from '@studio/shared';
import { CalendarClockIcon } from 'lucide-react';

import { useDeskStore, useSelectedAgent, useSelectedThread } from '@/features/desk';
import { deleteTurn } from '@/features/send-message';
import { branchThread } from '@/features/switch-thread';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { formatClock } from '@/shared/lib/format-clock';
import { toast } from '@/shared/ui/toast';

import { FeedNotice, FeedNoticeMetaSep } from './feed-notice';
import { MessageActions } from './message-actions';
import { MessageAttachments } from './message-attachments';

export function isScheduleWake(entry: HumanEntry): boolean {
  return entry.origin === SCHEDULE_HUMAN_ORIGIN || isScheduledHumanText(entry.text);
}

export function ScheduleWakeMessage({ entry, threadId }: { entry: HumanEntry; threadId: string }) {
  const agent = useSelectedAgent();
  const thread = useSelectedThread();
  const { workspaceId } = useStudioLocation();
  const { openThread } = useStudioNavigation();
  const text = entry.text ?? '';
  const title = scheduledTaskName(text) ?? 'Schedule';
  const body = visibleWakeText(text);

  return (
    <div className="flex flex-col gap-1.5" data-testid={`schedule-wake-${entry.id}`}>
      <FeedNotice
        tone="live"
        icon={CalendarClockIcon}
        label="Schedule"
        meta={
          <>
            <span className="truncate">{title}</span>
            <FeedNoticeMetaSep />
            <span className="font-mono">{formatClock(entry.createdAt)}</span>
          </>
        }
      >
        <MessageAttachments entry={entry} threadId={threadId} />
        {body ? <p className="whitespace-pre-wrap text-sm">{body}</p> : null}
      </FeedNotice>
      <MessageActions
        entryId={entry.id}
        align="start"
        onCopy={() => {
          void navigator.clipboard.writeText(body);
          toast.add({ title: 'Copied.' });
        }}
        onBranch={() => {
          if (!agent || !thread || !workspaceId) {
            return;
          }
          void branchThread(entry.id, agent.id, thread.id, workspaceId).then((nextId) => {
            if (nextId) {
              useDeskStore.getState().setFocusedThreadId(nextId);
              openThread(nextId, { kind: 'agent', id: agent.id }, workspaceId);
            }
          });
        }}
        onDelete={() => {
          void deleteTurn(threadId, entry.id).catch((error) => {
            toast.add({
              title: 'Could not delete',
              description: error instanceof Error ? error.message : 'Delete failed',
            });
          });
        }}
      />
    </div>
  );
}

function visibleWakeText(text: string): string {
  const body = visibleScheduledText(text);
  const cut = body.search(/\n\nAttached:\n/);
  if (cut >= 0) {
    return body.slice(0, cut);
  }
  return body.startsWith('Attached:\n') ? '' : body;
}
