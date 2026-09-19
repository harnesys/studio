import { Layers2Icon } from 'lucide-react';
import { Markdown } from '@/shared/ui/markdown';
import type { CompactionSegmentMeta } from '../model/turn-segments';
import { FeedNotice, FeedNoticeMetaSep } from './feed-notice';
export function CompactionPendingCard() {
  return (
    <FeedNotice
      testId="compaction-pending"
      tone="accent"
      icon={Layers2Icon}
      label="Compacting…"
      pending
    />
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
    <FeedNotice
      testId="compaction-message"
      tone="accent"
      icon={Layers2Icon}
      label="Compaction"
      meta={
        <>
          <FeedNoticeMetaSep />
          <span>{reasonLabel}</span>
          <FeedNoticeMetaSep />
          <span className="font-mono tabular-nums">
            {formatTokenCount(meta.tokensBefore)} → {formatTokenCount(meta.tokensAfter)}
          </span>
        </>
      }
    >
      {text.trim() ? <Markdown text={text} className="px-0" /> : null}
    </FeedNotice>
  );
}
