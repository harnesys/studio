import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import { type RunFailure, useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useCompactingStore } from '@/features/compact-thread';
import { scheduleMarkThreadRead, useThreadEvents } from '@/features/desk';
import { useOpenSpawnTab } from '@/features/ide';
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
import { extractSpawns } from '../model/spawn-groups';
import { useSyncedThread } from '../model/thread-sync';
import { FailedMessageView } from './agent-turn';
import type { BranchChild } from './branch-point-badge';
import { ChatSkeleton } from './chat-skeleton';
import { CompactionPendingCard } from './compaction-card';
import { ForkSeparator } from './fork-separator';
import { RunTurn } from './run-turn';
import { ThreadEmpty } from './thread-empty';

const EMPTY_FAILURES: RunFailure[] = [];
const EMPTY_BRANCH_CHILDREN: Record<string, BranchChild[]> = {};

export function ThreadPanel({ threadId, agent }: { threadId: string; agent: Agent }) {
  const events = useThreadEvents(threadId);
  const thread = useThreadStore((state) => state.byId(threadId));
  const parent = useThreadStore((state) =>
    thread?.parentThreadId ? state.byId(thread.parentThreadId) : undefined,
  );
  const openSpawnTab = useOpenSpawnTab();
  const onOpenSpawn = useCallback(
    (spawnId: string) => openSpawnTab(agent.workspaceId, agent.id, threadId, spawnId),
    [openSpawnTab, agent.workspaceId, agent.id, threadId],
  );
  const inheritedCount = thread?.inheritedEventCount ?? 0;
  const seenAt = useSessionStore((state) => state.seenAt[threadId]);
  const inheritedEvents = inheritedCount > 0 ? events.slice(0, inheritedCount) : [];
  const ownEvents = inheritedCount > 0 ? events.slice(inheritedCount) : events;
  const inherited = extractSpawns(inheritedEvents, seenAt);
  const own = extractSpawns(ownEvents, seenAt);
  const inheritedRuns = splitRuns(inherited.feedEvents);
  const inheritedSpawns = inherited.spawns;
  const ownRuns = splitRuns(own.feedEvents);
  const ownSpawns = own.spawns;
  const streaming = useSessionStore((state) => Boolean(state.activeRuns[threadId]));
  const branchChildrenByRun = useThreadStore(
    useShallow((state) => {
      const children = state.items.filter((item) => item.parentThreadId === threadId);
      if (children.length === 0) {
        return EMPTY_BRANCH_CHILDREN;
      }
      const grouped: Record<string, BranchChild[]> = {};
      for (const child of children) {
        if (!child.forkAt) {
          continue;
        }
        const group = grouped[child.forkAt];
        if (group) {
          group.push({ id: child.id, agentId: child.agentId, title: child.title });
        } else {
          grouped[child.forkAt] = [{ id: child.id, agentId: child.agentId, title: child.title }];
        }
      }
      return grouped;
    }),
  );
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

  const compactLive = compacting && ownRuns.some(isCompactRun);
  const showFork = Boolean(thread?.parentThreadId) && inheritedRuns.length > 0;

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 text-[length:var(--chat-font-size)]">
            {inheritedRuns.map((run, index) => {
              const runKey = `inherited-${run.id ?? `run-${index}`}`;
              const forkAt = run.runId ?? run.id ?? '';
              return (
                <MessageScrollerItem key={runKey} messageId={runKey}>
                  <div className="pointer-events-none select-none opacity-60" aria-hidden>
                    <RunTurn
                      events={run.events}
                      runId={forkAt}
                      threadId={threadId}
                      spawns={inheritedSpawns}
                      onOpenSpawn={onOpenSpawn}
                      streaming={false}
                      error={run.error}
                      inherited
                      branchChildren={branchChildrenByRun[forkAt]}
                    />
                  </div>
                </MessageScrollerItem>
              );
            })}
            {showFork && parent ? (
              <MessageScrollerItem messageId="fork-separator">
                <ForkSeparator parentThreadId={parent.id} parentAgentId={parent.agentId} />
              </MessageScrollerItem>
            ) : null}
            {ownRuns.map((run, index) => {
              const last = index === ownRuns.length - 1;
              const runStreaming =
                (streaming && last && !compacting) || (compacting && last && isCompactRun(run));
              const runKey = run.id ?? `run-${index}`;
              const forkAt = run.runId ?? run.id ?? '';
              return (
                <MessageScrollerItem key={runKey} messageId={runKey}>
                  <RunTurn
                    events={run.events}
                    runId={forkAt}
                    threadId={threadId}
                    spawns={ownSpawns}
                    onOpenSpawn={onOpenSpawn}
                    streaming={runStreaming}
                    error={run.error}
                    branchChildren={branchChildrenByRun[forkAt]}
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
