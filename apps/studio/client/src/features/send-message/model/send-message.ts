import type { ThreadAttachment } from '@harnesys/studio-shared';
import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { ApiError, cancelRun, sendThreadRun } from '@/shared/api';
import { preview, trace } from '@/shared/lib/trace';

import { connectThreadRun } from './client-registry';

export type SendMessageOptions = {
  threadId: string;
  content: string;
  effort?: string;
  attachments?: ThreadAttachment[];
  mode?: string;
};

type RunConflictBody = {
  code?: string;
  runId?: string;
  pendingAskId?: string;
};

export async function sendMessage(options: SendMessageOptions) {
  const { threadId, content, effort, attachments, mode } = options;
  const trimmed = content.trim();
  if (!trimmed && !attachments?.length) {
    return;
  }
  trace('client', 'send start', { threadId, text: preview(trimmed) });

  const clientEventId = crypto.randomUUID();
  const startedHere = !useSessionStore.getState().activeRuns[threadId];
  const optimisticController = startedHere ? new AbortController() : null;
  if (startedHere && optimisticController) {
    useSessionStore.getState().startRun(threadId, optimisticController);
  }
  useSessionStore.getState().appendEvent(threadId, {
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
    clientEventId,
  });

  try {
    const accepted = await sendThreadRun({
      id: threadId,
      text: trimmed,
      effort,
      attachmentIds: attachments?.map((item) => item.id),
      mode,
      clientEventId,
    });
    if (optimisticController?.signal.aborted) {
      void cancelRun(accepted.runId).catch(() => {});
      return;
    }
    useThreadStore.getState().touch(threadId);
    connectThreadRun(threadId, accepted.runId);
    trace('client', 'POST accepted', { runId: accepted.runId, status: accepted.status });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const body = (error.body ?? {}) as RunConflictBody;
      if (body.runId) {
        useSessionStore.getState().removeEventByClientEventId(threadId, clientEventId);
        connectThreadRun(threadId, body.runId);
        return;
      }
      if (body.pendingAskId) {
        // Ask card is already in the transcript and the composer is blocked: drop the bubble.
        useSessionStore.getState().removeEventByClientEventId(threadId, clientEventId);
        if (startedHere) {
          useSessionStore.getState().finishRun(threadId);
        }
        return;
      }
    }
    trace('client', 'send failed', error instanceof Error ? error.message : error);
    if (startedHere) {
      useSessionStore.getState().finishRun(threadId);
    }
    useSessionStore.getState().appendEvent(threadId, {
      type: 'error',
      code: 'send_failed',
      message: error instanceof Error ? error.message : 'Send failed',
    });
  }
}
