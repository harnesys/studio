import { cn } from '@/shared/lib/utils';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/shared/ui/hover-card';
import {
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
    <aside className="flex w-full flex-col items-center gap-1">
      {GRAPH_GROUP_ORDER.map((group, groupIndex) => {
        const items = byGroup.get(group);
        if (!items || items.length === 0) {
          return null;
        }
        return (
          <div key={group} className="flex w-full flex-col items-center gap-1">
            {groupIndex > 0 ? <div className="my-0.5 h-px w-5 bg-border/70" /> : null}
            {items.map((spec) => (
              <PaletteIcon key={spec.type} spec={spec} onAdd={onAdd} />
            ))}
          </div>
        );
      })}
    </aside>
  );
}

function PaletteIcon({ spec, onAdd }: { spec: GraphNodeSpec; onAdd: (type: string) => void }) {
  const Icon = graphTypeIcon(spec.type);
  const tint = graphTypeTint(spec.type);
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <button
            type="button"
            draggable
            aria-label={spec.label}
            onDragStart={(event) => {
              event.dataTransfer.setData(AGENT_GRAPH_DND_TYPE, spec.type);
              event.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => onAdd(spec.type)}
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-md',
              'transition-colors hover:ring-1 hover:ring-border',
              tint.iconWrap,
            )}
          >
            <Icon className="size-4" />
          </button>
        }
      />
      <HoverCardContent side="right" align="start" className="w-64 space-y-1 p-2.5">
        <p className="font-medium text-[12px] leading-4">{spec.label}</p>
        <p className="font-mono text-[10px] text-muted-foreground">{spec.type}</p>
        <p className="text-[12px] text-muted-foreground leading-4">{spec.description}</p>
      </HoverCardContent>
    </HoverCard>
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
