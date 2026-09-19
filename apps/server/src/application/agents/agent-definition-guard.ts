import type { AgentBudget } from '@harnesys/studio-shared';
import { type AgentGraph as HarnesysAgentGraph, validateStructural } from 'harnesys';
import type { AgentGraph } from '../../domain/agent.port.ts';
import { ValidationError } from '../../domain/studio.error.ts';
export type AgentGraphInput = {
  id: string;
  graph: AgentGraph;
  budget: AgentBudget | null;
};
export function harnesysGraphOf(graph: AgentGraph): HarnesysAgentGraph {
  return { nodes: graph.nodes, edges: graph.edges };
}
export function assertAgentGraphValid(input: AgentGraphInput): void {
  const diagnostics = validateStructural({
    id: input.id,
    prompts: { main: { instructions: '' } },
    graph: harnesysGraphOf(input.graph),
    budget: input.budget ?? undefined,
  });
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    throw new ValidationError(errors.map((d) => `${d.code}: ${d.message}`).join('; '));
  }
}
