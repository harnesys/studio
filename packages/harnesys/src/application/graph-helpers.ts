import { bindingOf } from '../adapters/models/binding.ts';
import type { AgentDefinition, AgentModelRef } from '../domain/agent-definition.ts';
import type { ModelsPort, ProviderConfig } from '../ports/models.ts';

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

/** Full model ref for call settings (effort / generation), including named aliases. */
export function resolveAgentModelRef(
  ref: string | AgentModelRef | undefined,
  agent: AgentDefinition,
): AgentModelRef | undefined {
  if (typeof ref === 'string') {
    return agent.models?.[ref] ?? agent.model;
  }
  if (ref && typeof ref === 'object' && ref.provider && ref.model) {
    return {
      provider: ref.provider,
      model: ref.model,
      effort: ref.effort ?? agent.model?.effort,
      generation: ref.generation ?? agent.model?.generation,
    };
  }
  return agent.model;
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

export function stateKeyOf(expr: string): string | undefined {
  const key = expr
    .trim()
    .replace(/^\$state\./, '')
    .split(/[.[]/)[0];
  return key || undefined;
}
