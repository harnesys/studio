import { contextUsedRatio, type MessageUsage, type UsageRollup } from '@/entities/session';
import { cn } from '@/shared/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';

import { UsageCard } from './usage-card';

type ContextRingProps = {
  last: MessageUsage | null;
  run: UsageRollup | null;
  thread: UsageRollup | null;
  window?: number;
  disabled?: boolean;
};

export function ContextRing({ last, run, thread, window = 0, disabled }: ContextRingProps) {
  const ratio = last ? contextUsedRatio(last) : 0;
  const size = 16;
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - ratio);
  const hasStats = Boolean(
    last || window > 0 || (thread && thread.calls > 0) || (run && run.calls > 0),
  );

  const ring = (
    <span className="relative inline-flex size-4 items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <title>context</title>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted-foreground/35"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(ratio > 0.85 ? 'text-destructive' : 'text-live')}
        />
      </svg>
    </span>
  );

  if (!hasStats || disabled) {
    return (
      <span
        className="inline-flex size-7 items-center justify-center text-muted-foreground"
        data-testid="context-ring"
        role="img"
        aria-label="Context"
      >
        {ring}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground"
        aria-label="Context usage"
        data-testid="context-ring"
      >
        {ring}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-72 min-w-72 p-3">
        <UsageCard last={last} run={run} thread={thread} window={window} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
