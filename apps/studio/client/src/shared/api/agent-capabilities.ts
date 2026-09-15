import type { AgentCapabilitiesView } from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';

import { apiJson } from './client';

export type { AgentCapabilitiesView };

export function agentCapabilitiesQueryKey(agentId: string, workspaceId = '') {
  return ['agents', agentId, 'capabilities', workspaceId] as const;
}

export function getAgentCapabilities(agentId: string, workspaceId?: string) {
  const suffix = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  return apiJson<AgentCapabilitiesView>(
    `/api/agents/${encodeURIComponent(agentId)}/capabilities${suffix}`,
  );
}

export function agentCapabilitiesQuery(agentId: string | null, workspaceId = '') {
  return queryOptions({
    queryKey: agentCapabilitiesQueryKey(agentId ?? 'new', workspaceId),
    queryFn: () => getAgentCapabilities(agentId as string, workspaceId || undefined),
    enabled: Boolean(agentId),
    staleTime: 15_000,
  });
}
