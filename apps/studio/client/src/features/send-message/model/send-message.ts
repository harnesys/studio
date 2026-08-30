import type { RunMode, StreamEvent, ThreadAttachment } from '@studio/shared';
import { isAgentEntry } from '@studio/shared';
import { useJournalStore } from '@/entities/journal';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { getRunEventsStream, getThread, readSse, sendThreadRun } from '@/shared/api';
import { preview, trace } from '@/shared/lib/trace';

export type SendMessageOptions = {
  threadId: string;
  content: string;
  effort?: string;
  attachments?: ThreadAttachment[];
  mode?: RunMode;
};

export async function sendMessage(options: SendMessageOptions) {
  const { threadId, content, effort, attachments, mode } = options;
  const trimmed = content.trim();
  if (!trimmed && !attachments?.length) {
    return;
  }
  trace('client', 'send start', { threadId, text: preview(trimmed) });

  const controller = new AbortController();
  const store = useJournalStore.getState();
  store.startRun(threadId, controller);

  let runId: string;
  try {
    const accepted = await sendThreadRun({
      id: threadId,
      text: trimmed,
      effort,
      attachmentIds: attachments?.map((item) => item.id),
      mode,
    });
    runId = accepted.runId;
    store.replaceJournal(threadId, accepted.journal);
    store.setRunId(threadId, runId);
    useThreadStore.getState().touch(threadId);
    trace('client', 'POST accepted', { runId, status: accepted.status });
  } catch (error) {
    if (controller.signal.aborted) {
      trace('client', 'send aborted by user before response');
      store.finishRun(threadId);
      return;
    }
    useJournalStore.getState().finishRun(threadId);
    throw error;
  }

  let response: Response;
  try {
    response = await getRunEventsStream(runId, 0, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      trace('client', 'SSE aborted by user');
      store.finishRun(threadId, runId);
      return;
    }
    useJournalStore.getState().finishRun(threadId, runId);
    throw error;
  }

  let frames = 0;
  let finished = false;
  try {
    for await (const frame of readSse(response)) {
      frames += 1;
      const event = parseEvent(frame.data);
      if (!event) {
        trace('client', `frame #${frames} unparsed`, {
          event: frame.event,
          data: preview(frame.data),
        });
        continue;
      }
      trace('client', `frame #${frames} ${event.type}`, summarize(event));
      applyClientEvent(threadId, event);
      if (isTerminalAgentEntry(event)) {
        finished = true;
      }
      await paint();
    }
    finished = true;
  } catch (error) {
    if (controller.signal.aborted) {
      trace('client', 'SSE aborted by user');
      useJournalStore.getState().finishRun(threadId, runId);
      return;
    }
    if (finished || frames > 0) {
      trace(
        'client',
        'sse stream ended with error after frames',
        error instanceof Error ? error.message : error,
      );
    } else {
      trace('client', 'sse read failed', error instanceof Error ? error.message : error);
      useJournalStore.getState().finishRun(threadId, runId);
      throw error;
    }
  }
  trace('client', 'sse ended', { frames, finished });
  try {
    const record = await getThread(threadId);
    useThreadStore.getState().upsert(toClientThread(record));
    useJournalStore.getState().replaceJournal(threadId, record.journal);
    noteUnreadAfterReconcile(threadId, record.unread);
    trace('client', 'reconciled', { entries: record.journal.entries.length });
  } catch (reconcileError) {
    trace(
      'client',
      'reconcile failed',
      reconcileError instanceof Error ? reconcileError.message : reconcileError,
    );
  } finally {
    useJournalStore.getState().finishRun(threadId, runId);
  }
}

function applyClientEvent(threadId: string, event: StreamEvent): void {
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
}

/** Unread when content arrives while this thread is not stuck to the bottom edge. */
export function maybeMarkUnread(threadId: string): void {
  if (useThreadStore.getState().isViewingAtEnd(threadId)) {
    return;
  }
  useThreadStore.getState().markUnread(threadId);
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

function isTerminalAgentEntry(event: StreamEvent): boolean {
  if (event.type !== 'entry' || !isAgentEntry(event.entry)) {
    return false;
  }
  const status = event.entry.status;
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function summarize(event: StreamEvent): unknown {
  if (event.type === 'delta') {
    return preview(event.text, 80);
  }
  if (event.type === 'step') {
    return `${event.step.type} ${event.step.status}`;
  }
  if (event.type === 'entry') {
    return event.entry.role;
  }
  return event;
}

function paint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function parseEvent(data: string): StreamEvent | undefined {
  try {
    return JSON.parse(data) as StreamEvent;
  } catch {
    return undefined;
  }
}
