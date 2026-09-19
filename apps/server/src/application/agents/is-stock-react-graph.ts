import type { AgentGraph } from '../../domain/agent.port.ts';
import { buildReactGraph } from './react-preset.ts';
export function isStockReactGraph(graph: AgentGraph): boolean {
  return stableGraphKey(withoutThinkTools(graph)) === stableGraphKey(buildReactGraph());
}
function withoutThinkTools(graph: AgentGraph): AgentGraph {
  const think = graph.nodes.think;
  if (think === undefined || think.type !== 'llm:generate' || think.tools === undefined) {
    return graph;
  }
  const { tools: _snapshot, ...rest } = think;
  return { ...graph, nodes: { ...graph.nodes, think: rest } };
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
