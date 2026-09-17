import { useQuery } from '@tanstack/react-query';

import type { Agent } from '@/entities/agent';
import { workspaceMcpQuery } from '@/shared/api';
import { studioFocusWorkspaceId, useStudioLocation } from '@/shared/config/location';
import { StatusDot, type StatusDotTone } from '@/shared/ui/status-dot';

import { Section } from './section';

export function McpInspector({ agent }: { agent: Agent }) {
  const workspaceId = studioFocusWorkspaceId(useStudioLocation());
  const query = useQuery({
    ...workspaceMcpQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const catalog = query.data?.servers ?? [];

  return (
    <Section label="MCP">
      {!query.isPending &&
        (catalog.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No servers in `.harnesys/mcp.json`.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {catalog.map((server) => {
              const enabled = agent.mcpServers.includes(server.serverId);
              const status = mcpStatus(enabled, server.connected);
              return (
                <div key={server.serverId} className="flex items-center gap-2">
                  <StatusDot tone={status.tone} label={status.text} />
                  <span className="min-w-0 truncate font-medium text-[12px]">
                    {server.serverId}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {status.text}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
    </Section>
  );
}

function mcpStatus(
  enabled: boolean,
  connected: boolean,
): { tone: StatusDotTone; text: 'connected' | 'offline' | 'off' } {
  if (!enabled) {
    return { tone: 'off', text: 'off' };
  }
  if (connected) {
    return { tone: 'live', text: 'connected' };
  }
  return { tone: 'idle', text: 'offline' };
}
