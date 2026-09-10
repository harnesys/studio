import { InfoIcon } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/shared/ui/hover-card';
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
    <aside className="flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto px-1.5 py-1.5">
      {GRAPH_GROUP_ORDER.map((group) => {
        const items = byGroup.get(group);
        if (!items || items.length === 0) {
          return null;
        }
        return (
          <div key={group} className="flex flex-col gap-1.5">
            <p className="px-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
              {GRAPH_GROUP_LABELS[group]}
            </p>
            <div className="flex flex-col gap-1.5">
              {items.map((spec) => (
                <PaletteCard key={spec.type} spec={spec} onAdd={onAdd} />
              ))}
            </div>
          </div>
        );
      })}
    </aside>
  );
}

function PaletteCard({ spec, onAdd }: { spec: GraphNodeSpec; onAdd: (type: string) => void }) {
  const Icon = graphTypeIcon(spec.type);
  const tint = graphTypeTint(spec.type);
  return (
    <div
      className={cn(
        'group/palette-card relative flex items-start gap-1 rounded-lg border bg-card/40 px-2 py-2',
        'transition-colors hover:border-border hover:bg-muted/40',
      )}
    >
      <button
        type="button"
        draggable
        title={spec.type}
        onDragStart={(event) => {
          event.dataTransfer.setData(AGENT_GRAPH_DND_TYPE, spec.type);
          event.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => onAdd(spec.type)}
        className="flex min-w-0 flex-1 items-start gap-2 text-left text-foreground"
      >
        <span
          className={cn(
            'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md',
            tint.iconWrap,
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-[12px] leading-4">{spec.label}</span>
          <span className="mt-0.5 line-clamp-2 block text-[10px] text-muted-foreground leading-3">
            {spec.summary}
          </span>
        </span>
      </button>
      <HoverCard>
        <HoverCardTrigger
          render={
            <button
              type="button"
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100"
              aria-label={`${spec.label} info`}
              onClick={(event) => event.stopPropagation()}
            >
              <InfoIcon className="size-3" />
            </button>
          }
        />
        <HoverCardContent side="right" align="start" className="w-64 space-y-1 p-2.5">
          <p className="font-medium text-[12px] leading-4">{spec.label}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{spec.type}</p>
          <p className="text-[12px] text-muted-foreground leading-4">{spec.description}</p>
        </HoverCardContent>
      </HoverCard>
    </div>
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
