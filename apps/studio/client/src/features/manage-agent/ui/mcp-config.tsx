import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { Agent } from '@/entities/agent';
import { workspaceMcpQuery } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { Switch } from '@/shared/ui/switch';
import { updateAgentCapabilities } from '../model/update-agent';

import { Section } from './section';

export function McpConfig({ agent }: { agent: Agent }) {
  const { workspaceId } = useStudioLocation();
  const query = useQuery({
    ...workspaceMcpQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const catalog = query.data?.servers ?? [];
  const [saving, setSaving] = useState(false);

  async function toggle(serverId: string, enable: boolean) {
    if (!workspaceId || saving) {
      return;
    }
    const next = nextAllowlist(
      catalog.map((server) => server.serverId),
      agent.mcpServers,
      serverId,
      enable,
    );
    setSaving(true);
    try {
      await updateAgentCapabilities(workspaceId, agent.id, { mcpServers: next });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section label="MCP">
      {!query.isPending &&
        (catalog.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No servers in `.studio/mcp.json`.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {catalog.map((server) => {
              const checked =
                agent.mcpServers.length === 0 || agent.mcpServers.includes(server.serverId);
              const status = server.connected ? 'connected' : 'offline';
              return (
                <div key={server.serverId} className="flex items-start gap-2">
                  <Switch
                    size="sm"
                    className="mt-0.5"
                    checked={checked}
                    disabled={saving}
                    onCheckedChange={(value) => {
                      void toggle(server.serverId, Boolean(value));
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[12px] leading-snug">{server.serverId}</p>
                    <p className="truncate text-[11px] text-muted-foreground leading-snug">
                      {server.transport} · {server.toolCount} tools · {status}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
    </Section>
  );
}

function nextAllowlist(
  catalogNames: string[],
  current: string[],
  name: string,
  enable: boolean,
): string[] {
  const enabled = new Set(current.length === 0 ? catalogNames : current);
  if (enable) {
    enabled.add(name);
  } else {
    enabled.delete(name);
  }
  const next = catalogNames.filter((item) => enabled.has(item));
  return next.length === catalogNames.length ? [] : next;
}
