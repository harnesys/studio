import {
  AGENTS_HANDOFF_TOOL,
  AGENTS_SPAWN_TOOL,
  MAP_TOOL,
  STATE_HANDOFF_AGENT_ID_KEY,
  STATE_MAP_INSTRUCTION_KEY,
  STATE_MAP_ITEMS_KEY,
  STATE_MAP_MAX_TOKENS_KEY,
  STATE_SPAWNS_KEY,
  STATE_WAIT_UNTIL_MS_KEY,
  WAIT_TOOL,
} from '../constants.ts';
import type { AgentNodes } from '../domain/agent-definition.ts';
import { stateKeyOf } from './graph-helpers.ts';

export {
  AGENTS_HANDOFF_TOOL,
  AGENTS_SPAWN_TOOL,
  MAP_TOOL,
  STATE_HANDOFF_AGENT_ID_KEY,
  STATE_MAP_INSTRUCTION_KEY,
  STATE_MAP_ITEMS_KEY,
  STATE_MAP_MAX_TOKENS_KEY,
  STATE_SPAWNS_KEY,
  STATE_WAIT_UNTIL_MS_KEY,
  WAIT_TOOL,
};

export type AgentControlToolResult = {
  name: string;
  result: unknown;
  isError?: boolean;
};

export type QueuedSpawnCall = {
  agentId: string;
  input: unknown;
  budget?: unknown;
  /** Frozen at queue time so retries reuse the same child run lineage. */
  spawnId: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return null;
  }
  return v as Record<string, unknown>;
}

function spawnInputOf(input: unknown): unknown {
  if (typeof input === 'string') {
    return { messages: [{ role: 'user', content: input }] };
  }
  return input;
}

function spawnCallsOf(result: unknown): QueuedSpawnCall[] {
  const rec = asRecord(result);
  if (!rec || !Array.isArray(rec.calls)) {
    return [];
  }
  const out: QueuedSpawnCall[] = [];
  for (const item of rec.calls) {
    const row = asRecord(item);
    if (!row || typeof row.agentId !== 'string' || !row.agentId) {
      continue;
    }
    out.push({
      agentId: row.agentId,
      input: spawnInputOf(row.input),
      ...(row.budget !== undefined ? { budget: row.budget } : {}),
      spawnId: crypto.randomUUID(),
    });
  }
  return out;
}

function handoffAgentIdOf(result: unknown): string | undefined {
  const rec = asRecord(result);
  if (!rec || typeof rec.agentId !== 'string' || !rec.agentId) {
    return undefined;
  }
  return rec.agentId;
}

/** Control-intent tool name → the control node that must exist in this agent's plan. */
const CONTROL_INTENTS: Record<string, { nodeType: string; hint: string }> = {
  [AGENTS_SPAWN_TOOL]: {
    nodeType: 'control:spawn',
    hint: 'Run the work inline or add a control:spawn node via the agent form.',
  },
  [AGENTS_HANDOFF_TOOL]: {
    nodeType: 'control:handoff',
    hint: 'Keep the thread and do the work yourself, or add a control:handoff node via the agent form.',
  },
  [MAP_TOOL]: {
    nodeType: 'control:map',
    hint: 'Process the items inline or add a control:map node via the agent form.',
  },
  [WAIT_TOOL]: {
    nodeType: 'control:wait',
    hint: 'Continue without pausing or add a control:wait node via the agent form.',
  },
};

export function collectPlanNodeTypes(nodes: AgentNodes): Set<string> {
  const out = new Set<string>();
  for (const n of Object.values(nodes)) {
    out.add(n.type);
  }
  return out;
}

/**
 * Denial text when a control-intent tool ran fine but this agent's plan has no
 * node to honor it; the intent must not be parked into state. Null planNodeTypes
 * (no graph context) disables the check.
 */
export function unsupportedControlIntentText(
  name: string,
  planNodeTypes: ReadonlySet<string> | undefined,
): string | null {
  if (planNodeTypes === undefined) {
    return null;
  }
  const intent = CONTROL_INTENTS[name];
  if (!intent || planNodeTypes.has(intent.nodeType)) {
    return null;
  }
  return `no ${intent.nodeType} node in this agent's graph; the intent is not queued. ${intent.hint}`;
}

