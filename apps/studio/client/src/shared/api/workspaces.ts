import type {
  CreateWorkspaceSkillRequest,
  UpsertWorkspaceMcpServerRequest,
  PackCatalogEntry as WorkspaceCapability,
  WorkspaceMcpConfigServer,
  WorkspaceMcpServer,
  WorkspaceRecord,
  WorkspaceSkill,
  WorkspaceTool,
} from '@studio/shared';
import { queryOptions } from '@tanstack/react-query';

import { apiJson } from './client';

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

export function listWorkspaces() {
  return apiJson<WorkspaceRecord[]>('/api/workspaces');
}

export function pickWorkspaceFolder() {
  return apiJson<{ path: string } | undefined>('/api/workspaces/pick', { method: 'POST' });
}

export function createWorkspace(input: { path?: string; name?: string }) {
  return apiJson<WorkspaceRecord>('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateWorkspace(id: string, input: { name?: string; path?: string }) {
  return apiJson<WorkspaceRecord>(`/api/workspaces/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteWorkspace(id: string) {
  return apiJson<void>(`/api/workspaces/${id}`, { method: 'DELETE' });
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
    staleTime: 20_000,
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
    staleTime: 20_000,
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
    staleTime: 20_000,
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
    staleTime: 20_000,
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
    staleTime: 20_000,
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
