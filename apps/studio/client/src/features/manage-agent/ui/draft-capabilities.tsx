import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Agent } from '@/entities/agent';
import {
  type WorkspaceMcpServer,
  type WorkspaceTool,
  workspaceMcpQuery,
  workspaceSkillsQuery,
  workspaceToolsQuery,
} from '@/shared/api';
import { Switch } from '@/shared/ui/switch';

import type { AgentCapabilitiesDraft } from '../model/agent-config';
import { ConfigEntityCard, initialsFromLabel } from './config-entity-card';

export type DraftCapabilitiesSection = 'skills' | 'mcp';

export function DraftCapabilities({
  agent,
  workspaceId,
  section,
  onChange,
}: {
  agent: Agent | null;
  workspaceId: string;
  section: DraftCapabilitiesSection;
  onChange: (snapshot: AgentCapabilitiesDraft) => void;
}) {
  const [skills, setSkills] = useState(() => agent?.skills ?? []);
  const [tools, setTools] = useState(() => agent?.tools ?? []);
  const [mcpServers, setMcpServers] = useState(() => agent?.mcpServers ?? []);
  const [expandedServerId, setExpandedServerId] = useState<string | null>(null);
  const skillsQuery = useQuery({
    ...workspaceSkillsQuery(workspaceId),
    enabled: Boolean(workspaceId) && section === 'skills',
  });
  const toolsQuery = useQuery({
    ...workspaceToolsQuery(workspaceId),
    enabled: Boolean(workspaceId) && section === 'mcp',
  });
  const mcpQuery = useQuery({
    ...workspaceMcpQuery(workspaceId),
    enabled: Boolean(workspaceId) && section === 'mcp',
  });
  const skillCatalog = skillsQuery.data?.skills ?? [];
  const skillNames = skillCatalog.map((skill) => skill.name);
  const toolNames = (toolsQuery.data?.tools ?? []).map((tool) => tool.name);
  const servers = mcpQuery.data?.servers ?? [];

  function toggleSkill(name: string, enable: boolean) {
    const next = nextAllowlist(skillNames, skills, name, enable);
    setSkills(next);
    onChange({ skills: next, tools, mcpServers });
  }

  function toggleTool(name: string, enable: boolean) {
    const next = nextAllowlist(toolNames, tools, name, enable);
    setTools(next);
    onChange({ skills, tools: next, mcpServers });
  }

  function toggleServer(serverId: string, enable: boolean) {
    const next = nextAllowlist(
      servers.map((server) => server.serverId),
      mcpServers,
      serverId,
      enable,
    );
    setMcpServers(next);
    onChange({ skills, tools, mcpServers: next });
  }

  return (
    <div className="flex flex-col gap-3">
      {section === 'skills' ? (
        <section className="flex flex-col gap-2">
          {!skillsQuery.isPending && skillNames.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-sm">
              No skills in `.harnesys/skills`.
            </p>
          ) : null}
          {!skillsQuery.isPending && skillNames.length > 0 ? (
            <div className="flex flex-col gap-2">
              {skillCatalog.map((skill) => (
                <ConfigEntityCard
                  key={skill.name}
                  title={skill.name}
                  badge="skill"
                  description={skill.description || skill.whenToUse}
                  initials={initialsFromLabel(skill.name)}
                  trailing={
                    <Switch
                      size="sm"
                      checked={isChecked(skills, skill.name)}
                      onCheckedChange={(value) => toggleSkill(skill.name, Boolean(value))}
                    />
                  }
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {section === 'mcp' ? (
        <section className="flex flex-col gap-2">
          {!mcpQuery.isPending && servers.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-sm">
              No servers in `.harnesys/mcp.json`.
            </p>
          ) : null}
          {!mcpQuery.isPending && servers.length > 0 ? (
            <div className="flex flex-col gap-2">
              {servers.map((server) => {
                const expanded = expandedServerId === server.serverId;
                const enabled = isChecked(mcpServers, server.serverId);
                return (
                  <McpServerCard
                    key={server.serverId}
                    server={server}
                    enabled={enabled}
                    expanded={expanded}
                    toolsAllowlist={tools}
                    toolsReady={Boolean(toolsQuery.data) && !toolsQuery.isPending}
                    onToggleServer={(next) => toggleServer(server.serverId, next)}
                    onToggleExpand={() =>
                      setExpandedServerId((current) =>
                        current === server.serverId ? null : server.serverId,
                      )
                    }
                    onToggleTool={toggleTool}
                  />
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function McpServerCard({
  server,
  enabled,
  expanded,
  toolsAllowlist,
  toolsReady,
  onToggleServer,
  onToggleExpand,
  onToggleTool,
}: {
  server: WorkspaceMcpServer;
  enabled: boolean;
  expanded: boolean;
  toolsAllowlist: string[];
  toolsReady: boolean;
  onToggleServer: (enable: boolean) => void;
  onToggleExpand: () => void;
  onToggleTool: (name: string, enable: boolean) => void;
}) {
  const status = server.connected ? 'connected' : 'offline';
  return (
    <ConfigEntityCard
      title={server.serverId}
      badge={server.transport}
      description={`${server.toolCount} tools · ${status}`}
      initials={initialsFromLabel(server.serverId)}
      monoTitle
      expanded={expanded}
      onClick={onToggleExpand}
      trailing={
        <Switch
          size="sm"
          checked={enabled}
          onCheckedChange={(value) => onToggleServer(Boolean(value))}
        />
      }
    >
      <McpToolsList
        tools={server.tools}
        enabled={enabled}
        allowlist={toolsAllowlist}
        toolsReady={toolsReady}
        onToggleTool={onToggleTool}
      />
    </ConfigEntityCard>
  );
}

function McpToolsList({
  tools,
  enabled,
  allowlist,
  toolsReady,
  onToggleTool,
}: {
  tools: WorkspaceTool[];
  enabled: boolean;
  allowlist: string[];
  toolsReady: boolean;
  onToggleTool: (name: string, enable: boolean) => void;
}) {
  if (tools.length === 0) {
    return <p className="text-muted-foreground text-xs">No tools on this server.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">Tools</p>
      {!toolsReady ? <p className="text-muted-foreground text-xs">Loading tool catalog…</p> : null}
      {tools.map((tool) => {
        const shortName = tool.name.includes('__')
          ? tool.name.split('__').slice(1).join('__')
          : tool.name;
        return (
          <div key={tool.name} className="flex items-start gap-2 rounded-md px-1 py-1">
            <Switch
              size="sm"
              className="mt-0.5"
              checked={enabled && isChecked(allowlist, tool.name)}
              disabled={!enabled || !toolsReady}
              onCheckedChange={(value) => onToggleTool(tool.name, Boolean(value))}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[12px] leading-snug">{shortName}</p>
              {tool.description ? (
                <p className="line-clamp-2 text-[11px] text-muted-foreground leading-snug">
                  {tool.description}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function isChecked(allowlist: string[], name: string): boolean {
  return allowlist.length === 0 || allowlist.includes(name);
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
