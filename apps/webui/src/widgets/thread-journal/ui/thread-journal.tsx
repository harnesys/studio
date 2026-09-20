import type { SessionEvent } from '@harnesys/studio-shared';
import { type ReactNode, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import { isCompactRun, type RunFailure, useSessionStore, useThreadFeed } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useCompactingStore } from '@/features/compact-thread';
import { scheduleMarkThreadRead, useThreadEvents } from '@/features/desk';
import { retryRun } from '@/features/send-message';
import { prefersReducedMotion } from '@/shared/lib/motion';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScrollerScrollable,
} from '@/shared/ui/message-scroller';
import {
  ChatSkeleton,
  CompactionPendingCard,
  FailedMessageView,
  RunTurn,
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
  const feed = useThreadFeed(threadId);
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
    const runs = feed?.runs ?? [];
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
                  <MessageScrollerItem key={run.key} messageId={run.key}>
                    <RunDivider
                      index={index}
                      task={runTask(run.events)}
                      failed={run.error !== null}
                      running={runStreaming}
                    />
                    <RunTurn
                      run={run}
                      runId={run.runId ?? run.id ?? ''}
                      threadId={threadId}
                      streaming={runStreaming}
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
          <MessageScrollerButton behavior={prefersReducedMotion() ? 'auto' : 'smooth'} />
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
function ThreadReadSync({ threadId }: { threadId: string }) {
  const { end } = useMessageScrollerScrollable();
  const contentEpoch = useSessionStore((state) => state.contentEpoch[threadId] ?? 0);
  const viewingAtEnd = !end;
  useEffect(() => {
    useThreadStore.getState().setViewingAtEnd(threadId, viewingAtEnd);
    if (viewingAtEnd && contentEpoch >= 0) {
      scheduleMarkThreadRead(threadId);
    }
  }, [threadId, viewingAtEnd, contentEpoch]);
  useEffect(() => {
    return () => {
      useThreadStore.getState().setViewingAtEnd(threadId, false);
    };
  }, [threadId]);
  return null;
}
