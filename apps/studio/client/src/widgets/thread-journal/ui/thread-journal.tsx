import type { SessionEvent } from '@harnesys/studio-shared';
import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import { type RunFailure, useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useCompactingStore } from '@/features/compact-thread';
import { scheduleMarkThreadRead, useThreadEvents } from '@/features/desk';
import { retryRun } from '@/features/send-message';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerScrollable,
} from '@/shared/ui/message-scroller';
import {
  ChatSkeleton,
  CompactionPendingCard,
  extractMaps,
  extractSpawns,
  FailedMessageView,
  isCompactRun,
  RunTurn,
  splitRuns,
  ThreadEmpty,
  useSyncedThread,
} from '@/widgets/chat-transcript';

import { RunDivider } from './run-divider';

const EMPTY_FAILURES: RunFailure[] = [];

export type TriggerThreadKind = 'schedule' | 'webhook';

export type ThreadJournalProps = {
  threadId: string;
  agent: Agent;
  kind: TriggerThreadKind;
};

export function ThreadJournal({ threadId, agent }: ThreadJournalProps) {
  const events = useThreadEvents(threadId);
  const seenAt = useSessionStore((state) => state.seenAt[threadId]);
  const spawned = extractSpawns(events, seenAt);
  const { feedEvents, maps } = extractMaps(spawned.feedEvents, seenAt, {
    spawnIds: spawned.spawns.map((s) => s.spawnId),
  });
  const spawns = spawned.spawns;
  const streaming = useSessionStore((state) => Boolean(state.activeRuns[threadId]));
  const compacting = useCompactingStore((state) => Boolean(state.byThread[threadId]));
  const synced = useSyncedThread(threadId, agent.workspaceId);
  const failures = useSessionStore(
    useShallow((state) => {
      const next = state.failures.filter((item) => item.threadId === threadId);
      return next.length === 0 ? EMPTY_FAILURES : next;
    }),
  );

  let body: ReactNode;
  if (!synced && events.length === 0 && !streaming && !compacting) {
    body = <ChatSkeleton />;
  } else if (events.length === 0 && !streaming && !compacting) {
    body = (
      <>
        <EmptyThreadReadSync threadId={threadId} />
        <ThreadEmpty agent={agent} threadId={threadId} />
      </>
    );
  } else {
    const runs = splitRuns(feedEvents);
    const compactLive = compacting && runs.some(isCompactRun);
    body = (
      <MessageScrollerProvider autoScroll>
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 text-[length:var(--chat-font-size)]">
              {runs.map((run, index) => {
                const last = index === runs.length - 1;
                const runStreaming =
                  (streaming && last && !compacting) || (compacting && last && isCompactRun(run));
                return (
                  <MessageScrollerItem
                    key={run.id ?? `run-${index}`}
                    messageId={run.id ?? `run-${index}`}
                  >
                    <RunDivider
                      index={index}
                      task={runTask(run.events)}
                      failed={run.error !== null}
                      running={runStreaming}
                    />
                    <RunTurn
                      events={run.events}
                      runId={run.id ?? ''}
                      threadId={threadId}
                      spawns={spawns}
                      maps={maps}
                      streaming={runStreaming}
                      error={run.error}
                      onRetry={
                        run.runId && last && !streaming && !compacting
                          ? () => void retryRun(threadId, run.runId ?? '').catch(() => {})
                          : undefined
                      }
                    />
                  </MessageScrollerItem>
                );
              })}
              {failures.map((failure) => (
                <MessageScrollerItem key={failure.id} messageId={failure.id}>
                  <FailedMessageView text={failure.text} />
                </MessageScrollerItem>
              ))}
              {compacting && !compactLive ? (
                <MessageScrollerItem key="compaction-pending" messageId="compaction-pending">
                  <CompactionPendingCard />
                </MessageScrollerItem>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
          <StickOnSend streaming={streaming || compacting} />
          <ThreadReadSync threadId={threadId} />
        </MessageScroller>
      </MessageScrollerProvider>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="thread-journal">
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  );
}

function runTask(events: SessionEvent[]): string {
  const first = events.find((event) => event.type === 'user');
  return first && first.type === 'user' ? first.text : '';
}

function EmptyThreadReadSync({ threadId }: { threadId: string }) {
  useEffect(() => {
    useThreadStore.getState().setViewingAtEnd(threadId, true);
    scheduleMarkThreadRead(threadId);
    return () => {
      useThreadStore.getState().setViewingAtEnd(threadId, false);
    };
  }, [threadId]);
  return null;
}

/** Track bottom-edge visibility and persist read when stuck to end. */
function ThreadReadSync({ threadId }: { threadId: string }) {
  const { end } = useMessageScrollerScrollable();
  const contentEpoch = useSessionStore((state) => state.contentEpoch[threadId] ?? 0);

  useEffect(() => {
    useThreadStore.getState().setViewingAtEnd(threadId, end);
    // contentEpoch: re-mark when new events arrive while pinned to bottom.
    if (end && contentEpoch >= 0) {
      scheduleMarkThreadRead(threadId);
    }
  }, [threadId, end, contentEpoch]);

  useEffect(() => {
    return () => {
      useThreadStore.getState().setViewingAtEnd(threadId, false);
    };
  }, [threadId]);

  return null;
}

/** Re-pin to the live edge when a run starts. Manual scroll up still detaches. */
function StickOnSend({ streaming }: { streaming: boolean }) {
  const { scrollToEnd } = useMessageScroller();
  const wasStreaming = useRef(false);

  useLayoutEffect(() => {
    if (streaming && !wasStreaming.current) {
      scrollToEnd({ behavior: 'auto' });
    }
    wasStreaming.current = streaming;
  }, [streaming, scrollToEnd]);

  return null;
}
