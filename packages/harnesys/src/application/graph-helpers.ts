import { bindingOf } from '../adapters/models/binding.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { ModelsPort, ProviderConfig } from '../ports/models.ts';

export type MergeStateFn = (key: string, a: unknown, b: unknown) => unknown;

export function isPort(v: ProviderConfig[] | ModelsPort): v is ModelsPort {
  return typeof (v as ModelsPort).get === 'function';
}

export function findBind(
  models: ProviderConfig[] | ModelsPort,
  ref: string | { provider: string; model: string } | undefined,
  agent: AgentDefinition,
) {
  let pn: string | undefined;
  let mn: string | undefined;
  if (typeof ref === 'string') {
    mn = ref;
  } else if (ref && typeof ref === 'object' && 'provider' in ref) {
    pn = (ref as { provider: string }).provider;
    mn = (ref as { model: string }).model;
  } else if (agent.model) {
    pn = agent.model.provider;
    mn = agent.model.model;
  }
  if (!mn) {
    return null;
  }
  if (isPort(models)) {
    return null;
  }
  const arr = models as ProviderConfig[];
  if (pn) {
    const p = arr.find((x) => x.name === pn);
    if (!p) {
      return null;
    }
    try {
      return { binding: bindingOf(p, mn) };
    } catch {
      return null;
    }
  }
  for (const p of arr) {
    try {
      return { binding: bindingOf(p, mn) };
    } catch {}
  }
  return null;
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
