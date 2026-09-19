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

export function providersQueryKeyFor(workspaceId: string) {
  return [...providersQueryKey, workspaceId] as const;
}

function providersBase(workspaceId: string) {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/providers`;
}

export function listProviders(workspaceId: string) {
  return apiJson<ProviderPublic[]>(providersBase(workspaceId));
}

export function createProvider(workspaceId: string, input: CreateProviderInput) {
  return apiJson<ProviderPublic>(providersBase(workspaceId), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProvider(workspaceId: string, id: string, input: UpdateProviderInput) {
  return apiJson<ProviderPublic>(`${providersBase(workspaceId)}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteProvider(workspaceId: string, id: string) {
  return apiJson<void>(`${providersBase(workspaceId)}/${id}`, { method: 'DELETE' });
}

export function exportProviders(workspaceId: string) {
  return apiJson<ProviderExportBundle>(`${providersBase(workspaceId)}/export`);
}

export function importProviders(workspaceId: string, bundle: ProviderExportBundle) {
  return apiJson<ImportProvidersSummary>(`${providersBase(workspaceId)}/import`, {
    method: 'POST',
    body: JSON.stringify(bundle),
  });
}

export function discoverProviderModels(workspaceId: string, id: string) {
  return apiJson<{ found: DiscoveredModelView[] }>(`${providersBase(workspaceId)}/${id}/discover`, {
    method: 'POST',
  });
}

export function attachProviderModel(
  workspaceId: string,
  providerId: string,
  input: AttachProviderModelInput,
) {
  return apiJson<ProviderModelPublic>(`${providersBase(workspaceId)}/${providerId}/models`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProviderModel(
  workspaceId: string,
  providerId: string,
  modelId: string,
  input: UpdateProviderModelInput,
) {
  return apiJson<ProviderModelPublic>(
    `${providersBase(workspaceId)}/${providerId}/models/${modelId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

export function detachProviderModel(workspaceId: string, providerId: string, modelId: string) {
  return apiJson<void>(`${providersBase(workspaceId)}/${providerId}/models/${modelId}`, {
    method: 'DELETE',
  });
}

export function providersQuery(workspaceId: string) {
  return queryOptions({
    queryKey: providersQueryKeyFor(workspaceId),
    queryFn: () => listProviders(workspaceId),
    enabled: Boolean(workspaceId),
  });
}
