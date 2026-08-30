import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useParams } from 'react-router';

import { knowledgeIndexStateQueryKey, watchKnowledgeIndexState } from '@/shared/api';

export function KnowledgeIndexSync() {
  const { workspaceId } = useParams();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    return watchKnowledgeIndexState(workspaceId, (state) => {
      queryClient.setQueryData(knowledgeIndexStateQueryKey(workspaceId), state);
    });
  }, [workspaceId, queryClient]);

  return null;
}
