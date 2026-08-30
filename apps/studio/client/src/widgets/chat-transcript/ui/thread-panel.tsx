import type { HumanEntry, TranscriptItem } from '@studio/shared';
import { isAgentEntry, toTranscript } from '@studio/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import { type RunFailure, useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useCompactingStore } from '@/features/compact-thread';
import { refreshThread, scheduleMarkThreadRead, useThreadEvents } from '@/features/desk';
import { followLiveThread } from '@/features/send-message';
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
  ActivityBlock,
  AssistantMessageView,
  FailedMessageView,
  SystemMessageView,
} from './agent-turn';
import { ChatSkeleton } from './chat-skeleton';
import { CompactionCard, CompactionPendingCard } from './compaction-card';
import { isScheduleWake, ScheduleWakeMessage } from './schedule-wake-message';
import { ThreadEmpty } from './thread-empty';
import { UserMessage } from './user-message';

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

  const items = toTranscript(events);

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 text-[length:var(--chat-font-size)]">
            {items.map((item, index) => (
              <MessageScrollerItem key={itemKey(item, index)} messageId={itemKey(item, index)}>
                {item.type === 'user' ? (
                  <TranscriptUser entry={item.entry} threadId={threadId} />
                ) : null}
                {item.type === 'system' ? <SystemMessageView entry={item.entry} /> : null}
                {item.type === 'compaction' ? <CompactionCard entry={item.entry} /> : null}
                {item.type === 'activity' ? (
                  <ActivityBlock
                    items={item.items}
                    last={index === items.length - 1}
                    streaming={streaming}
                  />
                ) : null}
                {item.type === 'assistant' ? (
                  <AssistantMessageView
                    entry={item.entry}
                    entries={item.entries}
                    streaming={streaming}
                  />
                ) : null}
                {item.type === 'failed' ? <FailedMessageView text={item.text} /> : null}
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

function useFollowLive(threadId: string): void {
  const liveRunId = useSessionStore((state) => {
    const events = state.events[threadId] ?? [];
    const agent = [...events].reverse().find(isAgentEntry);
    return agent?.status === 'running' ? agent.id : null;
  });

  useEffect(() => {
    if (!liveRunId) {
      return;
    }
    void followLiveThread(threadId);
  }, [threadId, liveRunId]);
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

function TranscriptUser({ entry, threadId }: { entry: HumanEntry; threadId: string }) {
  if (isScheduleWake(entry)) {
    return <ScheduleWakeMessage entry={entry} threadId={threadId} />;
  }
  return <UserMessage entry={entry} threadId={threadId} />;
}

function itemKey(item: TranscriptItem, index: number): string {
  if (
    item.type === 'user' ||
    item.type === 'system' ||
    item.type === 'assistant' ||
    item.type === 'compaction'
  ) {
    return item.entry.id;
  }
  if (item.type === 'failed') {
    return item.id;
  }
  const first = item.items[0];
  if (!first) {
    return `activity-${index}`;
  }
  if (first.type === 'reasoning' || first.type === 'ask') {
    return first.step.id;
  }
  return first.call.id;
}
