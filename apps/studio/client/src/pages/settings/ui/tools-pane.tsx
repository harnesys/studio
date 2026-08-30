import { useQuery } from '@tanstack/react-query';

import { groupTools } from '@/entities/tool-catalog';
import { workspaceToolsQuery } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';

export function ToolsPane() {
  const { workspaceId } = useStudioLocation();
  const query = useQuery({
    ...workspaceToolsQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const groups = groupTools(query.data?.tools ?? []);

  return (
    <div className="flex flex-col gap-6" data-testid="tools-pane">
      {query.isPending && <p className="text-muted-foreground text-sm">Loading tools…</p>}
      {!query.isPending &&
        (groups.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tools available.</p>
        ) : (
          groups.map((group) => (
            <section key={group.id} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <h2 className="font-medium text-sm">{group.label}</h2>
                <span className="text-muted-foreground text-xs">{group.tools.length} tools</span>
              </div>
              {group.hint ? <p className="text-muted-foreground text-xs">{group.hint}</p> : null}
              <div className="flex flex-col gap-1">
                {group.tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="flex min-h-9 flex-col gap-0.5 rounded-md px-2 py-2 hover:bg-muted/50"
                    data-testid={`tool-${tool.name}`}
                  >
                    <span className="font-mono text-sm">{tool.name}</span>
                    <span className="text-muted-foreground text-sm">{tool.description}</span>
                  </div>
                ))}
              </div>
            </section>
          ))
        ))}
    </div>
  );
}
