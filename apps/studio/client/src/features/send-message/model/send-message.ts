import type { RunMode, SessionEvent, ThreadAttachment } from '@studio/shared';
import { useSessionStore } from '@/entities/session';
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
  const store = useSessionStore.getState();
  store.startRun(threadId, controller);
  store.appendEvent(threadId, {
    type: 'user',
    text: trimmed,
    attachments: attachments?.length
      ? attachments.map((item) => ({
          id: item.id,
          kind: item.kind,
          name: item.name,
          mediaType: item.mediaType,
          path: item.path,
        }))
      : undefined,
  });

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
    store.setRunId(threadId, runId);
    useThreadStore.getState().touch(threadId);
    trace('client', 'POST accepted', { runId, status: accepted.status });
  } catch (error) {
    if (controller.signal.aborted) {
      trace('client', 'send aborted by user before response');
      store.finishRun(threadId);
      return;
    }
    useSessionStore.getState().finishRun(threadId);
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
    useSessionStore.getState().finishRun(threadId, runId);
    throw error;
  }

  let frames = 0;
  let finished = false;
  try {
    for await (const frame of readSse(response)) {
      frames += 1;
      const event = parseSessionEvent(frame.data);
      if (!event) {
        trace('client', `frame #${frames} unparsed`, {
          event: frame.event,
          data: preview(frame.data),
        });
        continue;
      }
      trace('client', `frame #${frames} ${event.type}`, summarize(event));
      applyClientEvent(threadId, event);
      if (event.type === 'done' || event.type === 'error') {
        finished = true;
      }
      await paint();
    }
    finished = true;
  } catch (error) {
    if (controller.signal.aborted) {
      trace('client', 'SSE aborted by user');
      useSessionStore.getState().finishRun(threadId, runId);
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
      useSessionStore.getState().finishRun(threadId, runId);
      throw error;
    }
  }
  trace('client', 'sse ended', { frames, finished });
  try {
    const record = await getThread(threadId);
    useThreadStore.getState().upsert(toClientThread(record));
    useSessionStore.getState().replaceEvents(threadId, record.events);
    noteUnreadAfterReconcile(threadId, record.unread);
    trace('client', 'reconciled', { events: record.events.length });
  } catch (reconcileError) {
    trace(
      'client',
      'reconcile failed',
      reconcileError instanceof Error ? reconcileError.message : reconcileError,
    );
  } finally {
    useSessionStore.getState().finishRun(threadId, runId);
  }
}

function applyClientEvent(threadId: string, event: SessionEvent): void {
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

function summarize(event: SessionEvent): unknown {
  if (event.type === 'text-delta') {
    return preview(event.text, 80);
  }
  if (event.type === 'tool') {
    return `${event.phase} ${event.name}`;
  }
  if (event.type === 'ask') {
    return `ask ${event.source}`;
  }
  return event.type;
}

function paint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
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
