import type { RunMode, ThreadAttachment } from '@studio/shared';
import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { ApiError, sendThreadRun } from '@/shared/api';
import { preview, trace } from '@/shared/lib/trace';

import { connectThreadRun } from './client-registry';

export type SendMessageOptions = {
  threadId: string;
  content: string;
  effort?: string;
  attachments?: ThreadAttachment[];
  mode?: RunMode;
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
        return;
      }
    }
    trace('client', 'send failed', error instanceof Error ? error.message : error);
    useSessionStore.getState().appendEvent(threadId, {
      type: 'error',
      code: 'send_failed',
      message: error instanceof Error ? error.message : 'Send failed',
    });
  }
}
