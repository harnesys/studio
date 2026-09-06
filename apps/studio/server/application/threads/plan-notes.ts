import type { LlmNoteProvider } from 'harnesys';
import type { ThreadPlanRecord } from '../../../shared/types.ts';
import type { GetThreadPlanInput } from '../plans/get-thread-plan.use-case.ts';
import { planFollowPrompt } from './plan-mode-prompt.ts';

export function createPlanNotesProvider(deps: {
  getThreadPlan: GetThreadPlanInput;
}): LlmNoteProvider {
  return async (ctx) => {
    if (!deps.getThreadPlan) {
      return [];
    }
    let plan: ThreadPlanRecord | null = null;
    try {
      plan = await deps.getThreadPlan.execute({ threadId: ctx.sessionId });
    } catch {
      return [];
    }
    if (!plan || plan.status === 'completed' || plan.status === 'cancelled') {
      return [];
    }
    const next =
      plan.items.find((item) => item.status === 'in_progress') ??
      plan.items.find((item) => item.status === 'pending');
    if (!next) {
      return [];
    }
    return [{ tag: 'active-plan', text: planFollowPrompt(plan, next) }];
  };
}
