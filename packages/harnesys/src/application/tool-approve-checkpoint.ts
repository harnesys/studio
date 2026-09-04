import type { ToolCallResult } from './tool-call.ts';

export const NODE_CHECKPOINT_KEY = '$nodeCheckpoint_';

export type NodeCheckpoint = {
  completed: Record<number, ToolCallResult>;
};

export type ValidCheckpointEntry = {
  idx: number;
  result: ToolCallResult;
};

function key(nodeId: string): string {
  return NODE_CHECKPOINT_KEY + nodeId;
}

export function loadCheckpoint(
  state: Record<string, unknown>,
  nodeId: string,
): NodeCheckpoint | undefined {
  const saved = state[key(nodeId)] as NodeCheckpoint | undefined;
  if (
    !saved ||
    typeof saved !== 'object' ||
    !saved.completed ||
    typeof saved.completed !== 'object'
  ) {
    return undefined;
  }
  return saved;
}

export function validCheckpointEntries(
  saved: NodeCheckpoint,
  calls: { id: string }[],
): ValidCheckpointEntry[] {
  const entries: ValidCheckpointEntry[] = [];
  for (const [k, v] of Object.entries(saved.completed)) {
    const idx = Number(k);
    if (!Number.isInteger(idx) || idx < 0 || idx >= calls.length) {
      continue;
    }
    const call = calls[idx];
    if (!call || !v || typeof v !== 'object') {
      continue;
    }
    const result = v as ToolCallResult;
    if (result.id !== call.id) {
      continue;
    }
    entries.push({ idx, result });
  }
  return entries;
}

export function snapshotCheckpoint(results: (ToolCallResult | undefined)[]): NodeCheckpoint {
  const completed: Record<number, ToolCallResult> = {};
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r) {
      completed[i] = r;
    }
  }
  return { completed };
}

export function saveCheckpoint(
  state: Record<string, unknown>,
  nodeId: string,
  checkpoint: NodeCheckpoint,
): void {
  state[key(nodeId)] = checkpoint;
}

export function clearCheckpoint(state: Record<string, unknown>, nodeId: string): void {
  delete state[key(nodeId)];
}
