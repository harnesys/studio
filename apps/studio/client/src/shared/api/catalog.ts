import type { StudioCatalog } from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';

import { apiJson } from './client';

export const catalogQueryKey = ['catalog'] as const;

export function getCatalog() {
  return apiJson<StudioCatalog>('/api/catalog');
}

export const catalogQuery = queryOptions({
  queryKey: catalogQueryKey,
  queryFn: getCatalog,
  staleTime: Number.POSITIVE_INFINITY,
});
