import type {
  WorkspaceFileEntry,
  WorkspaceMoveItem,
  WorkspaceMoveResult,
} from '@harnesys/studio-shared';

import { ApiError, apiJson } from './client';
import { hostTokenQuery } from './host-credential';
import { findWindowHost, resolveApiTarget, routeForNode, setHostOnlineStatus } from './host-router';
import { watchEventSource } from './sse';

export function listWorkspaceFiles(workspaceId: string, subPath = '') {
  const params = subPath ? `?path=${encodeURIComponent(subPath)}` : '';
  return apiJson<WorkspaceFileEntry[]>(`/api/workspaces/${workspaceId}/files${params}`);
}

/** Two-element key is a prefix: matches both visible and hidden trees on invalidate. */
export function workspaceFilesTreeQueryKey(
  workspaceId: string,
  includeHidden?: undefined,
): readonly ['workspace-files-tree', string];
export function workspaceFilesTreeQueryKey(
  workspaceId: string,
  includeHidden: boolean,
): readonly ['workspace-files-tree', string, 'hidden' | 'visible'];
export function workspaceFilesTreeQueryKey(workspaceId: string, includeHidden?: boolean) {
  return includeHidden === undefined
    ? (['workspace-files-tree', workspaceId] as const)
    : (['workspace-files-tree', workspaceId, includeHidden ? 'hidden' : 'visible'] as const);
}

/** One-shot flat tree; each entry.path is workspace-relative. */
export function listWorkspaceFilesTree(workspaceId: string, options?: { includeHidden?: boolean }) {
  const qs = options?.includeHidden ? '?hidden=1' : '';
  return apiJson<WorkspaceFileEntry[]>(`/api/workspaces/${workspaceId}/files/tree${qs}`);
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
  const apiPath = `/api/workspaces/${workspaceId}/files/content`;
  const target = resolveApiTarget(apiPath, { nodeId: workspaceId });
  const token = hostTokenQuery(target.credential);
  const qs = `path=${encodeURIComponent(path)}${token ? `&${token}` : ''}`;
  return `${target.url}?${qs}`;
}

export async function readWorkspaceFileText(workspaceId: string, path: string): Promise<string> {
  const target = resolveApiTarget(`/api/workspaces/${workspaceId}/files/content`, {
    nodeId: workspaceId,
  });
  const headers = new Headers();
  if (target.credential) {
    headers.set('Authorization', `Bearer ${target.credential}`);
  }
  let response: Response;
  try {
    response = await fetch(workspaceFileContentUrl(workspaceId, path), { headers });
    setHostOnlineStatus(target.hostId, 'online');
  } catch (error) {
    setHostOnlineStatus(target.hostId, 'offline');
    throw error;
  }
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
  const route = routeForNode(workspaceId);
  const host = route ? findWindowHost(route.hostId) : undefined;
  const target = resolveApiTarget(`/api/workspaces/${workspaceId}/files/watch`, {
    nodeId: workspaceId,
  });
  return watchEventSource(
    target.url,
    'fs-change',
    () => {
      onEvent();
    },
    {
      credential: target.credential ?? host?.credential,
      onError: () => setHostOnlineStatus(target.hostId, 'offline'),
    },
  );
}
