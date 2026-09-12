import type { Edge, Node } from 'harnesys';
import type {
  AgentGraph,
  AgentGraphLayout,
  AgentGraphPosition,
  AgentGraphRankdir,
} from '../../../../domain/agent.port.ts';

const EMPTY_GRAPH: AgentGraph = { nodes: {}, edges: [] };

/** Parses the stored `graph_json` column; malformed content falls back to the empty graph. */
export function parseGraph(raw: string | null): AgentGraph {
  if (!raw) {
    return EMPTY_GRAPH;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return EMPTY_GRAPH;
    }
    const obj = parsed as Record<string, unknown>;
    const nodes = typeof obj.nodes === 'object' && obj.nodes !== null ? obj.nodes : {};
    const edges = Array.isArray(obj.edges) ? obj.edges : [];
    const layout = parseLayout(obj.layout);
    return {
      nodes: nodes as Record<string, Node>,
      edges: edges as Edge[],
      ...(layout !== undefined ? { layout } : {}),
    };
  } catch {
    return EMPTY_GRAPH;
  }
}

function parseLayout(raw: unknown): AgentGraphLayout | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const rankdir = parseRankdir(obj.rankdir);
  if (rankdir === undefined) {
    return undefined;
  }
  if (!obj.positions || typeof obj.positions !== 'object' || Array.isArray(obj.positions)) {
    return undefined;
  }
  const positions: Record<string, AgentGraphPosition> = {};
  for (const [id, value] of Object.entries(obj.positions as Record<string, unknown>)) {
    const position = parsePosition(value);
    if (position === undefined) {
      return undefined;
    }
    positions[id] = position;
  }
  return { rankdir, positions };
}

function parseRankdir(raw: unknown): AgentGraphRankdir | undefined {
  if (raw === 'TB' || raw === 'LR') {
    return raw;
  }
  return undefined;
}

function parsePosition(raw: unknown): AgentGraphPosition | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.x !== 'number' || typeof obj.y !== 'number') {
    return undefined;
  }
  return { x: obj.x, y: obj.y };
}
