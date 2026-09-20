import type { ThreadRecord } from '@harnesys/studio-shared';
import { useEffect, useState } from 'react';
import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { refreshThread, useDeskStore } from '@/features/desk';
import { connectThreadRun } from '@/features/send-message';

const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'cancelled']);
export function useSyncedThread(threadId: string | null, workspaceId: string): boolean {
  const hasEvents = useSessionStore((state) => (threadId ? threadId in state.events : false));
  const hydrated = useDeskStore((state) => state.hydrated[workspaceId] === 'ready');
  const liveRunId = useThreadStore((state) =>
    threadId ? (state.items.find((item) => item.id === threadId)?.activeRunId ?? null) : null,
  );
  const streaming = useSessionStore((state) =>
    threadId ? Boolean(state.activeRuns[threadId]) : false,
  );
  const [fetched, setFetched] = useState(false);
  useEffect(() => {
    setFetched(false);
  }, []);
  useEffect(() => {
    if (!threadId) {
      return;
    }
    if (hasEvents) {
      if (liveRunId && !streaming) {
        void refreshThread(threadId)
          .then(connectLiveRun)
          .catch(() => {});
      }
      return;
    }
    if (!hydrated) {
      return;
    }
    let cancelled = false;
    void refreshThread(threadId)
      .then((record) => {
        if (cancelled) {
          return;
        }
        connectLiveRun(record);
        setFetched(true);
      })
      .catch(() => {
        if (!cancelled) {
          setFetched(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [threadId, hasEvents, hydrated, liveRunId, streaming]);
  return hasEvents || fetched;
}
function connectLiveRun(record: ThreadRecord | null): void {
  if (!record) {
    return;
  }
  const active = record.activeRun;
  if (active && !TERMINAL_RUN_STATUSES.has(active.status)) {
    connectThreadRun(record.id, active.runId);
  }
}
