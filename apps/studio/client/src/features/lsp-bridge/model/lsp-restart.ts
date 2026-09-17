import type { WorkspaceLspEntry, WorkspaceLspListResponse } from '@harnesys/studio-shared';

import { apiJson } from '@/shared/api/client';

/**
 * Restart a workspace language server (spec §2). The server kills the
 * session and drops the resolve cache; the client re-attaches its bridge.
 */
export async function restartWorkspaceLsp(workspaceId: string, serverId: string): Promise<void> {
  await apiJson(`/api/workspaces/${workspaceId}/lsp/${serverId}/restart`, { method: 'POST' });
}

/**
 * Restart the merged-list server covering `path`, matched by file extension
 * against each server's `extensionToLanguage` map.
 */
export async function restartLspForPath(workspaceId: string, path: string): Promise<void> {
  const list = await apiJson<WorkspaceLspListResponse>(`/api/workspaces/${workspaceId}/lsp`);
  const serverId = findServerIdForPath(list.servers, path);
  if (!serverId) {
    throw new Error(`no LSP server for file: ${path}`);
  }
  await restartWorkspaceLsp(workspaceId, serverId);
}

function findServerIdForPath(servers: WorkspaceLspEntry[], path: string): string | undefined {
  const ext = extensionOf(path);
  if (!ext) {
    return undefined;
  }
  return servers.find((server) =>
    Object.keys(server.extensionToLanguage).some((key) => normalizeExtension(key) === ext),
  )?.serverId;
}

function extensionOf(path: string): string | undefined {
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return undefined;
  }
  return base.slice(dot + 1).toLowerCase();
}

function normalizeExtension(key: string): string {
  return key.replace(/^\.+/, '').toLowerCase();
}
