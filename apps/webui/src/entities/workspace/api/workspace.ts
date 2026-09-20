import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspace,
  deleteWorkspace,
  pickWorkspaceFolder,
  updateWorkspace,
  wipeWorkspace,
  workspacesQuery,
  workspacesQueryKey,
} from '@/shared/api';
export function useWorkspaces() {
  return useQuery(workspacesQuery);
}
export function usePickWorkspaceFolder() {
  return useMutation({
    mutationFn: pickWorkspaceFolder,
  });
}
export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { path?: string; name?: string; hostId?: string }) =>
      createWorkspace(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspacesQueryKey });
    },
  });
}
export function useUpdateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      path?: string;
      color?: string | null;
    }) => updateWorkspace(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspacesQueryKey });
    },
  });
}
export function useDeleteWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteWorkspace,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspacesQueryKey });
    },
  });
}
export function useWipeWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, wipeFolder }: { id: string; wipeFolder?: boolean }) =>
      wipeWorkspace(id, { wipeFolder }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspacesQueryKey });
    },
  });
}
