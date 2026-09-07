import type { AgentGraph } from '../../domain/agent.port.ts';
import { buildReactGraph } from './react-preset.ts';

/** True when `graph` matches the default ReAct template (tools on think may differ). */
export function isStockReactGraph(graph: AgentGraph): boolean {
  const think = graph.nodes.think;
  const tools =
    think !== undefined && think.type === 'llm:generate' && Array.isArray(think.tools)
      ? think.tools
      : [];
  return stableGraphKey(graph) === stableGraphKey(buildReactGraph(tools));
}

function stableGraphKey(graph: AgentGraph): string {
  const nodeKeys = Object.keys(graph.nodes).sort();
  const nodes = Object.fromEntries(nodeKeys.map((key) => [key, graph.nodes[key]]));
  const edges = [...graph.edges].sort((a, b) => {
    const from = a.from.localeCompare(b.from);
    if (from !== 0) {
      return from;
    }
    const to = a.to.localeCompare(b.to);
    if (to !== 0) {
      return to;
    }
    return String(a.when ?? '').localeCompare(String(b.when ?? ''));
  });
  return JSON.stringify({ nodes, edges });
}
