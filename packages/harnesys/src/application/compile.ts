import type { AgentDefinition, AgentEdges, AgentNodes } from '../domain/agent-definition.ts';
import type { Diagnostic } from '../domain/errors.ts';
import { validateStructural } from './validate.ts';

export type Plan = {
  nodes: AgentNodes;
  edgesByFrom: Map<string, AgentEdges>;
  order: string[];
};

export function compile(def: AgentDefinition): { plan: Plan; diagnostics: Diagnostic[] } {
  const diagnostics = validateStructural(def);
  const edgesByFrom = new Map<string, AgentEdges>();
  for (const e of def.graph.edges) {
    const arr = edgesByFrom.get(e.from);
    if (arr) {
      arr.push(e);
    } else {
      edgesByFrom.set(e.from, [e]);
    }
  }
  const plan: Plan = {
    nodes: def.graph.nodes,
    edgesByFrom,
    order: Object.keys(def.graph.nodes),
  };
  return { plan, diagnostics };
}
