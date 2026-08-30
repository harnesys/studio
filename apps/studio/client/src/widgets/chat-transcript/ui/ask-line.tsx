import type { AgentStep, AnswerInput } from '@studio/shared';
import { isBuiltinStep } from '@studio/shared';
import { MessageCircleQuestionIcon } from 'lucide-react';

import { cn } from '@/shared/lib/utils';

/** Transcript projection for ask steps. Interactive answer lives in HitlPrompt. */
export function AskLine({ step, live }: { step: AgentStep; runId?: string; live?: boolean }) {
  if (!isBuiltinStep(step) || step.type !== 'ask') {
    return null;
  }

  const awaiting = step.status === 'awaiting_input';
  const answer = step.payload.answer;
  const options = step.payload.options ?? [];
  const active = Boolean(live && awaiting);

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
        <span className="min-w-0 truncate text-muted-foreground">{step.payload.prompt}</span>
        {awaiting ? (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">waiting…</span>
        ) : null}
      </div>

      {answer ? (
        <p className="pl-6 font-mono text-[12px] text-muted-foreground">
          {formatAnswer(answer, options)}
        </p>
      ) : null}
    </div>
  );
}

function formatAnswer(answer: AnswerInput, options: Array<{ id: string; label: string }>): string {
  const labels = (answer.optionIds ?? [])
    .map((id: any) => options.find((option) => option.id === id)?.label ?? id)
    .filter(Boolean);
  const parts = [...labels];
  if (answer.text) {
    parts.push(answer.text);
  }
  return parts.join(' · ') || 'Answered';
}
