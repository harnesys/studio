import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AttachProviderModelInput,
  attachProviderModel,
  createProvider,
  deleteProvider,
  detachProviderModel,
  discoverProviderModels,
  exportProviders,
  importProviders,
  providersQuery,
  providersQueryKeyFor,
  type UpdateProviderInput,
  type UpdateProviderModelInput,
  updateProvider,
  updateProviderModel,
} from '@/shared/api';

export function useProviders(workspaceId: string) {
  return useQuery(providersQuery(workspaceId));
}

export function useCreateProvider(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createProvider>[1]) => createProvider(workspaceId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKeyFor(workspaceId) }),
  });
}

export function useUpdateProvider(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateProviderInput & { id: string }) =>
      updateProvider(workspaceId, id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKeyFor(workspaceId) }),
  });
}

export function useDeleteProvider(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProvider(workspaceId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKeyFor(workspaceId) }),
  });
}

export function useDiscoverProviderModels(workspaceId: string) {
  return useMutation({
    mutationFn: (id: string) => discoverProviderModels(workspaceId, id),
  });
}

export function useAttachProviderModel(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, ...input }: { providerId: string } & AttachProviderModelInput) =>
      attachProviderModel(workspaceId, providerId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKeyFor(workspaceId) }),
  });
}

export function useUpdateProviderModel(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      providerId,
      modelId,
      ...input
    }: { providerId: string; modelId: string } & UpdateProviderModelInput) =>
      updateProviderModel(workspaceId, providerId, modelId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKeyFor(workspaceId) }),
  });
}

export function useDetachProviderModel(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, modelId }: { providerId: string; modelId: string }) =>
      detachProviderModel(workspaceId, providerId, modelId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKeyFor(workspaceId) }),
  });
}

export function useExportProviders(workspaceId: string) {
  return useMutation({
    mutationFn: () => exportProviders(workspaceId),
  });
}

export function useImportProviders(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bundle: Parameters<typeof importProviders>[1]) =>
      importProviders(workspaceId, bundle),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKeyFor(workspaceId) }),
  });
}