/** After tool:call: queue spawn/handoff/map/wait intents onto run state for control nodes. */
export function applyAgentControlToolResults(
  results: AgentControlToolResult[],
  state: Record<string, unknown>,
): void {
  const queued: QueuedSpawnCall[] = [];
  let handoffAgentId: string | undefined;
  let mapItems: unknown[] | undefined;
  let mapInstruction: string | undefined;
  let mapMaxTokensPerItem: number | undefined;
  let waitUntilMs: number | undefined;
  for (const row of results) {
    if (row.isError) {
      continue;
    }
    if (row.name === AGENTS_SPAWN_TOOL) {
      queued.push(...spawnCallsOf(row.result));
    } else if (row.name === AGENTS_HANDOFF_TOOL) {
      const id = handoffAgentIdOf(row.result);
      if (id) {
        handoffAgentId = id;
      }
    } else if (row.name === MAP_TOOL) {
      const rec = asRecord(row.result);
      if (rec && Array.isArray(rec.items)) {
        mapItems = rec.items;
      }
      if (rec && typeof rec.instruction === 'string' && rec.instruction.trim().length > 0) {
        mapInstruction = rec.instruction;
      }
      if (
        rec &&
        typeof rec.maxTokensPerItem === 'number' &&
        Number.isInteger(rec.maxTokensPerItem) &&
        rec.maxTokensPerItem >= 1
      ) {
        mapMaxTokensPerItem = rec.maxTokensPerItem;
      }
    } else if (row.name === WAIT_TOOL) {
      const rec = asRecord(row.result);
      if (rec && typeof rec.waitUntilMs === 'number' && Number.isFinite(rec.waitUntilMs)) {
        waitUntilMs = rec.waitUntilMs;
      }
    }
  }
  if (queued.length > 0) {
    const prev = state[STATE_SPAWNS_KEY];
    const prior = Array.isArray(prev) ? (prev as QueuedSpawnCall[]) : [];
    state[STATE_SPAWNS_KEY] = [...prior, ...queued];
  }
  if (handoffAgentId) {
    state[STATE_HANDOFF_AGENT_ID_KEY] = handoffAgentId;
  }
  if (mapItems !== undefined) {
    state[STATE_MAP_ITEMS_KEY] = mapItems;
  }
  if (mapInstruction !== undefined) {
    state[STATE_MAP_INSTRUCTION_KEY] = mapInstruction;
  }
  if (mapMaxTokensPerItem !== undefined) {
    state[STATE_MAP_MAX_TOKENS_KEY] = mapMaxTokensPerItem;
  }
  if (waitUntilMs !== undefined) {
    state[STATE_WAIT_UNTIL_MS_KEY] = waitUntilMs;
  }
}

export function clearQueuedSpawns(state: Record<string, unknown>): void {
  delete state[STATE_SPAWNS_KEY];
}

export function clearQueuedHandoff(state: Record<string, unknown>): void {
  delete state[STATE_HANDOFF_AGENT_ID_KEY];
}

export function clearQueuedMap(state: Record<string, unknown>): void {
  delete state[STATE_MAP_ITEMS_KEY];
  delete state[STATE_MAP_INSTRUCTION_KEY];
  delete state[STATE_MAP_MAX_TOKENS_KEY];
}

export function clearQueuedWait(state: Record<string, unknown>): void {
  delete state[STATE_WAIT_UNTIL_MS_KEY];
}

export function appendAssistantNote(
  state: Record<string, unknown>,
  messagesExpr: string | undefined,
  text: string,
): void {
  const key = messagesExpr ? stateKeyOf(messagesExpr) : 'messages';
  if (!key) {
    return;
  }
  let arr = state[key];
  if (!Array.isArray(arr)) {
    arr = [];
    state[key] = arr;
  }
  (arr as unknown[]).push({ role: 'assistant', content: text });
}

export function appendSpawnResultsMessage(
  state: Record<string, unknown>,
  messagesExpr: string | undefined,
  results: unknown,
): void {
  const key = messagesExpr ? stateKeyOf(messagesExpr) : 'messages';
  if (!key) {
    return;
  }
  let arr = state[key];
  if (!Array.isArray(arr)) {
    arr = [];
    state[key] = arr;
  }
  const parts = [`Spawn results:\n${JSON.stringify(results)}`];
  const blockedLines: string[] = [];
  if (Array.isArray(results)) {
    for (const item of results) {
      const rec = asRecord(item);
      const blocked = rec?.blocked;
      if (!Array.isArray(blocked)) {
        continue;
      }
      for (const b of blocked) {
        const row = asRecord(b);
        if (row && typeof row.tool === 'string' && typeof row.reason === 'string') {
          blockedLines.push(`${row.tool}: ${row.reason}`);
        }
      }
    }
  }
  if (blockedLines.length > 0) {
    parts.push(`Blocked in sandbox:\n${blockedLines.join('\n')}`);
  }
  (arr as unknown[]).push({
    role: 'assistant',
    content: parts.join('\n'),
  });
}

/** Worker output keys withheld from the model context; stored results keep them. */
const MAP_RESULT_NOISE_KEYS = ['reasoning', 'usage'];

function stripMapResultNoise(item: unknown): unknown {
  const rec = asRecord(item);
  const out = rec ? asRecord(rec.output) : null;
  if (!rec || !out) {
    return item;
  }
  let cleaned: Record<string, unknown> | null = null;
  for (const key of MAP_RESULT_NOISE_KEYS) {
    if (key in out) {
      cleaned ??= { ...out };
      delete cleaned[key];
    }
  }
  return cleaned ? { ...rec, output: cleaned } : item;
}

export function appendMapResultsMessage(
  state: Record<string, unknown>,
  messagesExpr: string | undefined,
  results: unknown,
): void {
  const shown = Array.isArray(results) ? results.map(stripMapResultNoise) : results;
  appendAssistantNote(state, messagesExpr, `Map results:\n${JSON.stringify(shown)}`);
}
