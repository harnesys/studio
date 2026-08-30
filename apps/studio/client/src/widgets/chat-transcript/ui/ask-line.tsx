import type { SessionEvent } from '@studio/shared';
import { MessageCircleQuestionIcon } from 'lucide-react';

import { cn } from '@/shared/lib/utils';

/** Transcript projection for ask events. Interactive answer lives in HitlPrompt. */
export function AskLine({
  event,
  live,
}: {
  event: SessionEvent & { type: 'ask' };
  runId?: string;
  live?: boolean;
}) {
  const active = Boolean(live);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2 text-[13px] leading-none">
        <MessageCircleQuestionIcon
          className={cn(
            'relative z-10 size-3.5 shrink-0 bg-background text-muted-foreground',
            active && 'thinking-icon-pulse',
          )}
        />
        <span
          className={active ? 'thinking-shimmer font-medium' : 'font-medium text-foreground/90'}
        >
          Ask
        </span>
        <span className="min-w-0 truncate text-muted-foreground">{event.prompt}</span>
        {active ? (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">waiting…</span>
        ) : null}
      </div>
    </div>
  );
}
