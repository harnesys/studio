import type { AgentMemoryConfig } from '@studio/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Agent } from '@/entities/agent';
import { groupTools } from '@/entities/tool-catalog';
import { workspaceMcpQuery, workspaceSkillsQuery, workspaceToolsQuery } from '@/shared/api';
import { Switch } from '@/shared/ui/switch';

import type { AgentCapabilitiesDraft } from '../model/agent-config';

export type DraftCapabilitiesSection = 'skills' | 'tools' | 'mcp';

const MEMORY_TOOL_SLOT: Record<string, 'pin' | 'semantic' | 'episodic' | 'knowledge'> = {
  pin_set: 'pin',
  pin_list: 'pin',
  pin_remove: 'pin',
  memory_write: 'semantic',
  memory_list: 'semantic',
  memory_delete: 'semantic',
  recall_search: 'episodic',
  knowledge_search: 'knowledge',
  knowledge_read: 'knowledge',
};

function memoryToolEnabled(memory: AgentMemoryConfig | null | undefined, name: string): boolean {
  const slot = MEMORY_TOOL_SLOT[name];
  if (!slot) {
    return false;
  }
  return memory?.[slot] != null;
}

export function DraftCapabilities({
  agent,
  workspaceId,
  memory,
  section,
  onChange,
}: {
  agent: Agent | null;
  workspaceId: string;
  memory?: AgentMemoryConfig | null;
  section: DraftCapabilitiesSection;
  onChange: (snapshot: AgentCapabilitiesDraft) => void;
}) {
  const [skills, setSkills] = useState(() => agent?.skills ?? []);
  const [tools, setTools] = useState(() => agent?.tools ?? []);
  const [mcpServers, setMcpServers] = useState(() => agent?.mcpServers ?? []);
  const skillsQuery = useQuery({
    ...workspaceSkillsQuery(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const toolsQuery = useQuery({
    ...workspaceToolsQuery(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const mcpQuery = useQuery({
    ...workspaceMcpQuery(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const skillCatalog = skillsQuery.data?.skills ?? [];
  const skillNames = skillCatalog.map((skill) => skill.name);
  const groups = groupTools(toolsQuery.data?.tools ?? []);
  const toolNames = groups
    .filter((group) => group.id !== 'memory')
    .flatMap((group) => group.tools.map((tool) => tool.name));
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
    <div className="flex flex-col gap-4">
      {section === 'skills' ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
            Skills
          </h3>
          {!skillsQuery.isPending &&
            (skillNames.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No skills in `.agents/skills`.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {skillCatalog.map((skill) => (
                  <CapabilityRow
                    key={skill.name}
                    name={skill.name}
                    description={skill.description}
                    checked={isChecked(skills, skill.name)}
                    onToggle={(enable) => toggleSkill(skill.name, enable)}
                  />
                ))}
              </div>
            ))}
        </section>
      ) : null}

      {section === 'tools' ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
            Tools
          </h3>
          {!toolsQuery.isPending &&
            (toolNames.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No workspace tools.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {groups.map((group) => {
                  const readonly = group.id === 'memory';
                  return (
                    <div key={group.id} className="flex flex-col gap-2">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                        {group.label}
                      </p>
                      {readonly && group.hint ? (
                        <p className="text-[11px] text-muted-foreground">{group.hint}</p>
                      ) : null}
                      <div className="flex flex-col gap-2.5">
                        {group.tools.map((tool) => (
                          <CapabilityRow
                            key={tool.name}
                            name={tool.name}
                            description={tool.description}
                            mono
                            disabled={readonly}
                            checked={
                              readonly
                                ? memoryToolEnabled(memory, tool.name)
                                : isChecked(tools, tool.name)
                            }
                            onToggle={(enable) => toggleTool(tool.name, enable)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
        </section>
      ) : null}

      {section === 'mcp' ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
            MCP
          </h3>
          {!mcpQuery.isPending &&
            (servers.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No servers in `.studio/mcp.json`.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {servers.map((server) => {
                  const status = server.connected ? 'connected' : 'offline';
                  return (
                    <CapabilityRow
                      key={server.serverId}
                      name={server.serverId}
                      description={`${server.transport} · ${server.toolCount} tools · ${status}`}
                      checked={isChecked(mcpServers, server.serverId)}
                      onToggle={(enable) => toggleServer(server.serverId, enable)}
                    />
                  );
                })}
              </div>
            ))}
        </section>
      ) : null}
    </div>
  );
}

function CapabilityRow({
  name,
  description,
  checked,
  mono = false,
  disabled = false,
  onToggle,
}: {
  name: string;
  description: string;
  checked: boolean;
  mono?: boolean;
  disabled?: boolean;
  onToggle: (enable: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <Switch
        size="sm"
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onToggle(Boolean(value))}
      />
      <div className="min-w-0 flex-1">
        <p className={`font-medium text-[12px] leading-snug ${mono ? 'font-mono' : ''}`}>{name}</p>
        {description ? (
          <p className="truncate text-[11px] text-muted-foreground leading-snug">{description}</p>
        ) : null}
      </div>
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
