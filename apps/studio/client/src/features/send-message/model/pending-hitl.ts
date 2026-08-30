import type { AgentStep, Journal } from '@studio/shared';
import { isAgentEntry, isBuiltinStep } from '@studio/shared';

export type PendingConfirm = {
  kind: 'confirm';
  runId: string;
  step: AgentStep;
};

export type PendingAsk = {
  kind: 'ask';
  runId: string;
  step: AgentStep;
};

export type PendingHitl = PendingConfirm | PendingAsk;

/** First awaiting_* step on the latest agent entry (by step.seq). */
export function pendingHitl(journal: Journal): PendingHitl | null {
  const agent = [...journal.entries].reverse().find(isAgentEntry);
  if (!agent) {
    return null;
  }

  const awaiting = agent.steps
    .filter((step: any) => step.status === 'awaiting_confirm' || step.status === 'awaiting_input')
    .sort((a: any, b: any) => a.seq - b.seq);

  const step = awaiting[0];
  if (!step || !isBuiltinStep(step)) {
    return null;
  }

  if (step.type === 'tool_call' && step.status === 'awaiting_confirm') {
    return { kind: 'confirm', runId: agent.id, step };
  }
  if (step.type === 'ask' && step.status === 'awaiting_input') {
    return { kind: 'ask', runId: agent.id, step };
  }
  return null;
}
