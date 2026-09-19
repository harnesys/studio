import type {
  AddPluginRegistryRequest,
  PluginCatalogEntry,
  PluginRegistrySummary,
} from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export type { AddPluginRegistryRequest, PluginCatalogEntry, PluginRegistrySummary };
export const pluginRegistriesQueryKey = ['plugin-registries'] as const;
export const pluginCatalogQueryKey = ['plugin-catalog'] as const;
export function listPluginRegistries() {
  return apiJson<PluginRegistrySummary[]>('/api/plugin-registries');
}
export function pluginRegistriesQuery() {
  return queryOptions({
    queryKey: pluginRegistriesQueryKey,
    queryFn: listPluginRegistries,
    staleTime: 20000,
  });
}
export function addPluginRegistry(body: AddPluginRegistryRequest) {
  return apiJson<PluginRegistrySummary>('/api/plugin-registries', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
export function refreshPluginRegistry(id: string) {
  return apiJson<PluginRegistrySummary>(
    `/api/plugin-registries/${encodeURIComponent(id)}/refresh`,
    { method: 'POST', body: '{}' },
  );
}
export function removePluginRegistry(id: string) {
  return apiJson<void>(`/api/plugin-registries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
export function listPluginCatalog(params: { q?: string; registryId?: string } = {}) {
  const search = new URLSearchParams();
  if (params.q) {
    search.set('q', params.q);
  }
  if (params.registryId) {
    search.set('registryId', params.registryId);
  }
  const query = search.toString();
  return apiJson<PluginCatalogEntry[]>(`/api/plugin-catalog${query ? `?${query}` : ''}`);
}
export function pluginCatalogQuery(params: { q?: string; registryId?: string } = {}) {
  return queryOptions({
    queryKey: [...pluginCatalogQueryKey, params.q ?? '', params.registryId ?? ''] as const,
    queryFn: () => listPluginCatalog(params),
    staleTime: 20000,
  });
}
