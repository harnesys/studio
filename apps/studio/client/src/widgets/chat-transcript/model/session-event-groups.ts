import type { SessionEvent } from '@studio/shared';

export type ToolCallEvent = SessionEvent & { type: 'tool' };

export type AskEvent = SessionEvent & { type: 'ask' };

export type ToolEventPair = {
  call: ToolCallEvent & { phase: 'requested' | 'streaming' };
  result?: ToolCallEvent & { phase: 'completed' | 'failed' };
  ask?: AskEvent;
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
        ask: existing?.ask,
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

export function askToolCallId(event: SessionEvent): string | null {
  if (event.type !== 'ask') {
    return null;
  }
  const tool = (event as AskEvent).tool;
  if (tool && typeof tool.toolCallId === 'string' && tool.toolCallId) {
    return tool.toolCallId;
  }
  const askId = (event as AskEvent).askId;
  if (typeof askId === 'string' && askId.startsWith('ask/') && askId.length > 4) {
    return askId.slice(4);
  }
  return null;
}

export function attachAsksToPairs(pairs: ToolEventPair[], events: SessionEvent[]): ToolEventPair[] {
  const askByCall = new Map<string, AskEvent>();
  for (const ev of events) {
    if (ev.type !== 'ask') {
      continue;
    }
    const callId = askToolCallId(ev);
    if (callId && !askByCall.has(callId)) {
      askByCall.set(callId, ev as AskEvent);
    }
  }
  if (askByCall.size === 0) {
    return pairs;
  }
  return pairs.map((pair) => {
    const ask = askByCall.get(pair.call.toolCallId);
    return ask && !pair.ask ? { ...pair, ask } : pair;
  });
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
