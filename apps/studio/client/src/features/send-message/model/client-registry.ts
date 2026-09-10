import type { SessionEvent } from '@harnesys/studio-shared';
import { useEffect, useState } from 'react';
import { useAgentStore } from '@/entities/agent';
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

export type { RunStreamClient };

/** Per-(threadId, runId) registry: root run and every running spawn get their own client. */
const clientsByRun = new Map<string, RunStreamClient>();

function registryKey(threadId: string, runId: string): string {
  return `${threadId}:${runId}`;
}

export function getClientForRun(
  threadId: string,
  runId: string,
  rootRun: boolean,
): RunStreamClient {
  const key = registryKey(threadId, runId);
  const existing = clientsByRun.get(key);
  if (existing) {
    return existing;
  }
  const client = createRunStreamClient({
    threadId,
    runId,
    rootRun,
    store: useSessionStore.getState(),
    onEvent: (event) => onStreamEvent(threadId, event),
    onTerminal: () => {
      clientsByRun.delete(key);
      void onRunTerminal(threadId, runId, rootRun);
    },
    onStop: () => clientsByRun.delete(key),
  } satisfies RunStreamClientDeps);
  clientsByRun.set(key, client);
  return client;
}

/** Root-run semantics: flips thread-level run bookkeeping, then connects. */
export function connectThreadRun(threadId: string, runId: string): void {
  const store = useSessionStore.getState();
  if (store.activeRuns[threadId]) {
    store.setRunId(threadId, runId);
  } else {
    store.startRun(threadId, new AbortController(), runId);
  }
  getClientForRun(threadId, runId, true).connect();
}

/** Spawn-safe: connects a run stream without touching thread-level run bookkeeping. */
export function connectRunStream(threadId: string, runId: string): void {
  getClientForRun(threadId, runId, false).connect();
}

export function useRunStreamState(threadId: string | null): RunStreamState | null {
  const runId = useSessionStore((state) =>
    threadId ? state.activeRuns[threadId]?.runId || null : null,
  );
  const [state, setState] = useState<RunStreamState | null>(null);
  useEffect(() => {
    if (!threadId || !runId) {
      setState(null);
      return;
    }
    const client = getClientForRun(threadId, runId, true);
    setState(client.getState());
    return client.onTransition(setState);
  }, [threadId, runId]);
  return state;
}

export function useRunStreamStateFor(
  runId: string | null,
  threadId: string | null,
): RunStreamState | null {
  const [state, setState] = useState<RunStreamState | null>(null);
  useEffect(() => {
    if (!runId || !threadId) {
      setState(null);
      return;
    }
    const client = getClientForRun(threadId, runId, false);
    setState(client.getState());
    return client.onTransition(setState);
  }, [threadId, runId]);
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
  if (event.type === 'agent.handoff' && event.agentId) {
    patchThreadCurrentAgent(threadId, event.agentId);
  }
  if (event.type === 'error') {
    store.setFailure({
      id: `failed-${threadId}-${Date.now()}`,
      threadId,
      text: event.message,
    });
  }
}

/** Live handoff: update current speaker before desk SSE arrives (tab/URL follow via ide-sync). */
function patchThreadCurrentAgent(threadId: string, agentId: string): void {
  const thread = useThreadStore.getState().byId(threadId);
  if (!thread || thread.agentId === agentId) {
    return;
  }
  const agent = useAgentStore.getState().byId(agentId);
  if (agent?.parentId) {
    return;
  }
  useThreadStore.getState().upsert({ ...thread, agentId });
}

async function onRunTerminal(threadId: string, runId: string, rootRun: boolean): Promise<void> {
  const store = useSessionStore.getState();
  if (rootRun && runId) {
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
