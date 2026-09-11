import type {
  EnableWorkspacePluginRequest,
  InstallPluginRequest,
  PluginListItem,
  PluginMutationResponse,
  PluginSummary,
  RemovePluginRequest,
  TrustPluginRequest,
} from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';

import { apiJson } from './client';

export type {
  EnableWorkspacePluginRequest,
  InstallPluginRequest,
  PluginListItem,
  PluginMutationResponse,
  PluginSummary,
  RemovePluginRequest,
  TrustPluginRequest,
};

export type TrustPluginResponse = {
  plugin: PluginSummary;
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

export function trustPlugin(name: string, body: TrustPluginRequest) {
  return apiJson<TrustPluginResponse>(`/api/plugins/${encodeURIComponent(name)}/trust`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
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
