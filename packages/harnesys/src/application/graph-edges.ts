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
    } catch {
      // unknown_path / syntax: this edge does not match
    }
  }
  return undefined;
}

export function isSkippedEntry(
  nodeType: string,
  rejected: boolean | undefined,
  interruptSource?: string,
): boolean {
  if (nodeType === 'control:interrupt' || interruptSource === 'budget') {
    return true;
  }
  return nodeType === 'tool:call' && rejected === true;
}
