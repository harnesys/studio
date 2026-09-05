import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import { type RunFailure, useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useCompactingStore } from '@/features/compact-thread';
import { refreshThread, scheduleMarkThreadRead, useThreadEvents } from '@/features/desk';
import { connectThreadRun, retryRun } from '@/features/send-message';
import { getThread } from '@/shared/api';
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
import { splitRuns } from '../model/run-groups';

import { AssistantMessageView, FailedMessageView } from './agent-turn';
import { ChatSkeleton } from './chat-skeleton';
import { CompactionPendingCard } from './compaction-card';
import { ThreadEmpty } from './thread-empty';

const EMPTY_FAILURES: RunFailure[] = [];

export function ThreadPanel({ threadId, agent }: { threadId: string; agent: Agent }) {
  const events = useThreadEvents(threadId);
  const streaming = useSessionStore((state) => Boolean(state.activeRuns[threadId]));
  const compacting = useCompactingStore((state) => Boolean(state.byThread[threadId]));
  const synced = useThreadSync(threadId);
  useFollowLive(threadId);
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
        <ThreadEmpty agent={agent} />
      </>
    );
  }

  const runs = splitRuns(events);

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 text-[length:var(--chat-font-size)]">
            {runs.map((run, index) => (
              <MessageScrollerItem
                key={run.id ?? `run-${index}`}
                messageId={run.id ?? `run-${index}`}
              >
                <div className="group/turn flex flex-col">
                  {run.error ? (
                    <FailedMessageView
                      text={run.error}
                      onRetry={
                        run.runId && index === runs.length - 1 && !streaming
                          ? () => void retryRun(threadId, run.runId ?? '').catch(() => {})
                          : undefined
                      }
                    />
                  ) : null}
                  <AssistantMessageView
                    events={run.events}
                    runId={run.id ?? ''}
                    streaming={streaming && index === runs.length - 1}
                  />
                </div>
              </MessageScrollerItem>
            ))}
            {failures.map((failure) => (
              <MessageScrollerItem key={failure.id} messageId={failure.id}>
                <FailedMessageView text={failure.text} />
              </MessageScrollerItem>
            ))}
            {compacting ? (
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

function useThreadSync(threadId: string): boolean {
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSynced(false);
    void refreshThread(threadId)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setSynced(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  return synced;
}

const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'cancelled']);

/** Restores the live client for a non-terminal active run (e.g. after page load). */
function useFollowLive(threadId: string): void {
  useEffect(() => {
    let cancelled = false;
    void getThread(threadId)
      .then((record) => {
        if (cancelled) {
          return;
        }
        const active = record.activeRun;
        if (active && !TERMINAL_RUN_STATUSES.has(active.status)) {
          connectThreadRun(threadId, active.runId);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [threadId]);
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
