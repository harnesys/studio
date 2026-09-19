import type { Edge as FlowEdge, Node as FlowNode } from '@xyflow/react';
import type { Edge, Expr, Node } from 'harnesys';
export type GraphRankdir = 'TB' | 'LR';
export type GraphNodePosition = {
  x: number;
  y: number;
};
export type StudioGraphLayout = {
  rankdir: GraphRankdir;
  positions: Record<string, GraphNodePosition>;
};
export type StudioGraphDocument = {
  nodes: Record<string, Node>;
  edges: Edge[];
  layout?: StudioGraphLayout;
};
export type HarnesysGraph = {
  nodes: Record<string, Node>;
  edges: Edge[];
};
export type AgentGraphFlowNodeData = {
  spec: Node;
  rankdir: GraphRankdir;
};
export type AgentGraphFlowEdgeData = {
  when?: Expr;
};
export type AgentGraphFlowNode = FlowNode<AgentGraphFlowNodeData, 'agent-graph-node'>;
export type AgentGraphFlowEdge = FlowEdge<AgentGraphFlowEdgeData>;
const DEFAULT_THINK: Node = {
  type: 'llm:generate',
  prompt: 'main',
  messages: '$state.messages',
};
const DEFAULT_REACT_NODES: Record<string, Node> = {
  start: { type: 'core:start' },
  think: DEFAULT_THINK,
  act: {
    type: 'tool:call',
    calls: '$output.toolCalls',
    concurrency: 'parallel',
  },
  end: { type: 'core:end' },
};
const DEFAULT_REACT_EDGES: Edge[] = [
  { from: 'start', to: 'think' },
  { from: 'think', to: 'act', when: '$output.finishReason = "tool-calls"' },
  { from: 'think', to: 'end', when: '$output.finishReason = "stop"' },
  { from: 'think', to: 'end' },
  { from: 'act', to: 'think' },
];
export function harnesysGraphOf(doc: StudioGraphDocument): HarnesysGraph {
  return { nodes: doc.nodes, edges: doc.edges };
}
export function defaultReactGraph(): StudioGraphDocument {
  return {
    nodes: { ...DEFAULT_REACT_NODES },
    edges: DEFAULT_REACT_EDGES.map((edge) => ({ ...edge })),
  };
}
export function toFlow(doc: StudioGraphDocument): {
  nodes: AgentGraphFlowNode[];
  edges: AgentGraphFlowEdge[];
} {
  const rankdir = doc.layout?.rankdir ?? 'TB';
  const positions = doc.layout?.positions ?? {};
  const nodes: AgentGraphFlowNode[] = Object.entries(doc.nodes).map(([id, spec]) => {
    const position = positions[id] ?? { x: 0, y: 0 };
    return {
      id,
      type: 'agent-graph-node',
      position,
      data: { spec, rankdir },
    };
  });
  const edges: AgentGraphFlowEdge[] = doc.edges.map((edge, index) => ({
    id: `e-${index}-${edge.from}-${edge.to}`,
    source: edge.from,
    target: edge.to,
    data: edge.when !== undefined ? { when: edge.when } : {},
  }));
  return { nodes, edges };
}
export function fromFlow(
  nodes: AgentGraphFlowNode[],
  edges: AgentGraphFlowEdge[],
  rankdir: GraphRankdir,
): StudioGraphDocument {
  const graphNodes: Record<string, Node> = {};
  const positions: Record<string, GraphNodePosition> = {};
  for (const node of nodes) {
    graphNodes[node.id] = node.data.spec;
    positions[node.id] = { x: node.position.x, y: node.position.y };
  }
  const graphEdges: Edge[] = edges.map((edge) => {
    const when = edge.data?.when;
    if (when !== undefined && when !== '') {
      return { from: edge.source, to: edge.target, when };
    }
    return { from: edge.source, to: edge.target };
  });
  return {
    nodes: graphNodes,
    edges: graphEdges,
    layout: { rankdir, positions },
  };
}
