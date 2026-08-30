import { type HumanEntry, visibleScheduledText } from '@studio/shared';
import { useState } from 'react';

import { useJournalStore } from '@/entities/journal';
import { useDeskStore, useSelectedAgent, useSelectedThread } from '@/features/desk';
import { deleteTurn } from '@/features/send-message';
import { branchThread } from '@/features/switch-thread';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { formatClock } from '@/shared/lib/format-clock';
import { Bubble, BubbleContent } from '@/shared/ui/bubble';
import { Button } from '@/shared/ui/button';
import { Message, MessageContent, MessageFooter, MessageHeader } from '@/shared/ui/message';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';

import { MessageActions } from './message-actions';
import { MessageAttachments } from './message-attachments';

export function UserMessage({ entry, threadId }: { entry: HumanEntry; threadId: string }) {
  const [editing, setEditing] = useState(false);
  const agent = useSelectedAgent();
  const thread = useSelectedThread();
  const { workspaceId } = useStudioLocation();
  const { openThread } = useStudioNavigation();
  const visibleText = visibleMessageText(entry.text ?? '');

  return (
    <Message align="end" className="py-0">
      <MessageContent className="gap-1.5">
        <MessageHeader className="gap-2 px-0 font-normal text-[11px]">
          <span>You</span>
          <span className="font-mono text-muted-foreground">{formatClock(entry.createdAt)}</span>
        </MessageHeader>
        <MessageAttachments entry={entry} threadId={threadId} />
        {editing && (
          <EditDraft
            initial={visibleText}
            onCancel={() => setEditing(false)}
            onSave={(content) => {
              useJournalStore.getState().editHumanText(threadId, entry.id, content);
              setEditing(false);
            }}
          />
        )}
        {!editing && visibleText ? (
          <Bubble variant="muted" align="end" className="max-w-[80%]">
            <BubbleContent className="whitespace-pre-wrap px-3 py-1.5">{visibleText}</BubbleContent>
          </Bubble>
        ) : null}
        <MessageActions
          entryId={entry.id}
          align="end"
          onCopy={() => {
            void navigator.clipboard.writeText(visibleText);
            toast.add({ title: 'Copied.' });
          }}
          onEdit={() => setEditing(true)}
          onBranch={() => {
            if (!agent || !thread || !workspaceId) {
              return;
            }
            const nextId = branchThread(entry.id, agent.id, thread.id);
            if (nextId) {
              useDeskStore.getState().setFocusedThreadId(nextId);
              openThread(workspaceId, agent.id, nextId);
            }
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

function EditDraft({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <div className="flex w-full max-w-xl flex-col gap-2">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="min-h-20"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={value.trim().length === 0} onClick={() => onSave(value)}>
          Save
        </Button>
      </div>
    </div>
  );
}

function visibleMessageText(text: string): string {
  const body = visibleScheduledText(text);
  const cut = body.search(/\n\nAttached:\n/);
  if (cut >= 0) {
    return body.slice(0, cut);
  }
  return body.startsWith('Attached:\n') ? '' : body;
}
