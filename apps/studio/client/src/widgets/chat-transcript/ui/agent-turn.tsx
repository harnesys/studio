import type { SessionEvent } from '@studio/shared';
import { isScheduledHumanText, scheduledTaskName, visibleScheduledText } from '@studio/shared';
import { AlertCircleIcon, CalendarClockIcon, RotateCcwIcon } from 'lucide-react';

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
import { CompactionMessageCard } from './compaction-card';
import { MessageActions } from './message-actions';
import { ThinkingLine } from './thinking-line';

export function FailedMessageView({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div
      data-testid="error-message-view"
      className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-destructive text-sm"
    >
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1 break-words font-mono text-xs leading-relaxed">{text}</div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          title="Retry run"
          className="flex shrink-0 items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-destructive text-xs transition-colors hover:bg-destructive/10"
        >
          <RotateCcwIcon className="size-3" />
          Retry
        </button>
      ) : null}
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
      <ActivityRail live={true}>
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
  const textBlocks = segments.filter(
    (segment): segment is Extract<TurnSegment, { type: 'text' | 'compaction' }> =>
      segment.type === 'text' || segment.type === 'compaction',
  );
  const answerText = textBlocks.map((segment) => segment.text).join('\n\n');
  const hasDone = events.some((ev) => ev.type === 'done');
  const hasInFlight = events.some(
    (ev) =>
      (ev.type === 'tool' && (ev.phase === 'streaming' || ev.phase === 'requested')) ||
      ev.type === 'ask',
  );
  const lastSegment = segments[segments.length - 1];
  const lastIsUser = lastSegment?.type === 'user';
  const pendingReply =
    streaming && !hasDone && !hasInFlight && (segments.length === 0 || lastIsUser);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        {segments.map((segment, index) => (
          <div key={segmentKey(segment, index)} className={segmentSpacing(segments, index)}>
            <TurnSegmentView
              segment={segment}
              live={streaming && index === segments.length - 1 && !pendingReply}
              runId={runId}
            />
          </div>
        ))}
        {pendingReply ? (
          <div className={segments.length > 0 ? 'mt-3' : undefined}>
            <ActivityRail live={true}>
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
                  openThread(nextId, { kind: 'agent', id: agent.id }, workspaceId);
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
    const wake = isScheduleWakeEvent(segment.event);
    return (
      <div className="flex flex-col items-end gap-2">
        {wake ? (
          <ScheduleWakeBanner text={segment.event.text ?? ''} />
        ) : (
          <>
            {atts?.length ? (
              <div className="flex max-w-[80%] flex-wrap justify-end gap-2">
                {atts.map((item) => (
                  <AttachmentPreview key={item.id} threadId={tid} item={item} />
                ))}
              </div>
            ) : null}
            {segment.event.text ? (
              <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-secondary px-3.5 py-1.5 text-secondary-foreground shadow-xs">
                {segment.event.text}
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  }
  if (segment.type === 'activity') {
    return <ActivityItems events={segment.events} live={live} runId={runId} />;
  }
  if (segment.type === 'compaction') {
    return <CompactionMessageCard text={segment.text} meta={segment.meta} />;
  }

  return <Markdown text={segment.text} />;
}

function isScheduleWakeEvent(event: SessionEvent & { type: 'user' }): boolean {
  return (
    event.origin === 'schedule' || (event.text !== undefined && isScheduledHumanText(event.text))
  );
}

function ScheduleWakeBanner({ text }: { text: string }) {
  const title = scheduledTaskName(text) ?? 'Schedule';
  const body = visibleScheduledText(text);
  return (
    <div className="max-w-[80%] self-end rounded-2xl rounded-br-md border border-live/25 bg-[color-mix(in_oklab,var(--live)_8%,transparent)] px-3.5 py-2.5 text-sm leading-relaxed">
      <div className="mb-1 flex items-center justify-end gap-1.5 text-[11px] text-live">
        <span className="truncate">{title}</span>
        <span className="shrink-0 text-muted-foreground">·</span>
        <span className="inline-flex shrink-0 items-center gap-1">
          <CalendarClockIcon className="size-3" />
          Schedule
        </span>
      </div>
      {body ? <p className="whitespace-pre-wrap">{body}</p> : null}
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
