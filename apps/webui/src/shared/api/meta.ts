import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export type AppMeta = { version: string };

export function getAppMeta() {
  return apiJson<AppMeta>('/api/meta');
}

export const appMetaQuery = queryOptions({
  queryKey: ['app-meta'],
  queryFn: getAppMeta,
  staleTime: Number.POSITIVE_INFINITY,
});
