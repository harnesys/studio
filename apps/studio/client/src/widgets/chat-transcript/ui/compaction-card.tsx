import { Layers2Icon } from 'lucide-react';

export function CompactionPendingCard() {
  return (
    <div
      data-testid="compaction-pending"
      className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/20 px-3.5 py-3 text-muted-foreground"
    >
      <Layers2Icon className="thinking-icon-pulse size-3.5 shrink-0" />
      <p className="thinking-shimmer font-medium text-[13px] leading-none">Compacting…</p>
    </div>
  );
}
