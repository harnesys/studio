import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AttachProviderModelInput,
  attachProviderModel,
  createProvider,
  deleteProvider,
  detachProviderModel,
  discoverProviderModels,
  providersQuery,
  providersQueryKey,
  type UpdateProviderInput,
  type UpdateProviderModelInput,
  updateProvider,
  updateProviderModel,
} from '@/shared/api';

export function useProviders() {
  return useQuery(providersQuery);
}

export function useCreateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProvider,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKey }),
  });
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateProviderInput & { id: string }) =>
      updateProvider(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKey }),
  });
}

export function useDeleteProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProvider,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKey }),
  });
}

export function useDiscoverProviderModels() {
  return useMutation({
    mutationFn: discoverProviderModels,
  });
}

export function useAttachProviderModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, ...input }: { providerId: string } & AttachProviderModelInput) =>
      attachProviderModel(providerId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKey }),
  });
}

export function useUpdateProviderModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      providerId,
      modelId,
      ...input
    }: { providerId: string; modelId: string } & UpdateProviderModelInput) =>
      updateProviderModel(providerId, modelId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKey }),
  });
}

export function useDetachProviderModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, modelId }: { providerId: string; modelId: string }) =>
      detachProviderModel(providerId, modelId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKey }),
  });
}
