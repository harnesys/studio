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
import { Message, MessageContent, MessageFooter, MessageHeader } from '@/shared/ui/message';
import { toast } from '@/shared/ui/toast';

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
    <Message align="start" className="py-0" data-testid={`schedule-wake-${entry.id}`}>
      <MessageContent className="gap-1.5">
        <MessageHeader className="gap-2 px-0 font-normal text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-live">
            <CalendarClockIcon className="size-3" />
            Schedule
          </span>
          <span className="truncate text-muted-foreground">{title}</span>
          <span className="font-mono text-muted-foreground">{formatClock(entry.createdAt)}</span>
        </MessageHeader>
        <MessageAttachments entry={entry} threadId={threadId} />
        {body ? (
          <div className="max-w-[80%] rounded-xl border border-live/25 bg-[color-mix(in_oklab,var(--live)_8%,transparent)] px-3 py-2 text-sm leading-relaxed">
            <p className="whitespace-pre-wrap">{body}</p>
          </div>
        ) : null}
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
                openThread(workspaceId, agent.id, nextId);
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
        <MessageFooter className="sr-only">{formatClock(entry.createdAt)}</MessageFooter>
      </MessageContent>
    </Message>
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
