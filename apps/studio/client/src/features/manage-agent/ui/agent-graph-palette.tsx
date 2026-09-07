import { cn } from '@/shared/lib/utils';
import {
  GRAPH_GROUP_LABELS,
  GRAPH_GROUP_ORDER,
  type GraphNodeGroup,
  type GraphNodeSpec,
  paletteSpecs,
} from '../model/agent-graph-catalog';
import { graphTypeIcon, graphTypeTint } from './agent-graph-appearance';

export const AGENT_GRAPH_DND_TYPE = 'application/harnesys-graph-node-type';

export type AgentGraphPaletteProps = {
  onAdd: (type: string) => void;
};

export function AgentGraphPalette({ onAdd }: AgentGraphPaletteProps) {
  const byGroup = groupPalette(paletteSpecs());

  return (
    <aside className="flex h-full w-40 shrink-0 flex-col gap-2 overflow-y-auto border-border border-r bg-popover px-1.5 py-1.5">
      {GRAPH_GROUP_ORDER.map((group) => {
        const items = byGroup.get(group);
        if (!items || items.length === 0) {
          return null;
        }
        return (
          <div key={group} className="flex flex-col gap-px">
            <p className="px-1.5 pt-0.5 pb-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
              {GRAPH_GROUP_LABELS[group]}
            </p>
            {items.map((spec) => {
              const Icon = graphTypeIcon(spec.type);
              const tint = graphTypeTint(spec.type);
              return (
                <button
                  key={spec.type}
                  type="button"
                  title={spec.type}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(AGENT_GRAPH_DND_TYPE, spec.type);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => onAdd(spec.type)}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded',
                      tint.iconWrap,
                    )}
                  >
                    <Icon className="size-3" />
                  </span>
                  <span className="min-w-0 truncate text-[12px] leading-4">{spec.label}</span>
                </button>
              );
            })}
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
