import type { StreamEvent } from '@studio/shared';
import { isAgentEntry } from '@studio/shared';
import { useJournalStore } from '@/entities/journal';
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
      const event = parseEvent(frame.data);
      if (!event) {
        continue;
      }
      const store = useJournalStore.getState();
      store.applyEvent(threadId, event);
      maybeMarkUnread(threadId);
      if (event.type === 'entry' && isAgentEntry(event.entry) && event.entry.status === 'failed') {
        store.setFailure({
          id: `failed-${event.entry.id}`,
          threadId,
          text: event.entry.error?.message ?? 'Run failed',
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
      useJournalStore.getState().replaceJournal(record.id, record.journal);
    } catch {
      // ignore reconcile errors
    }
    useJournalStore.getState().finishRun(threadId, runId);
  }
}

function parseEvent(data: string): StreamEvent | undefined {
  try {
    return JSON.parse(data) as StreamEvent;
  } catch {
    return undefined;
  }
}

function paint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
