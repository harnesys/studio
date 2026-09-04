import type { ToolCallResult } from './tool-call.ts';

export const NODE_CHECKPOINT_KEY = '$nodeCheckpoint_';

export type NodeCheckpoint = {
  completed: Record<number, ToolCallResult>;
  /**
   * Разрешения permission gate по call.id. Переживают resume: параллельный
   * сосед, бросив AskUserInterrupt, не отменяет уже выданное разрешение,
   * и следующий resume не переспрашивает этот вызов.
   */
  granted?: Record<string, true>;
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

/** Дописывает результат одного вызова в чекпоинт, сохраняя granted и прочие результаты. */
export function recordCompleted(
  state: Record<string, unknown>,
  nodeId: string,
  idx: number,
  result: ToolCallResult,
): void {
  const saved = loadCheckpoint(state, nodeId) ?? { completed: {} };
  saved.completed[idx] = result;
  state[key(nodeId)] = saved;
}

/** Фиксирует разрешение gate по call.id до исполнения вызова. */
export function recordGranted(
  state: Record<string, unknown>,
  nodeId: string,
  callId: string,
): void {
  const saved = loadCheckpoint(state, nodeId) ?? { completed: {} };
  saved.granted = { ...saved.granted, [callId]: true };
  state[key(nodeId)] = saved;
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
