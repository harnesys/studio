import { BrainIcon } from 'lucide-react';

import { estimateTokens, formatDuration, formatTokenCount } from '@/entities/session';
import { useChatPreferences } from '@/shared/lib/chat-preferences';

import { ExpandableScroll } from '@/shared/ui/expandable-scroll';
import { ActivityLine } from './activity-line';

export function ThinkingLine({
  text,
  live,
  durationMs,
}: {
  text: string;
  live: boolean;
  durationMs?: number;
}) {
  const expandThinking = useChatPreferences((state) => state.expandThinking);
  // Per-thought token count is not in the event stream; estimate from text.
  const tokensLabel =
    !live && text.trim() ? `~${formatTokenCount(estimateTokens(text))} tok` : null;
  const durationLabel =
    !live && durationMs !== undefined && durationMs > 0 ? formatDuration(durationMs) : null;
  const hint = [tokensLabel, durationLabel].filter(Boolean).join(' · ') || null;

  return (
    <ActivityLine
      icon={BrainIcon}
      label="Thought"
      hint={hint}
      active={live}
      defaultOpen={live || expandThinking}
      hasContent={Boolean(text)}
    >
      <ExpandableScroll previewClassName="max-h-28" fullClassName="max-h-[min(70vh,24rem)]">
        <div className="whitespace-pre-wrap text-[13px] text-muted-foreground/90 leading-5">
          {text}
        </div>
      </ExpandableScroll>
    </ActivityLine>
  );
}
