import {
  GRAPH_GROUP_LABELS,
  GRAPH_GROUP_ORDER,
  type GraphNodeGroup,
  type GraphNodeSpec,
  paletteSpecs,
} from '../model/agent-graph-catalog';

export const AGENT_GRAPH_DND_TYPE = 'application/harnesys-graph-node-type';

export type AgentGraphPaletteProps = {
  onAdd: (type: string) => void;
};

export function AgentGraphPalette({ onAdd }: AgentGraphPaletteProps) {
  const byGroup = groupPalette(paletteSpecs());

  return (
    <aside className="flex h-full w-44 shrink-0 flex-col gap-3 overflow-y-auto border-border border-r bg-popover px-2 py-2">
      {GRAPH_GROUP_ORDER.map((group) => {
        const items = byGroup.get(group);
        if (!items || items.length === 0) {
          return null;
        }
        return (
          <div key={group} className="flex flex-col gap-0.5">
            <p className="px-1.5 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
              {GRAPH_GROUP_LABELS[group]}
            </p>
            {items.map((spec) => (
              <button
                key={spec.type}
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(AGENT_GRAPH_DND_TYPE, spec.type);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onAdd(spec.type)}
                className="rounded-md px-2 py-1.5 text-left text-foreground text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <span className="block truncate">{spec.label}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                  {spec.type}
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </aside>
  );
}

function groupPalette(specs: GraphNodeSpec[]): Map<GraphNodeGroup, GraphNodeSpec[]> {
  const map = new Map<GraphNodeGroup, GraphNodeSpec[]>();
  for (const group of GRAPH_GROUP_ORDER) {
    map.set(group, []);
  }
  for (const spec of specs) {
    map.get(spec.group)?.push(spec);
  }
  return map;
}
