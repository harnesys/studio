import type {
  CreateWorkspaceSkillRequest,
  UpsertWorkspaceMcpServerRequest,
  PackCatalogEntry as WorkspaceCapability,
  WorkspaceMcpConfigServer,
  WorkspaceMcpServer,
  WorkspaceRecord,
  WorkspaceSkill,
  WorkspaceTool,
} from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';
import { getWindowHosts } from './host-credential';
import { rememberNodeRoute, setHostOnlineStatus, trimBaseUrl, urlForHost } from './host-router';

export type {
  CreateWorkspaceSkillRequest,
  UpsertWorkspaceMcpServerRequest,
  WorkspaceCapability,
  WorkspaceMcpConfigServer,
  WorkspaceMcpServer,
  WorkspaceSkill,
  WorkspaceTool,
};
export type WorkspaceSkillsResponse = {
  skills: WorkspaceSkill[];
};
export type WorkspaceToolsResponse = {
  tools: WorkspaceTool[];
};
export type WorkspaceCapabilitiesResponse = {
  capabilities: WorkspaceCapability[];
};
export type CreateWorkspaceSkillResponse = {
  skill: WorkspaceSkill;
};
export type WorkspaceMcpResponse = {
  servers: WorkspaceMcpServer[];
};
export type WorkspaceMcpConfigResponse = {
  servers: WorkspaceMcpConfigServer[];
};
export type UpsertWorkspaceMcpServerResponse = {
  server: WorkspaceMcpConfigServer;
};
export const workspacesQueryKey = ['workspaces'] as const;
export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  const hosts = getWindowHosts();
  if (hosts.length === 0) {
    return apiJson<WorkspaceRecord[]>('/api/workspaces');
  }
  const settled = await Promise.all(
    hosts.map(async (host) => {
      const headers = new Headers({ Authorization: `Bearer ${host.credential}` });
      try {
        const response = await fetch(urlForHost(host, '/api/workspaces'), { headers });
        if (!response.ok) {
          setHostOnlineStatus(host.id, 'offline');
          return [] as WorkspaceRecord[];
        }
        setHostOnlineStatus(host.id, 'online');
        const rows = (await response.json()) as WorkspaceRecord[];
        for (const row of rows) {
          rememberNodeRoute({
            nodeId: row.id,
            hostId: host.id,
            baseUrl: trimBaseUrl(host.baseUrl),
            credential: host.credential,
          });
        }
        return rows;
      } catch {
        setHostOnlineStatus(host.id, 'offline');
        return [] as WorkspaceRecord[];
      }
    }),
  );
  return settled.flat();
}
export function pickWorkspaceFolder() {
  return apiJson<
    | {
        path: string;
      }
    | undefined
  >('/api/workspaces/pick', { method: 'POST' });
}
export function createWorkspace(input: { path?: string; name?: string; hostId?: string }) {
  const { hostId, ...body } = input;
  return apiJson<WorkspaceRecord>('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify(body),
    hostId,
  }).then((created) => {
    const host = getWindowHosts().find((item) => item.id === (hostId ?? 'local'));
    if (host) {
      rememberNodeRoute({
        nodeId: created.id,
        hostId: host.id,
        baseUrl: trimBaseUrl(host.baseUrl),
        credential: host.credential,
      });
    }
    return created;
  });
}
export function updateWorkspace(
  id: string,
  input: {
    name?: string;
    path?: string;
    color?: string | null;
  },
) {
  return apiJson<WorkspaceRecord>(`/api/workspaces/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
export function deleteWorkspace(id: string) {
  return apiJson<void>(`/api/workspaces/${id}`, { method: 'DELETE' });
}
export function wipeWorkspace(
  id: string,
  input: {
    wipeFolder?: boolean;
  } = {},
) {
  return apiJson<void>(`/api/workspaces/${id}/wipe`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
export const workspacesQuery = queryOptions({
  queryKey: workspacesQueryKey,
  queryFn: listWorkspaces,
});
export function workspaceSkillsQueryKey(workspaceId: string) {
  return [...workspacesQueryKey, workspaceId, 'skills'] as const;
}
export function listWorkspaceSkills(workspaceId: string) {
  return apiJson<WorkspaceSkillsResponse>(`/api/workspaces/${workspaceId}/skills`);
}
export function workspaceSkillsQuery(workspaceId: string) {
  return queryOptions({
    queryKey: workspaceSkillsQueryKey(workspaceId),
    queryFn: () => listWorkspaceSkills(workspaceId),
    staleTime: 20000,
  });
}
export function reloadWorkspaceSkills(workspaceId: string) {
  return apiJson<WorkspaceSkillsResponse>(`/api/workspaces/${workspaceId}/skills/reload`, {
    method: 'POST',
  });
}
export function createWorkspaceSkill(workspaceId: string, body: CreateWorkspaceSkillRequest) {
  return apiJson<CreateWorkspaceSkillResponse>(`/api/workspaces/${workspaceId}/skills`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
export function workspaceToolsQueryKey(workspaceId: string) {
  return [...workspacesQueryKey, workspaceId, 'tools'] as const;
}
export function listWorkspaceTools(workspaceId: string) {
  return apiJson<WorkspaceToolsResponse>(`/api/workspaces/${workspaceId}/tools`);
}
export function workspaceToolsQuery(workspaceId: string) {
  return queryOptions({
    queryKey: workspaceToolsQueryKey(workspaceId),
    queryFn: () => listWorkspaceTools(workspaceId),
    staleTime: 20000,
  });
}
export function workspaceCapabilitiesQueryKey(workspaceId: string) {
  return [...workspacesQueryKey, workspaceId, 'capabilities'] as const;
}
export function listWorkspaceCapabilities(workspaceId: string) {
  return apiJson<WorkspaceCapabilitiesResponse>(`/api/workspaces/${workspaceId}/capabilities`);
}
export function workspaceCapabilitiesQuery(workspaceId: string) {
  return queryOptions({
    queryKey: workspaceCapabilitiesQueryKey(workspaceId),
    queryFn: () => listWorkspaceCapabilities(workspaceId),
    staleTime: 20000,
  });
}
export function workspaceMcpQueryKey(workspaceId: string) {
  return [...workspacesQueryKey, workspaceId, 'mcp'] as const;
}
export function listWorkspaceMcp(workspaceId: string) {
  return apiJson<WorkspaceMcpResponse>(`/api/workspaces/${workspaceId}/mcp`);
}
export function workspaceMcpQuery(workspaceId: string) {
  return queryOptions({
    queryKey: workspaceMcpQueryKey(workspaceId),
    queryFn: () => listWorkspaceMcp(workspaceId),
    staleTime: 20000,
  });
}
export function workspaceMcpConfigQueryKey(workspaceId: string) {
  return [...workspacesQueryKey, workspaceId, 'mcp', 'config'] as const;
}
export function listWorkspaceMcpConfig(workspaceId: string) {
  return apiJson<WorkspaceMcpConfigResponse>(`/api/workspaces/${workspaceId}/mcp/config`);
}
export function workspaceMcpConfigQuery(workspaceId: string) {
  return queryOptions({
    queryKey: workspaceMcpConfigQueryKey(workspaceId),
    queryFn: () => listWorkspaceMcpConfig(workspaceId),
    staleTime: 20000,
  });
}
export function reloadWorkspaceMcp(workspaceId: string) {
  return apiJson<WorkspaceMcpConfigResponse>(`/api/workspaces/${workspaceId}/mcp/reload`, {
    method: 'POST',
  });
}
export function upsertWorkspaceMcpServer(
  workspaceId: string,
  serverId: string,
  body: UpsertWorkspaceMcpServerRequest,
) {
  return apiJson<UpsertWorkspaceMcpServerResponse>(
    `/api/workspaces/${workspaceId}/mcp/servers/${encodeURIComponent(serverId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
}
export function deleteWorkspaceMcpServer(workspaceId: string, serverId: string) {
  return apiJson<void>(
    `/api/workspaces/${workspaceId}/mcp/servers/${encodeURIComponent(serverId)}`,
    { method: 'DELETE' },
  );
}
export function setWorkspaceMcpServerState(
  workspaceId: string,
  serverId: string,
  body: {
    enabled: boolean;
  },
) {
  return apiJson<WorkspaceMcpConfigResponse>(
    `/api/workspaces/${workspaceId}/mcp/servers/${encodeURIComponent(serverId)}/state`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
}
export function restartWorkspaceMcpServer(workspaceId: string, serverId: string) {
  return apiJson<WorkspaceMcpConfigResponse>(
    `/api/workspaces/${workspaceId}/mcp/servers/${encodeURIComponent(serverId)}/restart`,
    { method: 'POST' },
  );
}
