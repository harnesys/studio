import { BrainIcon } from 'lucide-react';
import { estimateTokens, formatDuration, formatTokenCount, useLiveTail } from '@/entities/session';
import { useChatPreferences } from '@/shared/lib/chat-preferences';
import { ExpandableScroll } from '@/shared/ui/expandable-scroll';
import { ActivityLine } from './activity-line';
export function ThinkingLine({
  text,
  live,
  durationMs,
  threadId,
}: {
  text: string;
  live: boolean;
  durationMs?: number;
  threadId?: string;
}) {
  const feedDetail = useChatPreferences((state) => state.feedDetail);
  const tail = useLiveTail(live ? threadId : undefined);
  const display = live && tail.kind === 'reasoning' && tail.text ? tail.text : text;
  const tokensLabel =
    !live && display.trim() ? `~${formatTokenCount(estimateTokens(display))} tok` : null;
  const durationLabel =
    !live && durationMs !== undefined && durationMs > 0 ? formatDuration(durationMs) : null;
  const hint = [tokensLabel, durationLabel].filter(Boolean).join(' · ') || null;
  return (
    <ActivityLine
      icon={BrainIcon}
      label="Thought"
      hint={hint}
      active={live}
      defaultOpen={live || feedDetail === 'full'}
      hasContent={Boolean(display)}
    >
      <ExpandableScroll
        follow={live}
        previewClassName="max-h-28"
        fullClassName="max-h-[min(70vh,24rem)]"
      >
        <div className="whitespace-pre-wrap text-[13px] text-muted-foreground/90 leading-5">
          {display}
        </div>
      </ExpandableScroll>
    </ActivityLine>
  );
}
