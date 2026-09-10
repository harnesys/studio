import type { RunLifecycleStore, SessionEvent } from 'harnesys';
import { SUBAGENT_ROLES, type SubagentRole } from 'harnesys/domain';
import type { SavePlanItemInput } from '../../../shared/types.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { SavePlanInput } from '../plans/save-plan.use-case.ts';

const ROLE_SET = new Set<string>(SUBAGENT_ROLES);

type AskEvent = Extract<SessionEvent, { type: 'ask' }>;

export function proposalAction(payload: unknown): 'approve' | 'revise' | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const action = (payload as { action?: unknown }).action;
  if (action === 'approve' || action === 'revise') {
    return action;
  }
  return null;
}

export function lastAskFor(events: SessionEvent[], askId: string): AskEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.type === 'ask' && event.askId === askId) {
      return event;
    }
  }
  return null;
}

function asRole(value: unknown): SubagentRole | undefined {
  if (value === 'main') {
    return 'general';
  }
  if (typeof value === 'string' && ROLE_SET.has(value)) {
    return value as SubagentRole;
  }
  return undefined;
}

function overviewOf(input: unknown): string {
  if (!input || typeof input !== 'object') {
    return '';
  }
  const overview = (input as { overview?: unknown }).overview;
  return typeof overview === 'string' ? overview.trim() : '';
}

function itemsOf(input: unknown): SavePlanItemInput[] {
  if (!input || typeof input !== 'object') {
    return [];
  }
  const raw = (input as { items?: unknown }).items;
  if (!Array.isArray(raw)) {
    return [];
  }
  const items: SavePlanItemInput[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const rec = row as { title?: unknown; description?: unknown; subagentRole?: unknown };
    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    const description = typeof rec.description === 'string' ? rec.description.trim() : '';
    if (!title || !description) {
      continue;
    }
    const item: SavePlanItemInput = { title, description };
    const role = asRole(rec.subagentRole);
    if (role) {
      item.subagentRole = role;
    }
    items.push(item);
  }
  return items;
}

function lastProposeCallId(events: SessionEvent[]): string {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.type === 'tool' && event.name === 'plan_propose' && event.toolCallId) {
      return event.toolCallId;
    }
  }
  return '';
}

export async function settlePlanProposalApprove(deps: {
  lifecycle: RunLifecycleStore;
  savePlan: SavePlanInput;
  runId: string;
  threadId: string;
  askId: string;
  ask: AskEvent;
  journal: SessionEvent[];
}): Promise<void> {
  const input = deps.ask.tool?.input;
  const items = itemsOf(input);
  if (items.length === 0) {
    throw new ValidationError('plan_propose has no tasks to save');
  }
  const plan = await deps.savePlan.execute({
    threadId: deps.threadId,
    overview: overviewOf(input),
    items,
    status: 'approved',
  });
  const rec = await deps.lifecycle.get(deps.runId);
  if (!rec) {
    throw new NotFoundError('run not found');
  }
  const toolCallId = deps.ask.tool?.toolCallId || lastProposeCallId(deps.journal);
  const output = JSON.stringify({
    ok: true,
    action: 'approved',
    planId: plan.id,
    totalItems: plan.items.length,
    planStatus: plan.status,
    message: `Plan saved (${plan.items.length} tasks). Apply from the UI to start execution.`,
  });
  await deps.lifecycle.transition(deps.runId, rec.leaseEpoch, {
    from: 'needs_input',
    to: 'completed',
    interruptId: null,
    events: [
      { type: 'hitl.answer', interruptId: deps.askId, payload: { action: 'approve' } },
      {
        type: 'tool',
        phase: 'completed',
        toolCallId,
        name: 'plan_propose',
        output,
      },
      { type: 'done', text: 'Plan saved. Apply to start execution.' },
    ],
  });
}

export async function settlePlanProposalCancel(deps: {
  lifecycle: RunLifecycleStore;
  runId: string;
  askId: string;
  note?: string;
}): Promise<void> {
  const rec = await deps.lifecycle.get(deps.runId);
  if (!rec) {
    throw new NotFoundError('run not found');
  }
  const message = deps.note?.trim() || 'Plan proposal cancelled';
  await deps.lifecycle.transition(deps.runId, rec.leaseEpoch, {
    from: 'needs_input',
    to: 'cancelled',
    interruptId: null,
    events: [
      {
        type: 'hitl.answer',
        interruptId: deps.askId,
        rejected: true,
        note: deps.note,
      },
      { type: 'error', code: 'cancelled', message },
    ],
  });
}
