import type { SessionEvent } from '@studio/shared';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import { type RunFailure, useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useCompactingStore } from '@/features/compact-thread';
import { refreshThread, scheduleMarkThreadRead, useThreadEvents } from '@/features/desk';
import { connectThreadRun, retryRun } from '@/features/send-message';
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
  AssistantMessageView,
  ChatSkeleton,
  CompactionPendingCard,
  FailedMessageView,
  splitRuns,
  ThreadEmpty,
} from '@/widgets/chat-transcript';

import { RunDivider } from './run-divider';

const EMPTY_FAILURES: RunFailure[] = [];

export type TriggerThreadKind = 'schedule' | 'webhook';

export type ThreadJournalProps = {
  threadId: string;
  agent: Agent;
  kind: TriggerThreadKind;
};

export function ThreadJournal({ threadId, agent, kind }: ThreadJournalProps) {
  const events = useThreadEvents(threadId);
  const streaming = useSessionStore((state) => Boolean(state.activeRuns[threadId]));
  const compacting = useCompactingStore((state) => Boolean(state.byThread[threadId]));
  const synced = useThreadSync(threadId);
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
        <ThreadEmpty agent={agent} />
      </>
    );
  } else {
    const runs = splitRuns(events);
    body = (
      <MessageScrollerProvider autoScroll>
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 text-[length:var(--chat-font-size)]">
              {runs.map((run, index) => (
                <MessageScrollerItem
                  key={run.id ?? `run-${index}`}
                  messageId={run.id ?? `run-${index}`}
                >
                  <RunDivider
                    index={index}
                    task={runTask(run.events)}
                    failed={run.error !== null}
                    running={streaming && index === runs.length - 1}
                  />
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

function useThreadSync(threadId: string): boolean {
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSynced(false);
    void refreshThread(threadId)
      .then((record) => {
        if (cancelled || !record) {
          return;
        }
        const active = record.activeRun;
        if (active && !TERMINAL_RUN_STATUSES.has(active.status)) {
          connectThreadRun(threadId, active.runId);
        }
      })
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
