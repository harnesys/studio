import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { groupTools } from '@/entities/tool-catalog';
import { ConfigEntityCard, initialsFromLabel } from '@/features/manage-agent';
import {
  type WorkspaceTool,
  workspaceCapabilitiesQuery,
  workspaceMcpConfigQuery,
  workspaceToolsQuery,
} from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';

export function ToolsPane() {
  const { workspaceId } = useStudioLocation();
  const query = useQuery({
    ...workspaceToolsQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const mcpConfigQuery = useQuery({
    ...workspaceMcpConfigQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const capabilitiesQuery = useQuery({
    ...workspaceCapabilitiesQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const packs = capabilitiesQuery.data?.capabilities ?? [];
  const packToolNames = new Set(packs.flatMap((pack) => pack.tools.map((tool) => tool.name)));
  const serverIds = (mcpConfigQuery.data?.servers ?? []).map((server) => server.serverId);
  const groups = groupTools(
    (query.data?.tools ?? []).filter((tool) => !packToolNames.has(tool.name)),
    serverIds,
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loading = query.isPending || mcpConfigQuery.isPending || capabilitiesQuery.isPending;

  function toggle(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <div className="flex flex-col gap-4" data-testid="tools-pane">
      {loading && <p className="text-muted-foreground text-sm">Loading packages…</p>}
      {!loading &&
        (packs.length === 0 && groups.length === 0 ? (
          <p className="text-muted-foreground text-sm">No packages available.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {packs.map((pack) => {
              const id = `pack:${pack.name}`;
              return (
                <ConfigEntityCard
                  key={id}
                  title={pack.name}
                  badge="pack"
                  description={pack.description}
                  initials={initialsFromLabel(pack.name)}
                  expanded={expandedId === id}
                  onClick={() => toggle(id)}
                >
                  <div className="flex flex-col gap-2" data-testid={`package-${pack.name}`}>
                    <ToolRows label={`${pack.tools.length} tools`} tools={pack.tools} />
                    {pack.skills.length > 0 ? <SkillRows skills={pack.skills} /> : null}
                  </div>
                </ConfigEntityCard>
              );
            })}
            {groups.map((group) => {
              const id = `group:${group.id}`;
              return (
                <ConfigEntityCard
                  key={id}
                  title={group.label}
                  badge={`${group.tools.length} tools`}
                  description={group.hint ?? group.tools.map((tool) => tool.name).join(', ')}
                  initials={initialsFromLabel(group.label)}
                  expanded={expandedId === id}
                  onClick={() => toggle(id)}
                >
                  <div className="flex flex-col gap-2" data-testid={`package-${group.id}`}>
                    <ToolRows label={`${group.tools.length} tools`} tools={group.tools} />
                  </div>
                </ConfigEntityCard>
              );
            })}
          </div>
        ))}
    </div>
  );
}

function ToolRows({ label, tools }: { label: string; tools: WorkspaceTool[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      {tools.map((tool) => (
        <div key={tool.name} className="min-w-0 px-1 py-0.5" data-testid={`tool-${tool.name}`}>
          <p className="truncate font-mono text-[12px] leading-snug">{tool.name}</p>
          {tool.description ? (
            <p className="line-clamp-2 text-[11px] text-muted-foreground leading-snug">
              {tool.description}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SkillRows({ skills }: { skills: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        Skills
      </p>
      {skills.map((skill) => (
        <p key={skill} className="truncate px-1 font-mono text-[12px] leading-snug">
          {skill}
        </p>
      ))}
    </div>
  );
}
