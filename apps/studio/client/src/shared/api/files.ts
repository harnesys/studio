import type {
  WorkspaceFileEntry,
  WorkspaceMoveItem,
  WorkspaceMoveResult,
} from '@harnesys/studio-shared';

import { ApiError, apiJson } from './client';
import { watchEventSource } from './sse';

export function listWorkspaceFiles(workspaceId: string, subPath = '') {
  const params = subPath ? `?path=${encodeURIComponent(subPath)}` : '';
  return apiJson<WorkspaceFileEntry[]>(`/api/workspaces/${workspaceId}/files${params}`);
}

export function createWorkspaceFile(
  workspaceId: string,
  input: { path: string; kind: 'file' | 'dir' },
) {
  return apiJson<{ path: string; kind: 'file' | 'dir' }>(`/api/workspaces/${workspaceId}/files`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteWorkspaceFile(workspaceId: string, path: string) {
  return apiJson<void>(`/api/workspaces/${workspaceId}/files`, {
    method: 'DELETE',
    body: JSON.stringify({ path }),
  });
}

export function moveWorkspaceFiles(workspaceId: string, items: WorkspaceMoveItem[]) {
  return apiJson<WorkspaceMoveResult>(`/api/workspaces/${workspaceId}/files/move`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export function workspaceFileContentUrl(workspaceId: string, path: string): string {
  return `/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(path)}`;
}

export async function readWorkspaceFileText(workspaceId: string, path: string): Promise<string> {
  const response = await fetch(workspaceFileContentUrl(workspaceId, path));
  if (!response.ok) {
    let message = response.statusText || 'Request failed';
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // keep status text
    }
    throw new ApiError(response.status, message);
  }
  return response.text();
}

export function writeWorkspaceFileContent(
  workspaceId: string,
  input: { path: string; content: string },
) {
  return apiJson<{ path: string }>(`/api/workspaces/${workspaceId}/files/content`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function watchWorkspaceFiles(workspaceId: string, onEvent: () => void): () => void {
  return watchEventSource(`/api/workspaces/${workspaceId}/files/watch`, 'fs-change', () => {
    onEvent();
  });
}
