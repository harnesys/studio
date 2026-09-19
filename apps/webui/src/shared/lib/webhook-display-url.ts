import { findWindowHost, routeForNode, trimBaseUrl } from '@/shared/api/host-router';
export function webhookDisplayUrl(endpoint: string, workspaceId: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }
  const route = routeForNode(workspaceId);
  const host = route ? findWindowHost(route.hostId) : undefined;
  const base = host?.baseUrl ? trimBaseUrl(host.baseUrl) : '';
  if (!base) {
    return endpoint;
  }
  return endpoint.startsWith('/') ? `${base}${endpoint}` : `${base}/${endpoint}`;
}
