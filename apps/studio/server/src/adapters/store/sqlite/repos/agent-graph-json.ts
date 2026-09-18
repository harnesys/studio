import type { Edge, Node } from 'harnesys';
import type {
  AgentGraph,
  AgentGraphLayout,
  AgentGraphPosition,
  AgentGraphRankdir,
} from '../../../../domain/agent.port.ts';

const EMPTY_GRAPH: AgentGraph = { nodes: {}, edges: [] };

/** Parses the stored `graph_json` column; malformed content falls back to the empty graph.
 *  Legacy-снапшоты `tools` на llm-нодах снимаются: единственный источник правды по
 *  набору инструментов — grant-слой (`capabilities_json`), список ноды — только
 *  авторское сужение и живёт лишь под маркером `toolPolicy: 'explicit'`. */
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
    const nodes =
      typeof obj.nodes === 'object' && obj.nodes !== null
        ? (obj.nodes as Record<string, unknown>)
        : {};
    const edges = Array.isArray(obj.edges) ? obj.edges : [];
    const layout = parseLayout(obj.layout);
    const explicit = obj.toolPolicy === 'explicit';
    return {
      nodes: explicit ? (nodes as Record<string, Node>) : stripLegacyTools(nodes),
      edges: edges as Edge[],
      ...(layout !== undefined ? { layout } : {}),
      ...(explicit ? { toolPolicy: 'explicit' as const } : {}),
    };
  } catch {
    return EMPTY_GRAPH;
  }
}

function stripLegacyTools(nodes: Record<string, unknown>): Record<string, Node> {
  const out: Record<string, Node> = {};
  for (const [id, node] of Object.entries(nodes)) {
    if (
      node &&
      typeof node === 'object' &&
      !Array.isArray(node) &&
      (node as Record<string, unknown>).type === 'llm:generate' &&
      Array.isArray((node as Record<string, unknown>).tools)
    ) {
      const { tools: _snapshot, ...rest } = node as Record<string, unknown>;
      out[id] = rest as Node;
      continue;
    }
    out[id] = node as Node;
  }
  return out;
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
