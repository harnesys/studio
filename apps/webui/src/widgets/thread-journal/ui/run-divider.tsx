import { cn } from '@/shared/lib/utils';
export type RunDividerProps = {
  index: number;
  task: string;
  failed: boolean;
  running: boolean;
};
export function RunDivider({ index, task, failed, running }: RunDividerProps) {
  let statusClass = 'text-muted-foreground';
  let statusLabel = 'COMPLETED';
  if (failed) {
    statusClass = 'text-destructive';
    statusLabel = 'FAILED';
  } else if (running) {
    statusClass = 'text-live';
    statusLabel = 'RUNNING';
  }
  return (
    <div className="flex items-center gap-2 py-1" data-testid={`run-divider-${index}`}>
      <span className="font-mono text-[10px] text-muted-foreground tracking-[0.16em]">
        RUN {String(index + 1).padStart(2, '0')}
      </span>
      <span className="h-px flex-1 bg-border/60" />
      <span className={cn('font-mono text-[10px] tracking-[0.16em]', statusClass)}>
        {statusLabel}
      </span>
      <span className="max-w-[50%] truncate text-[11px] text-muted-foreground">{task}</span>
    </div>
  );
}
