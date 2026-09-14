import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import {
  type WorkspaceTool,
  workspaceMcpQuery,
  workspaceSkillsQuery,
  workspaceToolsQuery,
} from '@/shared/api';
import { Pane, Row, RowItem, RowList, RowSection } from '@/shared/ui/capability-rows';
import { Switch } from '@/shared/ui/switch';

import type { AgentCapabilitiesDraft } from '../model/agent-config';
import {
  isChecked,
  mcpServerPluginOf,
  nextAllowlist,
  skillPluginOf,
  stripPluginPrefix,
} from '../model/capability-allowlist';

export type DraftCapabilitiesSection = 'skills' | 'mcp';

type Group<T> = { plugin: string | null; label: string; items: T[] };

/**
 * Direct installs first, then one section per plugin the agent has enabled.
 * Items contributed by a plugin the agent turned off are hidden entirely.
 */
function buildGroups<T>(
  items: T[],
  pluginOf: (item: T) => string | null,
  enabledPlugins: Record<string, boolean>,
): Group<T>[] {
  const direct: T[] = [];
  const byPlugin = new Map<string, T[]>();
  for (const item of items) {
    const plugin = pluginOf(item);
    if (plugin === null) {
      direct.push(item);
    } else {
      if (enabledPlugins[plugin] !== true) {
        continue;
      }
      const bucket = byPlugin.get(plugin);
      if (bucket) {
        bucket.push(item);
      } else {
        byPlugin.set(plugin, [item]);
      }
    }
  }
  const groups: Group<T>[] = [{ plugin: null, label: 'Direct', items: direct }];
  for (const [plugin, bucket] of [...byPlugin].sort((a, b) => a[0].localeCompare(b[0]))) {
    groups.push({ plugin, label: plugin, items: bucket });
  }
  return groups;
}

