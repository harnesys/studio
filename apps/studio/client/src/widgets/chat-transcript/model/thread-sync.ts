import type { ThreadRecord } from '@harnesys/studio-shared';
import { useEffect, useState } from 'react';
import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { refreshThread, useDeskStore } from '@/features/desk';
import { connectThreadRun } from '@/features/send-message';

const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'cancelled']);

/**
 * Cache-first thread readiness. Events already hydrated render immediately
 * (no skeleton flash on tab switches, no refetch on history open).
 * Fetches only when the store has nothing and hydrate settled; reconnects
 * a live server run known from the last full record.
 */
export function useSyncedThread(threadId: string, workspaceId: string): boolean {
  const hasEvents = useSessionStore((state) => threadId in state.events);
  const hydrated = useDeskStore((state) => state.hydratedWorkspaceId === workspaceId);
  const liveRunId = useThreadStore(
    (state) => state.items.find((item) => item.id === threadId)?.activeRunId ?? null,
  );
  const streaming = useSessionStore((state) => Boolean(state.activeRuns[threadId]));
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    setFetched(false);
  }, [threadId]);

  useEffect(() => {
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
  }, [threadId, workspaceId, hasEvents, hydrated, liveRunId, streaming]);

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
