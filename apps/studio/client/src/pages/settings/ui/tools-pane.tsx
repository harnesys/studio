import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { groupTools } from '@/entities/tool-catalog';
import {
  type WorkspaceTool,
  workspaceCapabilitiesQuery,
  workspaceMcpConfigQuery,
  workspaceToolsQuery,
} from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';

import { Row, RowHeader, RowItem, RowList, RowSection } from './capability-rows';

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
  const total = packs.length + groups.length;

  function toggle(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <div className="flex flex-col gap-2" data-testid="tools-pane">
      {loading && <p className="text-muted-foreground text-sm">Loading packages…</p>}
      {!loading &&
        (total === 0 ? (
          <p className="text-muted-foreground text-sm">No packages available.</p>
        ) : (
          <>
            <RowHeader label="Packages" count={total} />
            <RowList>
              {packs.map((pack) => {
                const id = `pack:${pack.name}`;
                return (
                  <Row
                    key={id}
                    testId={`package-${pack.name}`}
                    title={pack.name}
                    meta="pack"
                    summary={pack.description}
                    onToggle={() => toggle(id)}
                    expanded={expandedId === id}
                  >
                    <RowSection label="Tools" count={pack.tools.length}>
                      {pack.tools.map((tool) => (
                        <ToolItem key={tool.name} tool={tool} />
                      ))}
                    </RowSection>
                    {pack.skills.length > 0 ? (
                      <RowSection label="Skills" count={pack.skills.length}>
                        {pack.skills.map((skill) => (
                          <p
                            key={skill}
                            className="truncate px-1 font-mono text-[12px] leading-snug"
                          >
                            {skill}
                          </p>
                        ))}
                      </RowSection>
                    ) : null}
                  </Row>
                );
              })}
              {groups.map((group) => {
                const id = `group:${group.id}`;
                return (
                  <Row
                    key={id}
                    testId={`package-${group.id}`}
                    title={group.label}
                    meta={`${group.tools.length} tools`}
                    summary={group.hint ?? group.tools.map((tool) => tool.name).join(', ')}
                    onToggle={() => toggle(id)}
                    expanded={expandedId === id}
                  >
                    <RowSection label="Tools" count={group.tools.length}>
                      {group.tools.map((tool) => (
                        <ToolItem key={tool.name} tool={tool} />
                      ))}
                    </RowSection>
                  </Row>
                );
              })}
            </RowList>
          </>
        ))}
    </div>
  );
}

function ToolItem({ tool }: { tool: WorkspaceTool }) {
  return <RowItem testId={`tool-${tool.name}`} title={tool.name} description={tool.description} />;
}
