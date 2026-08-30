import type {
  KnowledgeFileRecord,
  KnowledgeFileStatus,
  KnowledgeHit,
  KnowledgeIndexState,
  KnowledgeRootRecord,
  KnowledgeSettings,
  KnowledgeStats,
  MemoryRecord,
  PinRecord,
  SemanticScope,
  UpsertKnowledgeRootRequest,
  UpsertKnowledgeSettingsRequest,
} from '@studio/shared';
import { queryOptions } from '@tanstack/react-query';

import { apiJson } from './client';

export type UpsertPinBody = {
  text: string;
};

export type UpsertSemanticBody = {
  scope: SemanticScope;
  text: string;
  key?: string;
  threadId?: string;
};

export type ListSemanticParams = {
  scope?: SemanticScope;
  limit?: number;
};

export function agentPinsQueryKey(workspaceId: string, agentId: string) {
  return ['workspaces', workspaceId, 'agents', agentId, 'pins'] as const;
}

export function agentSemanticQueryKey(workspaceId: string, agentId: string, scope?: SemanticScope) {
  return ['workspaces', workspaceId, 'agents', agentId, 'semantic', scope ?? 'all'] as const;
}

export function listAgentPins(workspaceId: string, agentId: string) {
  return apiJson<PinRecord[]>(`/api/workspaces/${workspaceId}/agents/${agentId}/pins`);
}

