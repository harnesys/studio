import type { WindowHostRecord } from '@harnesys/studio-shared';
import { env } from '@/shared/config/env';
import { getWindowHosts } from './host-credential';
export type NodeRoute = {
  nodeId: string;
  hostId: string;
  baseUrl: string;
  credential: string;
};
export type StudioHostOnlineStatus = 'online' | 'offline';
const nodeRoutes = new Map<string, NodeRoute>();
const threadToNode = new Map<string, string>();
const runToNode = new Map<string, string>();
const hostStatus = new Map<string, StudioHostOnlineStatus>();
export function routeForNode(nodeId: string): NodeRoute | undefined {
  return nodeRoutes.get(nodeId);
}
export function rememberNodeRoute(route: NodeRoute): void {
  nodeRoutes.set(route.nodeId, route);
}
export function rememberThreadNode(threadId: string, nodeId: string): void {
  threadToNode.set(threadId, nodeId);
}
export function nodeIdForThread(threadId: string): string | undefined {
  return threadToNode.get(threadId);
}
export function rememberRunNode(runId: string, nodeId: string): void {
  runToNode.set(runId, nodeId);
}
export function nodeIdForRun(runId: string): string | undefined {
  return runToNode.get(runId);
}
export function forgetNodeRoutesForHost(hostId: string): void {
  for (const [nodeId, route] of nodeRoutes) {
    if (route.hostId === hostId) {
      nodeRoutes.delete(nodeId);
    }
  }
}
export function setHostOnlineStatus(hostId: string, status: StudioHostOnlineStatus): void {
  hostStatus.set(hostId, status);
}
export function getHostOnlineStatus(hostId: string): StudioHostOnlineStatus {
  return hostStatus.get(hostId) ?? 'online';
}
export function listHostOnlineStatuses(): Record<string, StudioHostOnlineStatus> {
  const out: Record<string, StudioHostOnlineStatus> = {};
  for (const [id, status] of hostStatus) {
    out[id] = status;
  }
  return out;
}
export function isLocalHostId(hostId: string): boolean {
  return hostId === 'local';
}
export function findWindowHost(hostId: string): WindowHostRecord | undefined {
  return getWindowHosts().find((host) => host.id === hostId);
}
export function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}
export function urlForHost(host: Pick<WindowHostRecord, 'id' | 'baseUrl'>, path: string): string {
  if (isLocalHostId(host.id)) {
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${env.localHostOrigin}${p}`;
  }
  const base = trimBaseUrl(host.baseUrl);
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}
export type ApiTarget = {
  url: string;
  credential: string | null;
  hostId: string;
};
export function resolveApiTarget(
  path: string,
  hint?: {
    nodeId?: string;
    hostId?: string;
  },
): ApiTarget {
  const pathname = path.split('?')[0] ?? path;
  const hosts = getWindowHosts();
  const local = hosts.find((host) => host.id === 'local') ?? hosts[0];
  let route: NodeRoute | undefined;
  if (hint?.nodeId) {
    route = routeForNode(hint.nodeId);
  } else if (hint?.hostId) {
    const host = findWindowHost(hint.hostId);
    if (host) {
      return {
        url: urlForHost(host, path),
        credential: host.credential,
        hostId: host.id,
      };
    }
  } else {
    const workspaceMatch = pathname.match(/^\/api\/workspaces\/([^/]+)(?:\/|$)/);
    if (workspaceMatch?.[1] && workspaceMatch[1] !== 'pick') {
      route = routeForNode(workspaceMatch[1]);
    } else {
      const threadMatch = pathname.match(/^\/api\/threads\/([^/]+)(?:\/|$)/);
      if (threadMatch?.[1]) {
        const nodeId = threadToNode.get(threadMatch[1]);
        if (nodeId) {
          route = routeForNode(nodeId);
        }
      } else {
        const runMatch = pathname.match(/^\/api\/runs\/([^/]+)(?:\/|$)/);
        if (runMatch?.[1]) {
          const nodeId = runToNode.get(runMatch[1]);
          if (nodeId) {
            route = routeForNode(nodeId);
          }
        }
      }
    }
  }
  if (route) {
    const host = findWindowHost(route.hostId);
    if (host) {
      return {
        url: urlForHost(host, path),
        credential: route.credential || host.credential,
        hostId: host.id,
      };
    }
    return {
      url: urlForHost({ id: route.hostId, baseUrl: route.baseUrl }, path),
      credential: route.credential,
      hostId: route.hostId,
    };
  }
  if (local) {
    return {
      url: urlForHost(local, path),
      credential: local.credential,
      hostId: local.id,
    };
  }
  return { url: path, credential: null, hostId: 'local' };
}
