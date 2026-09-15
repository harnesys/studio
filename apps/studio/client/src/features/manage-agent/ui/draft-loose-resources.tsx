import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { workspaceMcpQuery, workspaceSkillsQuery } from '@/shared/api';
import { Pane, Row, RowList, RowSection } from '@/shared/ui/capability-rows';
import { Switch } from '@/shared/ui/switch';

import {
  isChecked,
  mcpServerPluginOf,
  nextAllowlist,
  skillPluginOf,
  stripPluginPrefix,
} from '../model/capability-allowlist';

/**
 * Loose-resource allowlists of the agent (spec §2): skills and MCP servers the
 * agent may use. Tool checkboxes are gone (capability_set model): tools arrive
 * with sources; the effective set is the explain preview in agent-config-category-panes.
 */

type Group<T> = { plugin: string | null; label: string; items: T[] };

/** Direct installs first, then one section per plugin the agent has enabled. */
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

export function DraftGrantedSkills({
  workspaceId,
  skills,
  enabledPlugins,
  onChange,
}: {
  workspaceId: string;
  skills: string[];
  enabledPlugins: Record<string, boolean>;
  onChange: (nextSkills: string[]) => void;
}) {
  const [expandedSkillName, setExpandedSkillName] = useState<string | null>(null);
  const skillsQuery = useQuery({
    ...workspaceSkillsQuery(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const skillCatalog = skillsQuery.data?.skills ?? [];
  const skillNames = skillCatalog.map((skill) => skill.name);
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
                      onCheckedChange={(value) =>
                        onChange(nextAllowlist(skillNames, skills, skill.name, Boolean(value)))
                      }
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

export function DraftGrantedMcpServers({
  workspaceId,
  mcpServers,
  enabledPlugins,
  onChange,
}: {
  workspaceId: string;
  mcpServers: string[];
  enabledPlugins: Record<string, boolean>;
  onChange: (nextServers: string[]) => void;
}) {
  const mcpQuery = useQuery({
    ...workspaceMcpQuery(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const servers = mcpQuery.data?.servers ?? [];
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
            {group.items.map((server) => (
              <Row
                key={server.serverId}
                testId={`draft-mcp-${server.serverId}`}
                title={
                  group.plugin ? stripPluginPrefix(server.serverId, group.plugin) : server.serverId
                }
                meta={server.transport}
                status={
                  server.connected
                    ? { tone: 'live', label: 'Connected' }
                    : { tone: 'danger', label: 'Offline' }
                }
                muted={!isChecked(mcpServers, server.serverId)}
                summary={`${server.toolCount} ${server.toolCount === 1 ? 'tool' : 'tools'}`}
                actions={
                  <Switch
                    size="sm"
                    checked={isChecked(mcpServers, server.serverId)}
                    onCheckedChange={(value) =>
                      onChange(
                        nextAllowlist(
                          servers.map((item) => item.serverId),
                          mcpServers,
                          server.serverId,
                          Boolean(value),
                        ),
                      )
                    }
                  />
                }
                alwaysShowActions
              />
            ))}
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
