import dagre from 'dagre';

import type { GraphNodePosition, GraphRankdir } from './agent-graph-document';

export const GRAPH_NODE_WIDTH = 168;
export const GRAPH_NODE_HEIGHT = 48;

export type LayoutGraphNode = { id: string };
export type LayoutGraphEdge = { source: string; target: string };

/** Dagre positions as xyflow top-left coordinates. */
export function layoutGraph(
  nodes: LayoutGraphNode[],
  edges: LayoutGraphEdge[],
  rankdir: GraphRankdir,
): Record<string, GraphNodePosition> {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir,
    nodesep: 60,
    ranksep: 80,
    marginx: 40,
    marginy: 40,
  });

  for (const node of nodes) {
    graph.setNode(node.id, { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const positions: Record<string, GraphNodePosition> = {};
  for (const node of nodes) {
    const placed = graph.node(node.id);
    positions[node.id] = {
      x: placed.x - GRAPH_NODE_WIDTH / 2,
      y: placed.y - GRAPH_NODE_HEIGHT / 2,
    };
  }
  return positions;
}
