import { useEffect, useLayoutEffect, useRef } from 'react';
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
import { isCompactRun, splitRuns } from '../model/run-groups';
import { useSyncedThread } from '../model/thread-sync';
import { FailedMessageView } from './agent-turn';
import { ChatSkeleton } from './chat-skeleton';
import { CompactionPendingCard } from './compaction-card';
import { RunTurn } from './run-turn';
import { ThreadEmpty } from './thread-empty';

const EMPTY_FAILURES: RunFailure[] = [];

export function ThreadPanel({ threadId, agent }: { threadId: string; agent: Agent }) {
  const events = useThreadEvents(threadId);
  const streaming = useSessionStore((state) => Boolean(state.activeRuns[threadId]));
  const compacting = useCompactingStore((state) => Boolean(state.byThread[threadId]));
  const synced = useSyncedThread(threadId, agent.workspaceId);
  const failures = useSessionStore(
    useShallow((state) => {
      const next = state.failures.filter((item) => item.threadId === threadId);
      return next.length === 0 ? EMPTY_FAILURES : next;
    }),
  );

  if (!synced && events.length === 0 && !streaming && !compacting) {
    return <ChatSkeleton />;
  }

  if (events.length === 0 && !streaming && !compacting) {
    return (
      <>
        <EmptyThreadReadSync threadId={threadId} />
        <ThreadEmpty agent={agent} threadId={threadId} />
      </>
    );
  }

  const runs = splitRuns(events);
  const compactLive = compacting && runs.some(isCompactRun);

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 text-[length:var(--chat-font-size)]">
            {runs.map((run, index) => {
              const last = index === runs.length - 1;
              const runStreaming =
                (streaming && last && !compacting) || (compacting && last && isCompactRun(run));
              const runKey = run.id ?? `run-${index}`;
              return (
                <MessageScrollerItem key={runKey} messageId={runKey}>
                  <RunTurn
                    events={run.events}
                    runId={run.id ?? ''}
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
    if (end) {
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
