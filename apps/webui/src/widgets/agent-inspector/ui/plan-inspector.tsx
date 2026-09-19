import { useEffect } from 'react';
import type { PlanItemStatus } from '@/entities/plan';
import { loadThreadPlan, planProgress, usePlanStore } from '@/entities/plan';
import { useSessionStore } from '@/entities/session';
import { useSelectedThread } from '@/features/desk';
import { cn } from '@/shared/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Section } from './section';

const STATUS_LABEL: Record<PlanItemStatus, string> = {
  pending: 'pending',
  in_progress: 'running',
  completed: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
};
const MARKER_CLASS: Record<PlanItemStatus, string> = {
  pending: 'border border-muted-foreground/40 bg-background',
  in_progress: 'animate-pulse bg-live',
  completed: 'bg-emerald-500',
  failed: 'bg-destructive',
  cancelled: 'bg-muted-foreground/40',
};
export function PlanInspector() {
  const thread = useSelectedThread();
  const threadId = thread?.id ?? null;
  const plan = usePlanStore((state) => (threadId ? (state.byThread[threadId] ?? null) : null));
  const streaming = useSessionStore((state) =>
    threadId ? Boolean(state.activeRuns[threadId]) : false,
  );
  useEffect(() => {
    if (threadId) {
      void loadThreadPlan(threadId);
    }
  }, [threadId]);
  useEffect(() => {
    if (threadId && !streaming) {
      void loadThreadPlan(threadId);
    }
  }, [threadId, streaming]);
  useEffect(() => {
    if (!threadId) {
      return;
    }
    const onFocus = () => {
      void loadThreadPlan(threadId);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [threadId]);
  if (!threadId || !plan || plan.items.length === 0) {
    return null;
  }
  const { done, total } = planProgress(plan);
  return (
    <Section label="Plan" hint={`${done}/${total}`}>
      <ol className="flex flex-col" data-testid="plan-inspector">
        {plan.items.map((item, index) => (
          <li key={item.id} className="relative">
            {index < plan.items.length - 1 ? (
              <span
                aria-hidden
                className="absolute top-[18px] -bottom-2 left-[11px] z-0 w-px bg-border/70"
              />
            ) : null}
            <Collapsible>
              <CollapsibleTrigger className="group flex w-full cursor-pointer items-start gap-2.5 rounded-md py-1 pr-1 pl-1.5 text-left">
                <span className="relative z-10 mt-[3px] flex size-[11px] shrink-0 items-center justify-center bg-background">
                  <span className={cn('size-2 rounded-full', MARKER_CLASS[item.status])} />
                </span>
                <span
                  className={cn(
                    'min-w-0 flex-1 text-[12px] leading-snug',
                    item.status === 'completed' || item.status === 'cancelled'
                      ? 'text-muted-foreground line-through'
                      : '',
                  )}
                >
                  {item.title}
                </span>
                {item.subagentRole ? (
                  <span className="shrink-0 pt-px font-mono text-[10px] text-muted-foreground">
                    {item.subagentRole}
                  </span>
                ) : null}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-col gap-1 py-0.5 pr-1 pb-1 pl-[27px]">
                  <p className="whitespace-pre-wrap text-[11px] text-muted-foreground leading-snug">
                    {item.description}
                  </p>
                  {item.resultNote ? (
                    <p className="whitespace-pre-wrap text-[11px] text-foreground/80 leading-snug">
                      {STATUS_LABEL[item.status]}: {item.resultNote}
                    </p>
                  ) : null}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </li>
        ))}
      </ol>
    </Section>
  );
}
