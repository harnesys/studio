import type {
  ApprovePluginServerRequest,
  EnableWorkspacePluginRequest,
  InstallPluginRequest,
  PluginDiagnostic,
  PluginListItem,
  PluginMutationResponse,
  PluginRecord,
  PluginSummary,
  RemovePluginRequest,
  SetPluginGrantsRequest,
  SetPluginOptionRequest,
} from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';

import { apiJson } from './client';

export type {
  ApprovePluginServerRequest,
  EnableWorkspacePluginRequest,
  InstallPluginRequest,
  PluginDiagnostic,
  PluginListItem,
  PluginMutationResponse,
  PluginRecord,
  PluginSummary,
  RemovePluginRequest,
  SetPluginGrantsRequest,
  SetPluginOptionRequest,
};

export type EnableWorkspacePluginResponse = {
  plugin: PluginSummary;
};

export const pluginsQueryKey = ['plugins'] as const;

export function listPlugins() {
  return apiJson<PluginListItem[]>('/api/plugins');
}

export function pluginsQuery() {
  return queryOptions({
    queryKey: pluginsQueryKey,
    queryFn: listPlugins,
    staleTime: 20_000,
  });
}

export function installPlugin(body: InstallPluginRequest) {
  return apiJson<PluginMutationResponse>('/api/plugins/install', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updatePlugin(name: string, body: { ref?: string } = {}) {
  return apiJson<PluginMutationResponse>(`/api/plugins/${encodeURIComponent(name)}/update`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function setPluginGrants(workspaceId: string, name: string, body: SetPluginGrantsRequest) {
  return apiJson<{ plugin: PluginRecord }>(
    `/api/workspaces/${workspaceId}/plugins/${encodeURIComponent(name)}/grants`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
}

export function approvePluginServer(name: string, body: ApprovePluginServerRequest) {
  return apiJson<{ plugin: PluginRecord }>(`/api/plugins/${encodeURIComponent(name)}/approvals`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function setPluginOption(workspaceId: string, name: string, body: SetPluginOptionRequest) {
  return apiJson<{ plugin: PluginRecord; diagnostics: PluginDiagnostic[] }>(
    `/api/workspaces/${workspaceId}/plugins/${encodeURIComponent(name)}/options`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
}

export function enableWorkspacePlugin(
  workspaceId: string,
  name: string,
  body: EnableWorkspacePluginRequest,
) {
  return apiJson<EnableWorkspacePluginResponse>(
    `/api/workspaces/${workspaceId}/plugins/${encodeURIComponent(name)}/enable`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function removePlugin(name: string, body: RemovePluginRequest = {}) {
  const query = body.deleteData ? '?deleteData=true' : '';
  return apiJson<void>(`/api/plugins/${encodeURIComponent(name)}${query}`, {
    method: 'DELETE',
    ...(body.deleteData !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
