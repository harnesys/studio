import { bindingOf } from '../adapters/models/binding.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Snapshot } from '../domain/snapshot.ts';
import type { ModelsPort, ProviderConfig } from '../ports/models.ts';
import type { ToolCallResult } from './tool-call.ts';

export type MergeStateFn = (key: string, a: unknown, b: unknown) => unknown;

export function isPort(v: ProviderConfig[] | ModelsPort): v is ModelsPort {
  return typeof (v as ModelsPort).get === 'function';
}

function resolveModelCoords(
  ref: string | { provider: string; model: string } | undefined,
  agent: AgentDefinition,
): { provider: string; model: string } | null {
  if (typeof ref === 'string') {
    const mapped = agent.models?.[ref];
    if (mapped) {
      return { provider: mapped.provider, model: mapped.model };
    }
    return null;
  }
  if (ref && typeof ref === 'object' && 'provider' in ref) {
    const pn = (ref as { provider: string }).provider;
    const mn = (ref as { model: string }).model;
    if (pn && mn) {
      return { provider: pn, model: mn };
    }
    return null;
  }
  if (agent.model) {
    return { provider: agent.model.provider, model: agent.model.model };
  }
  return null;
}

export function findBind(
  models: ProviderConfig[] | ModelsPort,
  ref: string | { provider: string; model: string } | undefined,
  agent: AgentDefinition,
) {
  const coords = resolveModelCoords(ref, agent);
  if (!coords?.model) {
    return null;
  }
  if (isPort(models)) {
    return null;
  }
  const arr = models as ProviderConfig[];
  const p = arr.find((x) => x.name === coords.provider);
  if (!p) {
    return null;
  }
  try {
    return { binding: bindingOf(p, coords.model) };
  } catch {
    return null;
  }
}

export function resolveModelForPort(
  ref: string | { provider: string; model: string } | undefined,
  agent: AgentDefinition,
): { provider: string; model: string } | null {
  return resolveModelCoords(ref, agent);
}

export function deepMerge(a: unknown, b: unknown): unknown {
  if (Array.isArray(a) && Array.isArray(b)) {
    return [...a, ...b];
  }
  if (
    a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
    for (const [k, v] of Object.entries(b as Record<string, unknown>)) {
      out[k] = k in out ? deepMerge(out[k], v) : v;
    }
    return out;
  }
  return b;
}

export function applyReducer(
  key: string,
  prev: unknown,
  next: unknown,
  opts: { reducers?: Record<string, 'replace' | 'merge'>; mergeState?: MergeStateFn },
) {
  if (opts.mergeState) {
    return opts.mergeState(key, prev, next);
  }
  return opts.reducers?.[key] === 'replace' ? next : deepMerge(prev, next);
}

export function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return String(h);
}

export type ReActOutput = { results: ToolCallResult[] };

type SnapshotToolCall = {
  id: string;
  name: string;
};

function asSnapshotToolCall(value: unknown): SnapshotToolCall | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const rec = value as { id?: unknown; toolCallId?: unknown; name?: unknown };
  let id: string | null = null;
  if (typeof rec.id === 'string' && rec.id !== '') {
    id = rec.id;
  } else if (typeof rec.toolCallId === 'string' && rec.toolCallId !== '') {
    id = rec.toolCallId;
  }
  if (id === null) {
    return null;
  }
  return { id, name: typeof rec.name === 'string' ? rec.name : '' };
}

/**
 * Restores the ReAct `{ results }` output slot from the last assistant
 * message with toolCalls. Expression fuel for `$output.*` edges only;
 * completed calls come from the Task 17 checkpoint. Results carry empty
 * payloads: tool:call re-executes only unfinished calls after resume.
 */
export function restoreReActOutput(snapshot: Snapshot | null): ReActOutput | null {
  if (snapshot === null) {
    return null;
  }
  const messages = snapshot.state.messages;
  if (!Array.isArray(messages)) {
    return null;
  }
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i];
    if (item === null || typeof item !== 'object') {
      continue;
    }
    const rec = item as { role?: unknown; toolCalls?: unknown };
    if (rec.role !== 'assistant' || !Array.isArray(rec.toolCalls) || rec.toolCalls.length === 0) {
      continue;
    }
    const results: ToolCallResult[] = [];
    for (const tc of rec.toolCalls) {
      const call = asSnapshotToolCall(tc);
      if (call === null) {
        continue;
      }
      results.push({ id: call.id, name: call.name, result: '', isError: false });
    }
    if (results.length === 0) {
      continue;
    }
    return { results };
  }
  return null;
}
