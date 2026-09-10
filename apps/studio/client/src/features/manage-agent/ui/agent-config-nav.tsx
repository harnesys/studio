import {
  ArrowLeftIcon,
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

export type AgentConfigNavItem = {
  id: AgentConfigCategory;
  label: string;
  icon: LucideIcon;
};

export const AGENT_CONFIG_CATEGORIES: AgentConfigNavItem[] = [
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

export type AgentConfigCategoryNavProps = {
  categories: AgentConfigNavItem[];
  category: AgentConfigCategory;
  onSelect: (category: AgentConfigCategory) => void;
  backLabel?: string | null;
  onBack?: () => void;
  className?: string;
};

export function AgentConfigCategoryNav({
  categories,
  category,
  onSelect,
  backLabel,
  onBack,
  className,
}: AgentConfigCategoryNavProps) {
  return (
    <nav
      className={cn('flex w-40 shrink-0 flex-col gap-0.5', className)}
      data-testid="agent-config-nav"
    >
      {backLabel != null && onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-muted-foreground text-sm hover:bg-sidebar-accent/50 hover:text-foreground"
          data-testid="agent-config-back"
        >
          <ArrowLeftIcon className="size-3.5 shrink-0" />
          {backLabel}
        </button>
      ) : null}
      {categories.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm',
            category === item.id
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/50',
          )}
        >
          <item.icon className="size-3.5 shrink-0" />
          {item.label}
        </button>
      ))}
    </nav>
  );
}

/** Chevron on the graph content box left edge — toggles the dialog category nav. */
export function GraphContentNavToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={open ? 'Hide sections' : 'Show sections'}
      data-testid="agent-config-graph-nav-toggle"
      className={cn(
        'absolute top-1/2 left-0 z-20 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full',
        'border border-border/40 bg-popover/95 text-muted-foreground/50 shadow-md backdrop-blur-sm',
        'opacity-50 transition-[opacity,color,border-color] duration-150',
        'hover:border-border hover:text-foreground hover:opacity-100',
        'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {open ? <ChevronLeftIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
    </button>
  );
}
