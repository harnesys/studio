import type { WorkspaceMcpConfigServer, WorkspaceMcpServer } from '@harnesys/studio-shared';
export type McpServerStatusChip = string | undefined;
export function pluginServerTitle(serverId: string, pluginName: string): string {
  const prefix = `plugin:${pluginName}:`;
  return serverId.startsWith(prefix) ? serverId.slice(prefix.length) : serverId;
}
export function pluginServerPointer(serverId: string, pluginName: string): string {
  return pluginServerTitle(serverId, pluginName);
}
export function serverSummary(
  server: WorkspaceMcpConfigServer,
  live: WorkspaceMcpServer | undefined,
  statusChip: McpServerStatusChip,
): string {
  const { origin } = server;
  if (server.disabledByUser) {
    return 'stopped by you · approval kept · start to load tools';
  }
  if (origin.kind === 'plugin' && origin.status === 'blocked_by_grant') {
    if (origin.inertReason === 'needs_server_approval') {
      return 'blocked · needs server approval';
    }
    if (server.requiredGrant) {
      return `blocked · needs grant: ${server.requiredGrant}`;
    }
    if (statusChip) {
      return 'blocked · grant required';
    }
  }
  if (origin.kind === 'plugin' && origin.status !== 'native' && statusChip) {
    return `${origin.status} · see plugin diagnostics`;
  }
  return `${server.toolCount} ${server.toolCount === 1 ? 'tool' : 'tools'}${live?.resources.length ? ` · ${live.resources.length} resources` : ''}${!server.enabled ? ' · disabled in .harnesys/mcp.json' : ''}`;
}
export function serverStatusHint(server: WorkspaceMcpConfigServer): string {
  if (server.disabledByUser) {
    return 'Stopped — start it to load tools.';
  }
  const { origin } = server;
  if (origin.kind === 'plugin' && origin.status === 'blocked_by_grant') {
    if (origin.inertReason === 'needs_server_approval') {
      return 'Waiting for one-time server approval — press Approve.';
    }
    return `Waiting for grant${server.requiredGrant ? `: ${server.requiredGrant}` : ''} — allow it in the Plugins tab.`;
  }
  return server.enabled
    ? 'Not loaded in this session — reload to connect.'
    : 'Disabled — enable it to load tools.';
}
export function shortToolName(name: string): string {
  return name.includes('__') ? name.split('__').slice(1).join('__') : name;
}
