import { ArrowDownIcon } from 'lucide-react';
import { Fragment, useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import {
  type FeedRun,
  isCompactRun,
  type RunFailure,
  useSessionStore,
  useThreadFeeds,
} from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useCompactingStore } from '@/features/compact-thread';
import { scheduleMarkThreadRead } from '@/features/desk';
import { useOpenSpawnTab } from '@/features/ide';
import { retryRun } from '@/features/send-message';
import { useChatPreferences } from '@/shared/lib/chat-preferences';
import { prefersReducedMotion } from '@/shared/lib/motion';
import { LiveRunScrollGuard } from '@/shared/ui/live-run-scroll-guard';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScrollerScrollable,
} from '@/shared/ui/message-scroller';
import { useSyncedThread } from '../model/thread-sync';
import { saveViewedCount, useUnseenBoundary } from '../model/unseen-boundary';
import { useUnseenCount } from '../model/use-unseen-count';
import { FailedMessageView } from './agent-turn';
import type { BranchChild } from './branch-point-badge';
import { ChatSkeleton } from './chat-skeleton';
import { CompactionPendingCard } from './compaction-card';
import { ForkSeparator } from './fork-separator';
import { LiveStatusBar } from './live-status-bar';
import { RunTurn } from './run-turn';
import { ThreadEmpty } from './thread-empty';
import { UnseenSeparator } from './unseen-separator';

const EMPTY_FAILURES: RunFailure[] = [];
const EMPTY_RUNS: FeedRun[] = [];
const EMPTY_BRANCH_CHILDREN: Record<string, BranchChild[]> = {};

