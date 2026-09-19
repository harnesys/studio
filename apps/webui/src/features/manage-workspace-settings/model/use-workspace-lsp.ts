import type { WorkspaceLspListResponse } from '@harnesys/studio-shared';
import { useCallback, useEffect, useState } from 'react';

import { apiJson } from '@/shared/api';

function lspBase(workspaceId: string): string {
  return `/api/workspaces/${workspaceId}/lsp`;
}

export type UseWorkspaceLsp = {
  data: WorkspaceLspListResponse | undefined;
  isPending: boolean;
  error: string | null;
  restart: (serverId: string) => Promise<void>;
  stop: (serverId: string) => Promise<void>;
  saveRaw: (rawText: string) => Promise<void>;
  applyPreset: (lang: string) => Promise<void>;
};

/**
 * Workspace LSP lifecycle state (spec §2). Lists on mount; every mutation
 * returns the merged list, which replaces local state (no separate refetch).
 */
export function useWorkspaceLsp(workspaceId: string): UseWorkspaceLsp {
  const [data, setData] = useState<WorkspaceLspListResponse | undefined>(undefined);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsPending(true);
    setError(null);
    apiJson<WorkspaceLspListResponse>(lspBase(workspaceId)).then(
      (list) => {
        if (!cancelled) {
          setData(list);
          setIsPending(false);
        }
      },
      (fetchError) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load LSP servers');
          setIsPending(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const restart = useCallback(
    async (serverId: string) => {
      const list = await apiJson<WorkspaceLspListResponse>(
        `${lspBase(workspaceId)}/${encodeURIComponent(serverId)}/restart`,
        { method: 'POST' },
      );
      setData(list);
    },
    [workspaceId],
  );

  const stop = useCallback(
    async (serverId: string) => {
      const list = await apiJson<WorkspaceLspListResponse>(
        `${lspBase(workspaceId)}/${encodeURIComponent(serverId)}/stop`,
        { method: 'POST' },
      );
      setData(list);
    },
    [workspaceId],
  );

  const saveRaw = useCallback(
    async (rawText: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText) as unknown;
      } catch {
        throw new Error('Invalid JSON: raw LSP config must parse as JSON');
      }
      const list = await apiJson<WorkspaceLspListResponse>(lspBase(workspaceId), {
        method: 'PUT',
        body: JSON.stringify(parsed),
      });
      setData(list);
    },
    [workspaceId],
  );

  const applyPreset = useCallback(
    async (lang: string) => {
      const list = await apiJson<WorkspaceLspListResponse>(
        `${lspBase(workspaceId)}/preset/${encodeURIComponent(lang)}`,
        { method: 'POST' },
      );
      setData(list);
    },
    [workspaceId],
  );

  return { data, isPending, error, restart, stop, saveRaw, applyPreset };
}
