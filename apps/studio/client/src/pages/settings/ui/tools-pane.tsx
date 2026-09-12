import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { groupTools } from '@/entities/tool-catalog';
import { ConfigEntityCard, initialsFromLabel } from '@/features/manage-agent';
import { workspaceToolsQuery } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';

export function ToolsPane() {
  const { workspaceId } = useStudioLocation();
  const query = useQuery({
    ...workspaceToolsQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const groups = groupTools(query.data?.tools ?? []);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4" data-testid="tools-pane">
      {query.isPending && <p className="text-muted-foreground text-sm">Loading tools…</p>}
      {!query.isPending &&
        (groups.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tools available.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {groups.map((group) => {
              const expanded = expandedId === group.id;
              return (
                <ConfigEntityCard
                  key={group.id}
                  title={group.label}
                  badge={`${group.tools.length} tools`}
                  description={group.hint ?? group.tools.map((tool) => tool.name).join(', ')}
                  initials={initialsFromLabel(group.label)}
                  expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : group.id)}
                >
                  <div className="flex flex-col gap-2" data-testid={`package-${group.id}`}>
                    {group.tools.map((tool) => (
                      <div
                        key={tool.name}
                        className="flex flex-col gap-0.5"
                        data-testid={`tool-${tool.name}`}
                      >
                        <span className="font-mono text-[13px]">{tool.name}</span>
                        {tool.description ? (
                          <span className="text-muted-foreground text-xs leading-4">
                            {tool.description}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </ConfigEntityCard>
              );
            })}
          </div>
        ))}
    </div>
  );
}
