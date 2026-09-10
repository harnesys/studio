import type { Agent } from '@/entities/agent';
import { useAgentLiveStatus } from '@/features/desk';
import { cn } from '@/shared/lib/utils';
import { StatusDot } from '@/shared/ui/status-dot';

const STATUS_TONE = {
  idle: 'idle',
  running: 'live',
  waiting: 'wait',
  error: 'danger',
  offline: 'off',
} as const;

type DelegateRowProps = {
  agent: Agent;
  onSettings: () => void;
};

/** Compact spawn-delegate row under a top-level agent (no chevron). */
export function DelegateRow({ agent, onSettings }: DelegateRowProps) {
  const status = useAgentLiveStatus(agent.id);
  return (
    <button
      type="button"
      className={cn(
        'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left',
        'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
        'group-data-[collapsible=icon]:hidden',
      )}
      onClick={onSettings}
      title={`${agent.name} · subagent`}
      data-testid={`delegate-row-${agent.id}`}
    >
      <StatusDot tone={STATUS_TONE[status]} className="size-1.5" />
      <span className="min-w-0 flex-1 truncate text-[12px] leading-4">{agent.name}</span>
    </button>
  );
}
