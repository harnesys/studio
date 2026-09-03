import type { Edge } from '../domain/agent-definition.ts';
import { evalWhen, type Slots } from './expr-eval.ts';

export function matchOutgoing(edges: Edge[], slots: Slots): string | undefined {
  for (const ed of edges) {
    if (ed.when === undefined) {
      return ed.to;
    }
    try {
      if (evalWhen(ed.when, slots)) {
        return ed.to;
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'unknown_path') {
        throw err;
      }
    }
  }
  return undefined;
}

export function isSkippedEntry(nodeType: string, rejected: boolean | undefined): boolean {
  if (nodeType === 'control:interrupt') {
    return true;
  }
  return nodeType === 'tool:call' && rejected === true;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`).join(',')}}`;
}
