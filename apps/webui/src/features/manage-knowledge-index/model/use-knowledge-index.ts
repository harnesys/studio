import type {
  KnowledgeFileStatus,
  KnowledgeIndexState,
  UpsertKnowledgeRootRequest,
  UpsertKnowledgeSettingsRequest,
} from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  cancelKnowledgeIndex,
  deleteKnowledgeRoot,
  knowledgeFilesQuery,
  knowledgeIndexStateQuery,
  knowledgeIndexStateQueryKey,
  knowledgeRootsQuery,
  knowledgeRootsQueryKey,
  knowledgeSettingsQuery,
  knowledgeSettingsQueryKey,
  knowledgeStatsQuery,
  knowledgeStatsQueryKey,
  putKnowledgeSettings,
  reindexKnowledge,
  upsertKnowledgeRoot,
} from '@/shared/api';
import { toast } from '@/shared/ui/toast';
export function useKnowledgeIndex(
  workspaceId: string | undefined,
  fileStatus?: KnowledgeFileStatus,
) {
  const queryClient = useQueryClient();
  const enabled = Boolean(workspaceId);
  const id = workspaceId ?? '';
  const settingsQuery = useQuery({
    ...knowledgeSettingsQuery(id),
    enabled,
  });
  const rootsQuery = useQuery({
    ...knowledgeRootsQuery(id),
    enabled,
  });
  const statsQuery = useQuery({
    ...knowledgeStatsQuery(id),
    enabled,
  });
  const indexStateQuery = useQuery({
    ...knowledgeIndexStateQuery(id),
    enabled,
  });
  const filesQuery = useQuery({
    ...knowledgeFilesQuery(id, { status: fileStatus }),
    enabled,
  });
  async function invalidateAll() {
    if (!workspaceId) {
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: knowledgeSettingsQueryKey(workspaceId) }),
      queryClient.invalidateQueries({ queryKey: knowledgeRootsQueryKey(workspaceId) }),
      queryClient.invalidateQueries({ queryKey: knowledgeStatsQueryKey(workspaceId) }),
      queryClient.invalidateQueries({ queryKey: knowledgeIndexStateQueryKey(workspaceId) }),
      queryClient.invalidateQueries({
        queryKey: ['workspaces', workspaceId, 'knowledge', 'files'],
      }),
    ]);
  }
  function setIndexState(state: KnowledgeIndexState) {
    if (!workspaceId) {
      return;
    }
    queryClient.setQueryData(knowledgeIndexStateQueryKey(workspaceId), state);
  }
  const saveSettings = useMutation({
    mutationFn: (body: UpsertKnowledgeSettingsRequest) => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return putKnowledgeSettings(workspaceId, body);
    },
    onSuccess: (settings) => {
      if (!workspaceId) {
        return;
      }
      queryClient.setQueryData(knowledgeSettingsQueryKey(workspaceId), settings);
    },
    onError: (error) => {
      toast.add({
        title: 'Failed to save settings',
        description: error instanceof ApiError ? error.message : 'Request failed',
      });
    },
  });
  const upsertRoot = useMutation({
    mutationFn: (body: UpsertKnowledgeRootRequest) => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return upsertKnowledgeRoot(workspaceId, body);
    },
    onSuccess: async (root) => {
      await invalidateAll();
      toast.add({ title: 'Knowledge root saved', description: root.path });
    },
    onError: (error) => {
      toast.add({
        title: 'Failed to save root',
        description: error instanceof ApiError ? error.message : 'Request failed',
      });
    },
  });
  const removeRoot = useMutation({
    mutationFn: (path: string) => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return deleteKnowledgeRoot(workspaceId, path);
    },
    onSuccess: async (_result, path) => {
      await invalidateAll();
      toast.add({ title: 'Knowledge root removed', description: path });
    },
  });
  const reindex = useMutation({
    mutationFn: () => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return reindexKnowledge(workspaceId);
    },
    onSuccess: async (state) => {
      setIndexState(state);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: knowledgeStatsQueryKey(id) }),
        queryClient.invalidateQueries({
          queryKey: ['workspaces', workspaceId, 'knowledge', 'files'],
        }),
      ]);
      toast.add({ title: 'Reindex started' });
    },
    onError: (error) => {
      toast.add({
        title: 'Reindex failed',
        description: error instanceof ApiError ? error.message : 'Request failed',
      });
    },
  });
  const cancel = useMutation({
    mutationFn: () => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return cancelKnowledgeIndex(workspaceId);
    },
    onSuccess: async (state) => {
      setIndexState(state);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: knowledgeStatsQueryKey(id) }),
        queryClient.invalidateQueries({
          queryKey: ['workspaces', workspaceId, 'knowledge', 'files'],
        }),
      ]);
      toast.add({ title: 'Indexing cancelled' });
    },
    onError: (error) => {
      toast.add({
        title: 'Cancel failed',
        description: error instanceof ApiError ? error.message : 'Request failed',
      });
    },
  });
  return {
    settingsQuery,
    rootsQuery,
    statsQuery,
    indexStateQuery,
    filesQuery,
    saveSettings,
    upsertRoot,
    removeRoot,
    reindex,
    cancel,
    invalidateAll,
  };
}
