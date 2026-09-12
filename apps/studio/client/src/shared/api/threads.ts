import type {
  AcceptedRunResponse,
  ThreadAttachment,
  ThreadPlanRecord,
  ThreadRecord,
  ThreadSummary,
} from '@harnesys/studio-shared';

import { ApiError, apiJson } from './client';

export type CreateThreadInput = {
  title?: string;
  agentId?: string;
  originAgentId?: string;
  workspaceId?: string;
  kind?: 'chat' | 'schedule';
  parentThreadId?: string;
  forkAt?: string;
};
export function listThreads(workspaceId: string) {
  return apiJson<ThreadSummary[]>(`/api/workspaces/${workspaceId}/threads`);
}

export function getThread(id: string) {
  return apiJson<ThreadRecord>(`/api/threads/${id}`);
}

export function createThreadRecord(body: CreateThreadInput) {
  return apiJson<ThreadRecord>('/api/threads', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function attachmentUrl(threadId: string, attachmentId: string): string {
  return `/api/threads/${threadId}/attachments/${attachmentId}`;
}

export function uploadThreadAttachment(threadId: string, file: File): Promise<ThreadAttachment> {
  const body = new FormData();
  body.append('file', file);
  return apiJson<ThreadAttachment>(`/api/threads/${threadId}/attachments`, {
    method: 'POST',
    body,
  });
}

export type SendThreadRunOptions = {
  id: string;
  text: string;
  effort?: string;
  attachmentIds?: string[];
  mode?: string;
  clientEventId?: string;
};

export function sendThreadRun(options: SendThreadRunOptions): Promise<AcceptedRunResponse> {
  const { id, text, effort, attachmentIds, mode, clientEventId } = options;
  return apiJson<AcceptedRunResponse>(`/api/threads/${id}/runs`, {
    method: 'POST',
    body: JSON.stringify({ text, effort, attachmentIds, mode, clientEventId }),
  });
}

export function getThreadPlan(threadId: string): Promise<ThreadPlanRecord | null> {
  return apiJson<{ plan: ThreadPlanRecord | null }>(`/api/threads/${threadId}/plan`).then(
    (res) => res.plan,
  );
}

export type RespondRunOptions = {
  clientEventId?: string;
};

export function respondToRun(
  runId: string,
  askId: string,
  payload: unknown,
  opts?: RespondRunOptions,
): Promise<void> {
  return apiJson<void>(`/api/runs/${runId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ askId, payload, clientEventId: opts?.clientEventId }),
  });
}

export function rejectRun(
  runId: string,
  askId: string,
  note?: string,
  opts?: RespondRunOptions,
): Promise<void> {
  return apiJson<void>(`/api/runs/${runId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ askId, note, clientEventId: opts?.clientEventId }),
  });
}

export type RetryRunResponse = {
  runId: string;
};

export function retryRun(runId: string): Promise<RetryRunResponse> {
  return apiJson<RetryRunResponse>(`/api/runs/${runId}/retry`, { method: 'POST' });
}

export async function compactThreadStream(id: string, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(`/api/threads/${id}/compact`, {
    method: 'POST',
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  if (!response.ok) {
    let message = response.statusText || 'Compact failed';
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message);
  }
  return response;
}

export async function getRunEventsStream(
  runId: string,
  fromSeq?: number,
  signal?: AbortSignal,
): Promise<Response> {
  const url = `/api/runs/${runId}/events${fromSeq != null ? `?fromSeq=${fromSeq}` : ''}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  if (!response.ok) {
    let message = response.statusText || 'Stream connection failed';
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {}
    throw new ApiError(response.status, message);
  }
  return response;
}

export function cancelRun(runId: string): Promise<void> {
  return apiJson<void>(`/api/runs/${runId}/cancel`, { method: 'POST' });
}

export function markThreadRead(id: string) {
  return apiJson<ThreadRecord>(`/api/threads/${id}/read`, { method: 'POST' });
}

export function setThreadPinned(id: string, pinned: boolean) {
  return apiJson<ThreadRecord>(`/api/threads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ pinned }),
  });
}

export function deleteThreadRecord(id: string) {
  return apiJson<void>(`/api/threads/${id}`, { method: 'DELETE' });
}

export function deleteThreadEntry(threadId: string, entryId: string) {
  return apiJson<ThreadRecord>(`/api/threads/${threadId}/entries/${entryId}`, {
    method: 'DELETE',
  });
}
