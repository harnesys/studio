import type { SessionEvent } from '@studio/shared';
import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { getRunEventsStream, getThread, readSse } from '@/shared/api';
import { trace } from '@/shared/lib/trace';

import { maybeMarkUnread } from './send-message';

export async function drainRunStream(
  threadId: string,
  runId: string,
  controller: AbortController,
): Promise<void> {
  try {
    const response = await getRunEventsStream(runId, 0, controller.signal);
    for await (const frame of readSse(response)) {
      const event = parseSessionEvent(frame.data);
      if (!event) {
        continue;
      }
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
      await paint();
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      trace('client', 'run sse ended', error instanceof Error ? error.message : error);
    }
  } finally {
    try {
      const record = await getThread(threadId);
      useThreadStore.getState().upsert(toClientThread(record));
      useSessionStore.getState().replaceEvents(threadId, record.events);
    } catch {
      // ignore reconcile errors
    }
    useSessionStore.getState().finishRun(threadId, runId);
  }
}

function parseSessionEvent(data: string): SessionEvent | undefined {
  try {
    const parsed = JSON.parse(data) as SessionEvent;
    if (parsed && typeof parsed === 'object' && 'type' in parsed) {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function paint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