export function upsertAgentPin(
  workspaceId: string,
  agentId: string,
  key: string,
  body: UpsertPinBody,
) {
  return apiJson<PinRecord>(
    `/api/workspaces/${workspaceId}/agents/${agentId}/pins/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
}

export function deleteAgentPin(workspaceId: string, agentId: string, key: string) {
  return apiJson<void>(
    `/api/workspaces/${workspaceId}/agents/${agentId}/pins/${encodeURIComponent(key)}`,
    { method: 'DELETE' },
  );
}

export function agentPinsQuery(workspaceId: string, agentId: string) {
  return queryOptions({
    queryKey: agentPinsQueryKey(workspaceId, agentId),
    queryFn: () => listAgentPins(workspaceId, agentId),
    staleTime: 10_000,
  });
}

export function listAgentSemantic(
  workspaceId: string,
  agentId: string,
  params: ListSemanticParams = {},
) {
  const search = new URLSearchParams();
  if (params.scope) {
    search.set('scope', params.scope);
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  const query = search.toString();
  const suffix = query ? `?${query}` : '';
  return apiJson<MemoryRecord[]>(
    `/api/workspaces/${workspaceId}/agents/${agentId}/semantic${suffix}`,
  );
}

export function upsertAgentSemantic(
  workspaceId: string,
  agentId: string,
  body: UpsertSemanticBody,
) {
  return apiJson<MemoryRecord>(`/api/workspaces/${workspaceId}/agents/${agentId}/semantic`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteAgentSemantic(workspaceId: string, agentId: string, id: string) {
  return apiJson<void>(`/api/workspaces/${workspaceId}/agents/${agentId}/semantic/${id}`, {
    method: 'DELETE',
  });
}

export function agentSemanticQuery(
  workspaceId: string,
  agentId: string,
  params: ListSemanticParams = {},
) {
  return queryOptions({
    queryKey: agentSemanticQueryKey(workspaceId, agentId, params.scope),
    queryFn: () => listAgentSemantic(workspaceId, agentId, params),
    staleTime: 10_000,
  });
}

export type SearchKnowledgeParams = {
  query: string;
  limit?: number;
};

export type ListKnowledgeFilesParams = {
  status?: KnowledgeFileStatus;
};

export function knowledgeRootsQueryKey(workspaceId: string) {
  return ['workspaces', workspaceId, 'knowledge', 'roots'] as const;
}

export function knowledgeStatsQueryKey(workspaceId: string) {
  return ['workspaces', workspaceId, 'knowledge', 'stats'] as const;
}

export function knowledgeSettingsQueryKey(workspaceId: string) {
  return ['workspaces', workspaceId, 'knowledge', 'settings'] as const;
}

export function knowledgeFilesQueryKey(workspaceId: string, status?: KnowledgeFileStatus) {
  return ['workspaces', workspaceId, 'knowledge', 'files', status ?? 'all'] as const;
}

export function knowledgeIndexStateQueryKey(workspaceId: string) {
  return ['workspaces', workspaceId, 'knowledge', 'index-state'] as const;
}

export function listKnowledgeRoots(workspaceId: string) {
  return apiJson<KnowledgeRootRecord[]>(`/api/workspaces/${workspaceId}/knowledge/roots`);
}

export function upsertKnowledgeRoot(workspaceId: string, body: UpsertKnowledgeRootRequest) {
  return apiJson<KnowledgeRootRecord>(`/api/workspaces/${workspaceId}/knowledge/roots`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteKnowledgeRoot(workspaceId: string, path: string) {
  const query = new URLSearchParams({ path });
  return apiJson<void>(`/api/workspaces/${workspaceId}/knowledge/roots?${query}`, {
    method: 'DELETE',
  });
}

export function getKnowledgeSettings(workspaceId: string) {
  return apiJson<KnowledgeSettings>(`/api/workspaces/${workspaceId}/knowledge/settings`);
}

export function putKnowledgeSettings(workspaceId: string, body: UpsertKnowledgeSettingsRequest) {
  return apiJson<KnowledgeSettings>(`/api/workspaces/${workspaceId}/knowledge/settings`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function listKnowledgeFiles(workspaceId: string, params: ListKnowledgeFilesParams = {}) {
  const search = new URLSearchParams();
  if (params.status) {
    search.set('status', params.status);
  }
  const query = search.toString();
  const suffix = query ? `?${query}` : '';
  return apiJson<KnowledgeFileRecord[]>(`/api/workspaces/${workspaceId}/knowledge/files${suffix}`);
}

export function getKnowledgeIndexState(workspaceId: string) {
  return apiJson<KnowledgeIndexState>(`/api/workspaces/${workspaceId}/knowledge/index-state`);
}

export function watchKnowledgeIndexState(
  workspaceId: string,
  onState: (state: KnowledgeIndexState) => void,
): () => void {
  const source = new EventSource(`/api/workspaces/${workspaceId}/knowledge/index-state/stream`);
  source.addEventListener('index-state', (message: MessageEvent<string>) => {
    try {
      onState(JSON.parse(message.data) as KnowledgeIndexState);
    } catch {
      // ignore malformed frames
    }
  });
  return () => {
    source.close();
  };
}

export function getKnowledgeStats(workspaceId: string) {
  return apiJson<KnowledgeStats>(`/api/workspaces/${workspaceId}/knowledge/stats`);
}

export function reindexKnowledge(workspaceId: string) {
  return apiJson<KnowledgeIndexState>(`/api/workspaces/${workspaceId}/knowledge/reindex`, {
    method: 'POST',
  });
}

export function cancelKnowledgeIndex(workspaceId: string) {
  return apiJson<KnowledgeIndexState>(`/api/workspaces/${workspaceId}/knowledge/index/cancel`, {
    method: 'POST',
  });
}

export function searchKnowledge(workspaceId: string, params: SearchKnowledgeParams) {
  const search = new URLSearchParams({ query: params.query });
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  return apiJson<KnowledgeHit[]>(`/api/workspaces/${workspaceId}/knowledge/search?${search}`);
}

export function knowledgeRootsQuery(workspaceId: string) {
  return queryOptions({
    queryKey: knowledgeRootsQueryKey(workspaceId),
    queryFn: () => listKnowledgeRoots(workspaceId),
    staleTime: 10_000,
  });
}

export function knowledgeStatsQuery(workspaceId: string) {
  return queryOptions({
    queryKey: knowledgeStatsQueryKey(workspaceId),
    queryFn: () => getKnowledgeStats(workspaceId),
    staleTime: 10_000,
  });
}

export function knowledgeSettingsQuery(workspaceId: string) {
  return queryOptions({
    queryKey: knowledgeSettingsQueryKey(workspaceId),
    queryFn: () => getKnowledgeSettings(workspaceId),
    staleTime: 10_000,
  });
}

export function knowledgeFilesQuery(workspaceId: string, params: ListKnowledgeFilesParams = {}) {
  return queryOptions({
    queryKey: knowledgeFilesQueryKey(workspaceId, params.status),
    queryFn: () => listKnowledgeFiles(workspaceId, params),
    staleTime: 5_000,
  });
}

export function knowledgeIndexStateQuery(workspaceId: string) {
  return queryOptions({
    queryKey: knowledgeIndexStateQueryKey(workspaceId),
    queryFn: () => getKnowledgeIndexState(workspaceId),
    staleTime: 1_000,
  });
}
