import type { SessionEvent } from '@studio/shared';

export type ToolEventPair = {
  call: SessionEvent & { type: 'tool'; phase: 'requested' | 'streaming' };
  result?: SessionEvent & { type: 'tool'; phase: 'completed' | 'failed' };
};

export function groupToolPairs(events: SessionEvent[]): ToolEventPair[] {
  const pairs = new Map<string, ToolEventPair>();
  for (const ev of events) {
    if (ev.type !== 'tool') {
      continue;
    }
    const existing = pairs.get(ev.toolCallId);
    if (ev.phase === 'requested') {
      pairs.set(ev.toolCallId, {
        call: ev as SessionEvent & { type: 'tool'; phase: 'requested' },
        result: existing?.result,
      });
    } else if (ev.phase === 'streaming') {
      if (existing) {
        const mergedDelta = ((existing.call.delta ?? '') + (ev.delta ?? '')).trim();
        existing.call = {
          ...existing.call,
          name: ev.name || existing.call.name,
          delta: mergedDelta,
        } as SessionEvent & { type: 'tool'; phase: 'streaming' };
      } else {
        pairs.set(ev.toolCallId, {
          call: ev as SessionEvent & { type: 'tool'; phase: 'streaming' },
          result: undefined,
        });
      }
    } else if (ev.phase === 'completed' || ev.phase === 'failed') {
      if (existing) {
        existing.result = ev as SessionEvent & { type: 'tool'; phase: 'completed' | 'failed' };
      } else {
        // tool completed without prior streaming/requested (e.g. buffered) — create pair
        pairs.set(ev.toolCallId, {
          call: {
            type: 'tool',
            phase: 'requested',
            toolCallId: ev.toolCallId,
            name: ev.name,
            input: ev.input,
          } as SessionEvent & { type: 'tool'; phase: 'requested' },
          result: ev as SessionEvent & { type: 'tool'; phase: 'completed' | 'failed' },
        });
      }
    }
  }
  return [...pairs.values()];
}

export function toolInput(pair: ToolEventPair): string {
  const input = pair.call.input;
  if (input != null) {
    return typeof input === 'string' ? input : JSON.stringify(input);
  }
  const delta = (pair.call as { delta?: string }).delta;
  if (typeof delta === 'string' && delta) {
    return delta;
  }
  return '';
}

export function toolOutput(pair: ToolEventPair): string {
  if (!pair.result) {
    return '';
  }
  const output = pair.result.output;
  if (output == null) {
    return '';
  }
  return typeof output === 'string' ? output : JSON.stringify(output);
}

export function isToolFailed(pair: ToolEventPair): boolean {
  return pair.result?.phase === 'failed';
}

export function isToolDone(pair: ToolEventPair): boolean {
  return pair.result != null;
}
