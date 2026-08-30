import { BrainIcon } from 'lucide-react';
import { useState } from 'react';

import { formatDuration } from '@/entities/journal';
import { useChatPreferences } from '@/shared/lib/chat-preferences';
import { cn } from '@/shared/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';

import { ExpandableScroll } from '@/shared/ui/expandable-scroll';

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
  const [manual, setManual] = useState<boolean | undefined>(undefined);
  const open = manual ?? (live || expandThinking);
  const durationLabel =
    !live && durationMs !== undefined && durationMs > 0 ? formatDuration(durationMs) : null;

  return (
    <Collapsible open={open} onOpenChange={setManual}>
      <div className="flex flex-col gap-1">
        <CollapsibleTrigger className="group flex cursor-pointer items-center gap-2 text-left">
          <BrainIcon
            className={cn(
              'relative z-10 size-3.5 shrink-0 bg-background text-muted-foreground',
              live && 'thinking-icon-pulse',
            )}
          />
          <span
            className={cn(
              'font-medium text-[13px] leading-none',
              live ? 'thinking-shimmer' : 'text-muted-foreground',
            )}
          >
            Thought
          </span>
          {durationLabel ? (
            <span className="font-mono text-[11px] text-muted-foreground/70 leading-none">
              {durationLabel}
            </span>
          ) : null}
        </CollapsibleTrigger>
        {text ? (
          <CollapsibleContent>
            <ExpandableScroll
              className="pl-6"
              previewClassName="max-h-28"
              fullClassName="max-h-[min(70vh,24rem)]"
            >
              <div className="whitespace-pre-wrap text-[13px] text-muted-foreground leading-5">
                {text}
              </div>
            </ExpandableScroll>
          </CollapsibleContent>
        ) : null}
      </div>
    </Collapsible>
  );
}
