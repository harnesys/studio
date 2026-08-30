import type { CompactionEntry, CompactionPayloadStats } from '@studio/shared';
import { Layers2Icon } from 'lucide-react';

import { formatTokenCount } from '@/entities/journal';
import { Markdown } from '@/shared/ui/markdown';

export function CompactionCard({ entry }: { entry: CompactionEntry }) {
  const { summary, coverFromSeq, coveredUntilSeq, stats, reason } = entry.payload;
  const label = reason === 'manual' ? 'Compaction · manual' : 'Compaction';

  return (
    <div
      data-testid="compaction-card"
      className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 px-3.5 py-3"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Layers2Icon className="size-3.5 shrink-0" />
        <p className="font-medium text-[11px] uppercase tracking-wide">{label}</p>
        <span className="font-mono text-[11px] text-muted-foreground/80">
          {`seq ${coverFromSeq}–${coveredUntilSeq}`}
        </span>
      </div>
      {summary.trim() ? (
        <div className="text-[length:var(--chat-font-size)] leading-relaxed">
          <Markdown text={summary} className="px-0" />
        </div>
      ) : null}
      {stats ? (
        <p className="font-mono text-[11px] text-muted-foreground/80">{formatStats(stats)}</p>
      ) : null}
    </div>
  );
}

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

function formatStats(stats: CompactionPayloadStats): string {
  const parts = [
    `${formatTokenCount(stats.estimatedTokensBefore)} → ${formatTokenCount(stats.estimatedTokensAfter)} tok`,
    `${stats.coveredEntryCount} entries`,
  ];
  const usage = stats.usage;
  if (usage) {
    parts.push(`${formatTokenCount(usage.input)} in · ${formatTokenCount(usage.output)} out`);
    if (usage.ms != null && usage.ms > 0) {
      parts.push(`${usage.ms}ms`);
    }
  }
  return parts.join(' · ');
}
