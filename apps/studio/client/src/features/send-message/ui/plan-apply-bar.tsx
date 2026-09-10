import { useState } from 'react';
import { useSessionStore } from '@/entities/session';
import { useSelectedThread } from '@/features/desk';
import { Button } from '@/shared/ui/button';
import { InputGroupAddon } from '@/shared/ui/input-group';
import { toast } from '@/shared/ui/toast';

import { applyApprovedPlan, usePlanApplyStore } from '../model/plan-apply';
import { HitlShell } from './hitl-shell';

export function PlanApplyBar() {
  const thread = useSelectedThread();
  const threadId = thread?.id ?? '';
  const pending = usePlanApplyStore((state) =>
    threadId ? Boolean(state.byThread[threadId]) : false,
  );
  const clear = usePlanApplyStore((state) => state.clear);
  const streaming = useSessionStore((state) =>
    threadId ? Boolean(state.activeRuns[threadId]) : false,
  );
  const [busy, setBusy] = useState(false);

  if (!threadId || !pending || streaming) {
    return null;
  }

  const apply = async () => {
    if (busy) {
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
    <div className="mx-auto w-full max-w-3xl px-4 pb-2" data-testid="plan-apply-bar">
      <HitlShell>
        <div className="flex flex-col gap-0.5 px-3 pt-2.5">
          <p className="font-medium text-sm">Plan saved</p>
          <p className="text-[11px] text-muted-foreground">
            Apply switches to Edit automatically and starts the plan. Cancel keeps it in the
            Inspector.
          </p>
        </div>
        <InputGroupAddon align="block-end" className="justify-end gap-1 px-2 pb-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            className="h-7"
            onClick={() => clear(threadId)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            className="h-7"
            onClick={() => void apply()}
          >
            Apply
          </Button>
        </InputGroupAddon>
      </HitlShell>
    </div>
  );
}
