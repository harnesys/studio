import { stateKeyOf } from './graph-helpers.ts';

export const AGENTS_SPAWN_TOOL = 'agents_spawn';
export const AGENTS_HANDOFF_TOOL = 'agents_handoff';
export const STATE_SPAWNS_KEY = 'spawns';
export const STATE_HANDOFF_AGENT_ID_KEY = 'handoffAgentId';

export type AgentControlToolResult = {
  name: string;
  result: unknown;
  isError?: boolean;
};

export type QueuedSpawnCall = {
  agentId: string;
  input: unknown;
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
    out.push({ agentId: row.agentId, input: spawnInputOf(row.input) });
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

/** After tool:call: queue spawn/handoff intents onto run state for control nodes. */
export function applyAgentControlToolResults(
  results: AgentControlToolResult[],
  state: Record<string, unknown>,
): void {
  const queued: QueuedSpawnCall[] = [];
  let handoffAgentId: string | undefined;
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
}

export function clearQueuedSpawns(state: Record<string, unknown>): void {
  delete state[STATE_SPAWNS_KEY];
}

export function clearQueuedHandoff(state: Record<string, unknown>): void {
  delete state[STATE_HANDOFF_AGENT_ID_KEY];
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
  (arr as unknown[]).push({
    role: 'assistant',
    content: `Spawn results:\n${JSON.stringify(results)}`,
  });
}
