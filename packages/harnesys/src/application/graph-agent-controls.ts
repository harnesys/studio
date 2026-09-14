import {
  AGENTS_HANDOFF_TOOL,
  AGENTS_SPAWN_TOOL,
  MAP_TOOL,
  STATE_HANDOFF_AGENT_ID_KEY,
  STATE_MAP_ITEMS_KEY,
  STATE_SPAWNS_KEY,
  STATE_WAIT_UNTIL_MS_KEY,
  WAIT_TOOL,
} from '../constants.ts';
import { stateKeyOf } from './graph-helpers.ts';

export {
  AGENTS_HANDOFF_TOOL,
  AGENTS_SPAWN_TOOL,
  MAP_TOOL,
  STATE_HANDOFF_AGENT_ID_KEY,
  STATE_MAP_ITEMS_KEY,
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

/** After tool:call: queue spawn/handoff/map/wait intents onto run state for control nodes. */
export function applyAgentControlToolResults(
  results: AgentControlToolResult[],
  state: Record<string, unknown>,
): void {
  const queued: QueuedSpawnCall[] = [];
  let handoffAgentId: string | undefined;
  let mapItems: unknown[] | undefined;
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

export function appendMapResultsMessage(
  state: Record<string, unknown>,
  messagesExpr: string | undefined,
  results: unknown,
): void {
  appendAssistantNote(state, messagesExpr, `Map results:\n${JSON.stringify(results)}`);
}
