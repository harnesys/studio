import type { SessionEvent } from '@studio/shared';
import { useEffect, useState } from 'react';
import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { getThread } from '@/shared/api';
import { trace } from '@/shared/lib/trace';

import {
  createRunStreamClient,
  type RunStreamClient,
  type RunStreamClientDeps,
  type RunStreamState,
} from './run-stream-client';

const clientsByThread = new Map<string, RunStreamClient>();

/** Per-thread RunStreamClient registry. One client per thread for the whole session. */
export function getClient(threadId: string): RunStreamClient {
  const existing = clientsByThread.get(threadId);
  if (existing) {
    return existing;
  }
  const client = createRunStreamClient({
    threadId,
    store: useSessionStore.getState(),
    onEvent: (event) => onStreamEvent(threadId, event),
    onTerminal: (runId) => void onRunTerminal(threadId, runId),
  } satisfies RunStreamClientDeps);
  clientsByThread.set(threadId, client);
  return client;
}

/** Restores the streaming flag if needed, then connects the client (idempotent per runId). */
export function connectThreadRun(threadId: string, runId: string): void {
  const store = useSessionStore.getState();
  if (store.activeRuns[threadId]) {
    store.setRunId(threadId, runId);
  } else {
    store.startRun(threadId, new AbortController(), runId);
  }
  getClient(threadId).connect(runId);
}

export function useRunStreamState(threadId: string | null): RunStreamState | null {
  const [state, setState] = useState<RunStreamState | null>(null);
  useEffect(() => {
    if (!threadId) {
      setState(null);
      return;
    }
    const client = getClient(threadId);
    setState(client.getState());
    return client.onTransition(setState);
  }, [threadId]);
  return state;
}

export function maybeMarkUnread(threadId: string): void {
  if (useThreadStore.getState().isViewingAtEnd(threadId)) {
    return;
  }
  useThreadStore.getState().markUnread(threadId);
}

function onStreamEvent(threadId: string, event: SessionEvent): void {
  const store = useSessionStore.getState();
  store.appendEvent(threadId, event);
  maybeMarkUnread(threadId);
  if (event.type === 'error') {
    store.setFailure({
      id: `failed-${threadId}-${Date.now()}`,
      threadId,
      text: event.message,
    });
  }
}

async function onRunTerminal(threadId: string, runId: string): Promise<void> {
  const store = useSessionStore.getState();
  if (runId) {
    store.finishRun(threadId, runId);
  }
  try {
    const record = await getThread(threadId);
    useThreadStore.getState().upsert(toClientThread(record));
    useSessionStore.getState().reconcileEvents(threadId, record.events);
    noteUnreadAfterReconcile(threadId, record.unread);
  } catch (error) {
    trace('client', 'terminal reconcile failed', error instanceof Error ? error.message : error);
  }
}

function noteUnreadAfterReconcile(threadId: string, serverUnread: boolean): void {
  if (useThreadStore.getState().isViewingAtEnd(threadId)) {
    useThreadStore.getState().markRead(threadId);
    return;
  }
  if (serverUnread) {
    useThreadStore.getState().markUnread(threadId);
  }
}
