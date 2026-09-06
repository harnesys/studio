import { validateStructural } from 'harnesys';
import type { AgentBudget } from '../../../shared/types.ts';
import type { AgentGraph } from '../../domain/agent.port.ts';
import { ValidationError } from '../../domain/studio.error.ts';

export type AgentGraphInput = {
  id: string;
  graph: AgentGraph;
  budget: AgentBudget | null;
};

/** Save-time gate: shape-agnostic, presets and hand-built graphs go through one validator. */
export function assertAgentGraphValid(input: AgentGraphInput): void {
  const diagnostics = validateStructural({
    id: input.id,
    prompts: { main: { instructions: '' } },
    graph: input.graph,
    budget: input.budget ?? undefined,
  });
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    throw new ValidationError(errors.map((d) => `${d.code}: ${d.message}`).join('; '));
  }
}
