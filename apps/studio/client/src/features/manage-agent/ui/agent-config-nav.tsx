import {
  BotIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CpuIcon,
  FoldVerticalIcon,
  GaugeIcon,
  LayersIcon,
  type LucideIcon,
  PuzzleIcon,
  ServerIcon,
  UserRoundIcon,
  WorkflowIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type AgentConfigCategory =
  | 'identity'
  | 'model'
  | 'capabilities'
  | 'compaction'
  | 'skills'
  | 'graph'
  | 'mcp'
  | 'limits'
  | 'subagents';

export const AGENT_CONFIG_CATEGORIES: {
  id: AgentConfigCategory;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: 'identity', label: 'Identity', icon: UserRoundIcon },
  { id: 'model', label: 'Model', icon: CpuIcon },
  { id: 'graph', label: 'Graph', icon: WorkflowIcon },
  { id: 'capabilities', label: 'Capabilities', icon: LayersIcon },
  { id: 'compaction', label: 'Compaction', icon: FoldVerticalIcon },
  { id: 'skills', label: 'Skills', icon: PuzzleIcon },
  { id: 'mcp', label: 'MCP', icon: ServerIcon },
  { id: 'limits', label: 'Limits', icon: GaugeIcon },
  { id: 'subagents', label: 'Subagents', icon: BotIcon },
];

export function ConfigNavDivider({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div
      className="group/divider relative mx-1 flex w-3 shrink-0 items-stretch justify-center"
      data-testid="agent-config-nav-divider"
    >
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/25 transition-colors duration-150 group-hover/divider:bg-border/80" />
      <button
        type="button"
        onClick={onToggle}
        title={open ? 'Hide sections' : 'Show sections'}
        className={cn(
          'relative z-10 my-auto flex size-5 items-center justify-center rounded-full',
          'border border-border/30 bg-background text-muted-foreground/40 shadow-sm',
          'opacity-40 transition-[opacity,color,border-color,background-color] duration-150',
          'hover:border-border hover:bg-muted hover:text-foreground hover:opacity-100',
          'group-hover/divider:text-muted-foreground group-hover/divider:opacity-100',
          'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {open ? <ChevronLeftIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
      </button>
    </div>
  );
}
