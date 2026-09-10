import type {
  DiscoveredModelView,
  Driver,
  ImportProvidersSummary,
  ProviderExportBundle,
  ProviderModelPublic,
  ProviderPublic,
} from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';

import { apiJson } from './client';

export type CreateProviderInput = {
  name: string;
  driver: Driver;
  apiUrl?: string;
  apiKey?: string;
  enabled?: boolean;
};

export type UpdateProviderInput = {
  name?: string;
  driver?: Driver;
  apiUrl?: string | null;
  apiKey?: string | null;
  enabled?: boolean;
};

export type AttachProviderModelInput = {
  name: string;
  kind?: string;
  metadata?: unknown;
};

export type UpdateProviderModelInput = {
  name?: string;
  kind?: string;
  metadata?: unknown;
};

export const providersQueryKey = ['providers'] as const;

export function listProviders() {
  return apiJson<ProviderPublic[]>('/api/providers');
}

export function createProvider(input: CreateProviderInput) {
  return apiJson<ProviderPublic>('/api/providers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProvider(id: string, input: UpdateProviderInput) {
  return apiJson<ProviderPublic>(`/api/providers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteProvider(id: string) {
  return apiJson<void>(`/api/providers/${id}`, { method: 'DELETE' });
}

export function exportProviders() {
  return apiJson<ProviderExportBundle>('/api/providers/export');
}

export function importProviders(bundle: ProviderExportBundle) {
  return apiJson<ImportProvidersSummary>('/api/providers/import', {
    method: 'POST',
    body: JSON.stringify(bundle),
  });
}

export function discoverProviderModels(id: string) {
  return apiJson<{ found: DiscoveredModelView[] }>(`/api/providers/${id}/discover`, {
    method: 'POST',
  });
}

export function attachProviderModel(providerId: string, input: AttachProviderModelInput) {
  return apiJson<ProviderModelPublic>(`/api/providers/${providerId}/models`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProviderModel(
  providerId: string,
  modelId: string,
  input: UpdateProviderModelInput,
) {
  return apiJson<ProviderModelPublic>(`/api/providers/${providerId}/models/${modelId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function detachProviderModel(providerId: string, modelId: string) {
  return apiJson<void>(`/api/providers/${providerId}/models/${modelId}`, { method: 'DELETE' });
}

export const providersQuery = queryOptions({
  queryKey: providersQueryKey,
  queryFn: listProviders,
});
