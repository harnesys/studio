import type { SessionEvent } from '@studio/shared';
import { AlertCircleIcon } from 'lucide-react';

import { useDeskStore, useSelectedAgent, useSelectedThread } from '@/features/desk';
import { branchThread } from '@/features/switch-thread';
import { attachmentUrl } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { FileChip } from '@/shared/ui/file-chip';
import { Markdown } from '@/shared/ui/markdown';
import { toast } from '@/shared/ui/toast';

import {
  groupSegments,
  segmentKey,
  segmentSpacing,
  type TurnSegment,
} from '../model/turn-segments';
import { ActivityItems } from './activity-items';
import { ActivityRail } from './activity-rail';
import { AskLine } from './ask-line';
import { MessageActions } from './message-actions';
import { ThinkingLine } from './thinking-line';

export function FailedMessageView({ text }: { text: string }) {
  return (
    <div
      data-testid="error-message-view"
      className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-destructive text-sm"
    >
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1 break-words font-mono text-xs leading-relaxed">{text}</div>
    </div>
  );
}

export function SystemMessageView({ text }: { text: string }) {
  if (!text) {
    return null;
  }
  return (
    <div
      data-testid="system-message-view"
      className="rounded-lg border bg-muted/40 px-3.5 py-2.5 text-muted-foreground text-sm"
    >
      <p className="font-mono text-[11px] uppercase tracking-wide">System</p>
      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">{text}</p>
    </div>
  );
}

export function ActivityBlock({
  events,
  last,
  streaming = false,
}: {
  events: SessionEvent[];
  last: boolean;
  streaming?: boolean;
}) {
  const live = last && streaming;

  if (events.length === 0 && live) {
    return (
      <ActivityRail>
        <ThinkingLine text="" live={true} />
      </ActivityRail>
    );
  }

  return <ActivityItems events={events} live={live} />;
}

export function AssistantMessageView({
  events,
  runId,
  streaming = false,
}: {
  events: SessionEvent[];
  runId: string;
  streaming?: boolean;
}) {
  const agent = useSelectedAgent();
  const thread = useSelectedThread();
  const { workspaceId } = useStudioLocation();
  const { openThread } = useStudioNavigation();
  const segments = groupSegments(events);
  const answerText = events
    .filter((ev): ev is SessionEvent & { type: 'text-delta' } => ev.type === 'text-delta')
    .map((ev) => ev.text)
    .filter(Boolean)
    .join('\n\n');
  const hasDone = events.some((ev) => ev.type === 'done');
  const waitingForModel = streaming && !hasDone;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        {segments.map((segment, index) => (
          <div key={segmentKey(segment, index)} className={segmentSpacing(segments, index)}>
            <TurnSegmentView
              segment={segment}
              live={streaming && index === segments.length - 1 && !waitingForModel}
              runId={runId}
            />
          </div>
        ))}
        {waitingForModel ? (
          <div className={segments.length > 0 ? 'mt-3' : undefined}>
            <ActivityRail>
              <ThinkingLine text="" live={true} />
            </ActivityRail>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        {answerText ? (
          <MessageActions
            entryId={runId}
            onCopy={() => {
              void navigator.clipboard.writeText(answerText);
              toast.add({ title: 'Copied.' });
            }}
            onBranch={() => {
              if (!agent || !thread || !workspaceId) {
                return;
              }
              void branchThread(runId, agent.id, thread.id, workspaceId).then((nextId) => {
                if (nextId) {
                  useDeskStore.getState().setFocusedThreadId(nextId);
                  openThread(workspaceId, agent.id, nextId);
                }
              });
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function TurnSegmentView({
  segment,
  live,
  runId,
}: {
  segment: TurnSegment;
  live: boolean;
  runId: string;
}) {
  if (segment.type === 'user') {
    const thread = useSelectedThread();
    const tid = thread?.id ?? '';
    const atts = segment.event.attachments;
    return (
      <div className="flex flex-col items-end gap-2 py-1">
        {atts?.length ? (
          <div className="flex max-w-[80%] flex-wrap justify-end gap-2">
            {atts.map((item) => (
              <AttachmentPreview key={item.id} threadId={tid} item={item} />
            ))}
          </div>
        ) : null}
        {segment.event.text ? (
          <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-muted px-3 py-1.5 text-sm">
            {segment.event.text}
          </div>
        ) : null}
      </div>
    );
  }
  if (segment.type === 'activity') {
    return <ActivityItems events={segment.events} live={live} runId={runId} />;
  }

  if (segment.type === 'ask') {
    return <AskLine event={segment.event} runId={runId} live={live} />;
  }

  return (
    <div className="flex flex-col gap-1">
      {segment.event.text ? <Markdown text={segment.event.text} /> : null}
    </div>
  );
}

function AttachmentPreview({
  threadId,
  item,
}: {
  threadId: string;
  item: { id: string; kind: string; name: string; mediaType: string; path: string };
}) {
  const src = attachmentUrl(threadId, item.id);
  if (item.kind === 'audio') {
    return (
      <audio controls src={src} className="h-9 max-w-64">
        <track kind="captions" />
      </audio>
    );
  }
  if (item.kind === 'video') {
    return (
      <video controls src={src} className="max-h-48 max-w-64 rounded-xl">
        <track kind="captions" />
      </video>
    );
  }
  return (
    <FileChip
      name={item.name}
      mediaType={item.mediaType ?? ''}
      href={src}
      previewUrl={item.kind === 'image' ? src : undefined}
    />
  );
}
