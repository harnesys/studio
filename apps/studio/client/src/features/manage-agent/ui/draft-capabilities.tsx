import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Agent } from '@/entities/agent';
import {
  type WorkspaceTool,
  workspaceMcpQuery,
  workspaceSkillsQuery,
  workspaceToolsQuery,
} from '@/shared/api';
import { Row, RowItem, RowList, RowSection } from '@/shared/ui/capability-rows';
import { Switch } from '@/shared/ui/switch';

import type { AgentCapabilitiesDraft } from '../model/agent-config';

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
        <section className="flex flex-col gap-1">
          {!skillsQuery.isPending && skillNames.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-sm">
              No skills in `.harnesys/skills`.
            </p>
          ) : null}
          {skillCatalog.length > 0 ? (
            <RowList>
              {skillCatalog.map((skill) => {
                const hasDetail = Boolean(skill.description);
                const expanded = expandedSkillName === skill.name;
                return (
                  <Row
                    key={skill.name}
                    testId={`draft-skill-${skill.name}`}
                    title={skill.name}
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
          ) : null}
        </section>
      ) : null}

      {section === 'mcp' ? (
        <section className="flex flex-col gap-1">
          {!mcpQuery.isPending && servers.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-sm">
              No servers in `.harnesys/mcp.json`.
            </p>
          ) : null}
          {servers.length > 0 ? (
            <RowList>
              {servers.map((server) => {
                const expanded = expandedServerId === server.serverId;
                const enabled = isChecked(mcpServers, server.serverId);
                return (
                  <Row
                    key={server.serverId}
                    testId={`draft-mcp-${server.serverId}`}
                    title={server.serverId}
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
          ) : null}
        </section>
      ) : null}
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