export function ThreadPanel({
  threadId,
  agent,
  active,
}: {
  threadId: string;
  agent: Agent;
  active: boolean;
}) {
  const feeds = useThreadFeeds(threadId);
  const eventsCount = useSessionStore((state) => state.events[threadId]?.length ?? 0);
  const thread = useThreadStore((state) => (active ? state.byId(threadId) : undefined));
  const parent = useThreadStore((state) => {
    if (!active) {
      return undefined;
    }
    const current = state.byId(threadId);
    return current?.parentThreadId ? state.byId(current.parentThreadId) : undefined;
  });
  const openSpawnTab = useOpenSpawnTab();
  const onOpenSpawn = useCallback(
    (spawnId: string) => openSpawnTab(agent.workspaceId, agent.id, threadId, spawnId),
    [openSpawnTab, agent.workspaceId, agent.id, threadId],
  );
  const streaming = useSessionStore((state) => active && Boolean(state.activeRuns[threadId]));
  const branchChildrenByRun = useThreadStore(
    useShallow((state) => {
      if (!active) {
        return EMPTY_BRANCH_CHILDREN;
      }
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
  const compacting = useCompactingStore((state) => active && Boolean(state.byThread[threadId]));
  const feedFollow = useChatPreferences((state) => state.feedFollow);
  const synced = useSyncedThread(active ? threadId : null, agent.workspaceId);
  const unseenBoundary = useUnseenBoundary(threadId, active, Boolean(thread?.unread), eventsCount);
  const failures = useSessionStore(
    useShallow((state) => {
      if (!active) {
        return EMPTY_FAILURES;
      }
      const next = state.failures.filter((item) => item.threadId === threadId);
      return next.length === 0 ? EMPTY_FAILURES : next;
    }),
  );
  const inheritedCount = thread?.inheritedEventCount ?? 0;
  useEffect(() => {
    if (!active) {
      return;
    }
    useSessionStore.getState().setThreadFeedBoundary(threadId, inheritedCount);
  }, [active, threadId, inheritedCount]);
  const inheritedRuns = feeds?.inherited.runs ?? EMPTY_RUNS;
  const ownRuns = feeds?.own.runs ?? EMPTY_RUNS;
  if (!synced && eventsCount === 0 && !streaming && !compacting) {
    return <ChatSkeleton />;
  }
  if (eventsCount === 0 && !streaming && !compacting) {
    return (
      <>
        <EmptyThreadReadSync threadId={threadId} />
        <ThreadEmpty agent={agent} threadId={threadId} />
      </>
    );
  }
  const compactLive = compacting && ownRuns.some(isCompactRun);
  const showFork = Boolean(thread?.parentThreadId) && inheritedRuns.length > 0;
  const unseenRunIndex =
    unseenBoundary === null ? -1 : ownRuns.findIndex((run) => run.firstIndex >= unseenBoundary);
  const anchorAtUnseen = unseenRunIndex >= 0;
  return (
    <MessageScrollerProvider
      autoScroll={true}
      defaultScrollPosition={feedFollow === 'anchor' ? 'last-anchor' : 'end'}
      scrollPreviousItemPeek={48}
      scrollEdgeThreshold={24}
    >
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 text-[length:var(--chat-font-size)]">
            {inheritedRuns.map((run) => {
              const forkAt = run.runId ?? run.id ?? '';
              return (
                <MessageScrollerItem
                  key={`inherited-${run.key}`}
                  messageId={`inherited-${run.key}`}
                >
                  <div className="pointer-events-none select-none opacity-60" aria-hidden>
                    <RunTurn
                      run={run}
                      runId={forkAt}
                      threadId={threadId}
                      onOpenSpawn={onOpenSpawn}
                      streaming={false}
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
              const forkAt = run.runId ?? run.id ?? '';
              return (
                <Fragment key={run.key}>
                  {index === unseenRunIndex ? (
                    <MessageScrollerItem messageId="unseen-separator" scrollAnchor={anchorAtUnseen}>
                      <UnseenSeparator />
                    </MessageScrollerItem>
                  ) : null}
                  <MessageScrollerItem
                    messageId={run.key}
                    scrollAnchor={
                      !anchorAtUnseen && feedFollow === 'anchor' && run.events[0]?.type === 'user'
                    }
                  >
                    <RunTurn
                      run={run}
                      runId={forkAt}
                      threadId={threadId}
                      onOpenSpawn={onOpenSpawn}
                      streaming={runStreaming}
                      branchChildren={branchChildrenByRun[forkAt]}
                      onRetry={
                        run.runId && last && !streaming && !compacting
                          ? () => void retryRun(threadId, run.runId ?? '').catch(() => {})
                          : undefined
                      }
                    />
                  </MessageScrollerItem>
                </Fragment>
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
            <LiveRunScrollGuard active={streaming || compacting} />
          </MessageScrollerContent>
        </MessageScrollerViewport>
        {active ? <LiveEdgeControls threadId={threadId} /> : null}
        {active && streaming && ownRuns.length > 0 ? (
          <LiveStatusBar threadId={threadId} run={ownRuns[ownRuns.length - 1]} streaming />
        ) : null}
        {active ? <ThreadReadSync threadId={threadId} /> : null}
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
function LiveEdgeControls({ threadId }: { threadId: string }) {
  const { end } = useMessageScrollerScrollable();
  const total = useSessionStore((state) => state.events[threadId]?.length ?? 0);
  const unseen = useUnseenCount(total, !end);
  return (
    <MessageScrollerButton behavior={prefersReducedMotion() ? 'auto' : 'smooth'}>
      <ArrowDownIcon />
      <span className="sr-only">
        {unseen > 0 ? `${unseen} new updates, scroll to end` : 'Scroll to end'}
      </span>
      {unseen > 0 ? (
        <span className="absolute -end-1 -top-1 min-w-4 rounded-full bg-live px-1 font-medium text-[10px] text-white tabular-nums">
          {unseen > 99 ? '99+' : unseen}
        </span>
      ) : null}
    </MessageScrollerButton>
  );
}
function ThreadReadSync({ threadId }: { threadId: string }) {
  const { end } = useMessageScrollerScrollable();
  const contentEpoch = useSessionStore((state) => state.contentEpoch[threadId] ?? 0);
  const viewingAtEnd = !end;
  useEffect(() => {
    useThreadStore.getState().setViewingAtEnd(threadId, viewingAtEnd);
    if (viewingAtEnd && contentEpoch >= 0) {
      scheduleMarkThreadRead(threadId);
      saveViewedCount(threadId, useSessionStore.getState().events[threadId]?.length ?? 0);
    }
  }, [threadId, viewingAtEnd, contentEpoch]);
  useEffect(() => {
    return () => {
      useThreadStore.getState().setViewingAtEnd(threadId, false);
    };
  }, [threadId]);
  return null;
}
