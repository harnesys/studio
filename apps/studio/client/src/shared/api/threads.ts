import type {
  AcceptedRunResponse,
  CompactThreadResponse,
  RunMode,
  ThreadAttachment,
  ThreadPlanRecord,
  ThreadRecord,
  ThreadSummary,
} from '@studio/shared';

import { ApiError, apiJson } from './client';

export type CreateThreadInput = {
  title?: string;
  agentId?: string;
  workspaceId?: string;
  kind?: 'chat' | 'schedule';
};
export function listThreads() {
  return apiJson<ThreadSummary[]>('/api/threads');
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
  mode?: RunMode;
};

export function sendThreadRun(options: SendThreadRunOptions): Promise<AcceptedRunResponse> {
  const { id, text, effort, attachmentIds, mode } = options;
  return apiJson<AcceptedRunResponse>(`/api/threads/${id}/runs`, {
    method: 'POST',
    body: JSON.stringify({ text, effort, attachmentIds, mode }),
  });
}

export function getThreadPlan(threadId: string): Promise<ThreadPlanRecord | null> {
  return apiJson<{ plan: ThreadPlanRecord | null }>(`/api/threads/${threadId}/plan`).then(
    (res) => res.plan,
  );
}

export function resumeThread(id: string): Promise<AcceptedRunResponse> {
  return apiJson<AcceptedRunResponse>(`/api/threads/${id}/resume`, {
    method: 'POST',
  });
}

export function compactThread(id: string): Promise<CompactThreadResponse> {
  return apiJson<CompactThreadResponse>(`/api/threads/${id}/compact`, {
    method: 'POST',
  });
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

export function deleteThreadRecord(id: string) {
  return apiJson<void>(`/api/threads/${id}`, { method: 'DELETE' });
}

export function deleteThreadEntry(threadId: string, entryId: string) {
  return apiJson<ThreadRecord>(`/api/threads/${threadId}/entries/${entryId}`, {
    method: 'DELETE',
  });
}
