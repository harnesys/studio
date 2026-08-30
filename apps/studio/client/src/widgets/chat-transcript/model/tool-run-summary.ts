import type { SessionEvent } from '@studio/shared';

import { groupToolPairs, type ToolEventPair } from './session-event-groups';
import { toolCaption } from './tool-caption';

export type ToolRunSummary = {
  total: number;
  failed: number;
  parts: string[];
};

export function summarizeToolRun(pairs: ToolEventPair[]): ToolRunSummary {
  const counts = new Map<string, number>();
  let failed = 0;

  for (const pair of pairs) {
    const title = toolCaption(pair.call, pair.result).title;
    counts.set(title, (counts.get(title) ?? 0) + 1);
    if (pair.result?.phase === 'failed') {
      failed += 1;
    }
  }

  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([title, count]) => (count > 1 ? `${title}×${count}` : title));

  return { total: pairs.length, failed, parts };
}

export type ActivityChunk =
  | { type: 'text'; event: SessionEvent & { type: 'text-delta' } }
  | { type: 'ask'; event: SessionEvent & { type: 'ask' } }
  | { type: 'tools'; pairs: ToolEventPair[] };

export function chunkEvents(events: SessionEvent[]): ActivityChunk[] {
  const chunks: ActivityChunk[] = [];
  let toolEvents: SessionEvent[] = [];

  const flushTools = () => {
    if (toolEvents.length === 0) {
      return;
    }
    const pairs = groupToolPairs(toolEvents);
    if (pairs.length > 0) {
      chunks.push({ type: 'tools', pairs });
    }
    toolEvents = [];
  };

  for (const ev of events) {
    if (ev.type === 'text-delta') {
      flushTools();
      chunks.push({ type: 'text', event: ev });
      continue;
    }
    if (ev.type === 'ask') {
      flushTools();
      chunks.push({ type: 'ask', event: ev });
      continue;
    }
    if (ev.type === 'tool') {
      toolEvents.push(ev);
    }
  }
  flushTools();
  return chunks;
}
