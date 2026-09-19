import { estimateMessageTokens } from './estimate.ts';
export type CutPlan = {
  coveredFrom: number;
  coveredUntil: number;
};
export function isClosedBoundary(messages: readonly unknown[], index: number): boolean {
  const m = messages[index] as Record<string, unknown> | null | undefined;
  if (!m || typeof m !== 'object') {
    return false;
  }
  if (m.role !== 'assistant') {
    return true;
  }
  const calls = Array.isArray(m.toolCalls) ? m.toolCalls : [];
  if (calls.length === 0) {
    return true;
  }
  const ids = new Set(
    calls
      .map((c) =>
        String(
          (
            c as {
              id?: unknown;
            }
          ).id ?? '',
        ),
      )
      .filter((id) => id !== ''),
  );
  if (ids.size === 0) {
    return true;
  }
  for (let j = index + 1; j < messages.length; j++) {
    const n = messages[j] as Record<string, unknown> | null | undefined;
    if (!n || typeof n !== 'object') {
      continue;
    }
    if (n.role === 'assistant') {
      break;
    }
    if (n.role === 'tool') {
      ids.delete(String(n.toolCallId ?? ''));
    }
  }
  return ids.size === 0;
}
export function planCut(
  messages: readonly unknown[],
  opts: {
    protectTokens: number;
    afterIndex: number;
  },
): CutPlan | null {
  let limit = messages.length - 1;
  if (opts.protectTokens > 0) {
    let acc = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      acc += estimateMessageTokens(messages[i]);
      if (acc >= opts.protectTokens) {
        limit = i - 1;
        break;
      }
    }
  }
  for (let i = Math.min(limit, messages.length - 1); i > opts.afterIndex; i--) {
    if (isClosedBoundary(messages, i)) {
      return { coveredFrom: opts.afterIndex + 1, coveredUntil: i };
    }
  }
  return null;
}
