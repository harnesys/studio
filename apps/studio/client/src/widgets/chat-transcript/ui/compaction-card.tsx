import { Layers2Icon } from 'lucide-react';

import { Markdown } from '@/shared/ui/markdown';

import type { CompactionSegmentMeta } from '../model/turn-segments';

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

function formatTokenCount(value: number): string {
  if (value >= 1000) {
    const kilo = value / 1000;
    return `${kilo >= 10 ? kilo.toFixed(0) : kilo.toFixed(1)}k`;
  }
  return String(value);
}

export function CompactionMessageCard({
  text,
  meta,
}: {
  text: string;
  meta: CompactionSegmentMeta;
}) {
  const reasonLabel = meta.reason === 'manual' ? 'Manual' : 'Auto';
  return (
    <div
      data-testid="compaction-message"
      className="overflow-hidden rounded-lg border border-border/80 bg-muted/15"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-border/60 border-b px-3.5 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
          <Layers2Icon className="size-3.5 shrink-0 opacity-70" />
          Compaction
        </span>
        <span className="text-border">·</span>
        <span>{reasonLabel}</span>
        <span className="text-border">·</span>
        <span className="font-mono tabular-nums">
          {formatTokenCount(meta.tokensBefore)} → {formatTokenCount(meta.tokensAfter)}
        </span>
      </div>
      {text.trim() ? (
        <div className="px-3.5 py-3 text-sm leading-relaxed">
          <Markdown text={text} />
        </div>
      ) : null}
    </div>
  );
}