export function DraftCapabilities({
  workspaceId,
  section,
  capabilities,
  onPatch,
}: {
  workspaceId: string;
  section: DraftCapabilitiesSection;
  capabilities: AgentCapabilitiesDraft;
  onPatch: (patch: Partial<AgentCapabilitiesDraft>) => void;
}) {
  const skills = capabilities.skills ?? [];
  const tools = capabilities.tools ?? [];
  const mcpServers = capabilities.mcpServers ?? [];
  const enabledPlugins = capabilities.enabledPlugins ?? {};
  const [expandedServerId, setExpandedServerId] = useState<string | null>(null);
  const [expandedSkillName, setExpandedSkillName] = useState<string | null>(null);
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
    onPatch({ skills: nextAllowlist(skillNames, skills, name, enable) });
  }

  function toggleTool(name: string, enable: boolean) {
    onPatch({ tools: nextAllowlist(toolNames, tools, name, enable) });
  }

  function toggleServer(serverId: string, enable: boolean) {
    onPatch({
      mcpServers: nextAllowlist(
        servers.map((server) => server.serverId),
        mcpServers,
        serverId,
        enable,
      ),
    });
  }

  if (section === 'skills') {
    const groups = buildGroups(
      skillCatalog,
      (skill) =>
        skillPluginOf(skill.name) ??
        (skill.origin.kind === 'plugin' ? skill.origin.pluginName : null),
      enabledPlugins,
    );
    return (
      <Pane
        label="Skills"
        count={skillsQuery.isPending ? undefined : skillCatalog.length}
        description="Skills this agent may load; empty selection means none."
      >
        {!skillsQuery.isPending && skillCatalog.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-sm">
            No skills in `.harnesys/skills`.
          </p>
        ) : null}
        {groups.map((group) => (
          <SectionGroup key={group.label} label={group.label} count={group.items.length}>
            <RowList>
              {group.items.map((skill) => {
                const hasDetail = Boolean(skill.description);
                const expanded = expandedSkillName === skill.name;
                return (
                  <Row
                    key={skill.name}
                    testId={`draft-skill-${skill.name}`}
                    title={group.plugin ? stripPluginPrefix(skill.name, group.plugin) : skill.name}
                    meta="skill"
                    summary={skill.description || skill.whenToUse}
                    onToggle={
                      hasDetail
                        ? () =>
                            setExpandedSkillName((current) =>
                              current === skill.name ? null : skill.name,
                            )
                        : undefined
                    }
                    expanded={expanded && hasDetail}
                    actions={
                      <Switch
                        size="sm"
                        checked={isChecked(skills, skill.name)}
                        onCheckedChange={(value) => toggleSkill(skill.name, Boolean(value))}
                      />
                    }
                    alwaysShowActions
                  >
                    {skill.description ? (
                      <RowSection label="Description">
                        <p className="wrap-anywhere px-1 text-muted-foreground text-xs leading-4">
                          {skill.description}
                        </p>
                      </RowSection>
                    ) : null}
                  </Row>
                );
              })}
            </RowList>
          </SectionGroup>
        ))}
      </Pane>
    );
  }

  const groups = buildGroups(
    servers,
    (server) => mcpServerPluginOf(server.serverId),
    enabledPlugins,
  );
  return (
    <Pane
      label="MCP"
      count={mcpQuery.isPending ? undefined : servers.length}
      description="MCP servers this agent may use; empty selection means none."
    >
      {!mcpQuery.isPending && servers.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">
          No servers in `.harnesys/mcp.json`.
        </p>
      ) : null}
      {groups.map((group) => (
        <SectionGroup key={group.label} label={group.label} count={group.items.length}>
          <RowList>
            {group.items.map((server) => {
              const expanded = expandedServerId === server.serverId;
              const enabled = isChecked(mcpServers, server.serverId);
              return (
                <Row
                  key={server.serverId}
                  testId={`draft-mcp-${server.serverId}`}
                  title={
                    group.plugin
                      ? stripPluginPrefix(server.serverId, group.plugin)
                      : server.serverId
                  }
                  meta={server.transport}
                  status={
                    server.connected
                      ? { tone: 'live', label: 'Connected' }
                      : { tone: 'danger', label: 'Offline' }
                  }
                  muted={!enabled}
                  summary={`${server.toolCount} ${server.toolCount === 1 ? 'tool' : 'tools'}`}
                  onToggle={() =>
                    setExpandedServerId((current) =>
                      current === server.serverId ? null : server.serverId,
                    )
                  }
                  expanded={expanded}
                  actions={
                    <Switch
                      size="sm"
                      checked={enabled}
                      onCheckedChange={(value) => toggleServer(server.serverId, Boolean(value))}
                    />
                  }
                  alwaysShowActions
                >
                  <McpToolsList
                    tools={server.tools}
                    enabled={enabled}
                    allowlist={tools}
                    toolsReady={Boolean(toolsQuery.data) && !toolsQuery.isPending}
                    onToggleTool={toggleTool}
                  />
                </Row>
              );
            })}
          </RowList>
        </SectionGroup>
      ))}
    </Pane>
  );
}

function SectionGroup({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-baseline gap-1.5 pt-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
        <span className="font-mono font-normal normal-case tabular-nums">{count}</span>
      </p>
      {children}
    </div>
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
    return (
      <RowSection label="Tools" count={0}>
        <p className="px-1 text-muted-foreground text-xs">No tools on this server.</p>
      </RowSection>
    );
  }
  if (!toolsReady) {
    return (
      <RowSection label="Tools" count={tools.length}>
        <p className="px-1 text-muted-foreground text-xs">Loading tool catalog…</p>
      </RowSection>
    );
  }
  return (
    <RowSection label="Tools" count={tools.length}>
      {tools.map((tool) => {
        const shortName = tool.name.includes('__')
          ? tool.name.split('__').slice(1).join('__')
          : tool.name;
        return (
          <div
            key={tool.name}
            className="flex items-start gap-2 rounded-md px-1 py-1"
            data-testid={`draft-mcp-tool-${tool.name}`}
          >
            <Switch
              size="sm"
              className="mt-0.5"
              checked={enabled && isChecked(allowlist, tool.name)}
              disabled={!enabled}
              onCheckedChange={(value) => onToggleTool(tool.name, Boolean(value))}
            />
            <div className="min-w-0 flex-1">
              <RowItem title={shortName} description={tool.description} />
            </div>
          </div>
        );
      })}
    </RowSection>
  );
}
