import type {
  ApprovePluginServerRequest,
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
export const pluginsQueryKey = ['plugins'] as const;
export function pluginsQueryKeyFor(workspaceId: string) {
  return [...pluginsQueryKey, workspaceId] as const;
}
function pluginsBase(workspaceId: string) {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/plugins`;
}
export function listPlugins(workspaceId: string) {
  return apiJson<PluginListItem[]>(pluginsBase(workspaceId));
}
export function pluginsQuery(workspaceId: string) {
  return queryOptions({
    queryKey: pluginsQueryKeyFor(workspaceId),
    queryFn: () => listPlugins(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 20000,
  });
}
export function installPlugin(workspaceId: string, body: InstallPluginRequest) {
  return apiJson<PluginMutationResponse>(`${pluginsBase(workspaceId)}/install`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
export function updatePlugin(
  workspaceId: string,
  name: string,
  body: {
    ref?: string;
  } = {},
) {
  return apiJson<PluginMutationResponse>(
    `${pluginsBase(workspaceId)}/${encodeURIComponent(name)}/update`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}
export function setPluginGrants(workspaceId: string, name: string, body: SetPluginGrantsRequest) {
  return apiJson<{
    plugin: PluginRecord;
  }>(`${pluginsBase(workspaceId)}/${encodeURIComponent(name)}/grants`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
export function approvePluginServer(
  workspaceId: string,
  name: string,
  body: ApprovePluginServerRequest,
) {
  return apiJson<{
    plugin: PluginRecord;
  }>(`${pluginsBase(workspaceId)}/${encodeURIComponent(name)}/approvals`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
export function setPluginOption(workspaceId: string, name: string, body: SetPluginOptionRequest) {
  return apiJson<{
    plugin: PluginRecord;
    diagnostics: PluginDiagnostic[];
  }>(`${pluginsBase(workspaceId)}/${encodeURIComponent(name)}/options`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
export function removePlugin(workspaceId: string, name: string, body: RemovePluginRequest = {}) {
  const query = body.deleteData ? '?deleteData=true' : '';
  return apiJson<void>(`${pluginsBase(workspaceId)}/${encodeURIComponent(name)}${query}`, {
    method: 'DELETE',
    ...(body.deleteData !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
