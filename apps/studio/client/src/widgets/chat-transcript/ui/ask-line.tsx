import type { SessionEvent } from '@studio/shared';
import { LoaderCircleIcon, MessageCircleQuestionIcon } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { ActivityLine } from './activity-line';

/** Transcript projection for ask events. Interactive answer lives in HitlPrompt. */
export function AskLine({
  event,
  live,
}: {
  event: SessionEvent & { type: 'ask' };
  runId?: string;
  live?: boolean;
}) {
  const prompt = event.prompt ?? '';
  const waiting = Boolean(live);
  let label = 'Question';
  if (event.source === 'budget') {
    label = 'Budget limit reached';
  } else if (event.source === 'plan_proposal') {
    label = 'Plan proposal';
  }

  return (
    <ActivityLine
      icon={MessageCircleQuestionIcon}
      label={label}
      hint={prompt}
      active={waiting}
      defaultOpen={waiting}
      hasContent={Boolean(prompt)}
      tail={
        waiting ? (
          <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground">
            <LoaderCircleIcon className="size-3 animate-spin text-live" />
            waiting…
          </span>
        ) : null
      }
    >
      <div
        className={cn(
          'whitespace-pre-wrap text-[13px] leading-5',
          waiting ? 'text-foreground/90' : 'text-muted-foreground/90',
        )}
      >
        {prompt}
      </div>
    </ActivityLine>
  );
}
