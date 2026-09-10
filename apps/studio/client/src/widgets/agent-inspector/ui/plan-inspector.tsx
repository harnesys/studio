import {
  CircleCheckIcon,
  CircleIcon,
  CircleXIcon,
  ClipboardListIcon,
  LoaderCircleIcon,
  MinusCircleIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PlanItemStatus } from '@/entities/plan';
import { loadThreadPlan, planProgress, usePlanStore } from '@/entities/plan';
import { useSessionStore } from '@/entities/session';
import { useSelectedThread } from '@/features/desk';
import { applyApprovedPlan, usePlanApplyStore } from '@/features/send-message';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Progress } from '@/shared/ui/progress';
import { toast } from '@/shared/ui/toast';

const STATUS_ICON: Record<PlanItemStatus, typeof CircleIcon> = {
  pending: CircleIcon,
  in_progress: LoaderCircleIcon,
  completed: CircleCheckIcon,
  failed: CircleXIcon,
  cancelled: MinusCircleIcon,
};

const STATUS_CLASS: Record<PlanItemStatus, string> = {
  pending: 'text-muted-foreground',
  in_progress: 'text-live animate-spin',
  completed: 'text-emerald-500',
  failed: 'text-destructive',
  cancelled: 'text-muted-foreground/50',
};

const STATUS_LABEL: Record<PlanItemStatus, string> = {
  pending: 'pending',
  in_progress: 'running',
  completed: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
};

export function PlanInspector() {
  const thread = useSelectedThread();
  const threadId = thread?.id ?? null;
  const plan = usePlanStore((state) => (threadId ? (state.byThread[threadId] ?? null) : null));
  const streaming = useSessionStore((state) =>
    threadId ? Boolean(state.activeRuns[threadId]) : false,
  );
  const applyArmed = usePlanApplyStore((state) =>
    threadId ? Boolean(state.byThread[threadId]) : false,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (threadId) {
      loadThreadPlan(threadId);
    }
  }, [threadId]);

  if (!threadId || !plan || plan.items.length === 0) {
    return null;
  }

  const { done, total } = planProgress(plan);
  const canApply = plan.status === 'approved' && !streaming && !applyArmed && done === 0;

  const onApply = async () => {
    if (busy || !threadId) {
      return;
    }
    setBusy(true);
    try {
      await applyApprovedPlan(threadId);
    } catch (error) {
      toast.add({
        title: 'Could not start plan',
        description: error instanceof Error ? error.message : 'Apply failed',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-2" data-testid="plan-inspector">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="inline-flex items-center gap-1.5 font-medium text-[11px] text-muted-foreground">
          <ClipboardListIcon className="size-3.5" />
          Plan
        </h2>
        <span className="font-mono text-[10px] text-muted-foreground/80">
          {done}/{total}
        </span>
      </div>
      {canApply ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          className="h-7 w-full text-[11px]"
          onClick={() => void onApply()}
        >
          Apply plan
        </Button>
      ) : null}
      <Progress value={total > 0 ? (done / total) * 100 : 0} className="h-1" />
      <div className="flex flex-col gap-0.5">
        {plan.items.map((item) => {
          const Icon = STATUS_ICON[item.status];
          return (
            <Collapsible key={item.id}>
              <CollapsibleTrigger className="group flex w-full items-start gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/60">
                <Icon className={cn('mt-0.5 size-3.5 shrink-0', STATUS_CLASS[item.status])} />
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
                  <Badge variant="secondary" className="px-1 py-0 font-normal text-[9px]">
                    {item.subagentRole}
                  </Badge>
                ) : null}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-[10px] flex flex-col gap-1 border-l pt-0.5 pb-1 pl-2">
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
          );
        })}
      </div>
    </section>
  );
}
