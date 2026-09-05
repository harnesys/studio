import type { SessionEvent } from '@studio/shared';

import {
  askToolCallId,
  attachAsksToPairs,
  groupToolPairs,
  type ToolEventPair,
} from './session-event-groups';
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
  | { type: 'reasoning'; events: (SessionEvent & { type: 'reasoning-delta' })[] }
  | { type: 'text'; event: SessionEvent & { type: 'text-delta' } }
  | { type: 'ask'; event: SessionEvent & { type: 'ask' } }
  | { type: 'tools'; pairs: ToolEventPair[] }
  | { type: 'source'; event: SessionEvent & { type: 'source' } }
  | { type: 'file'; event: SessionEvent & { type: 'file' } };

export function chunkEvents(events: SessionEvent[]): ActivityChunk[] {
  const chunks: ActivityChunk[] = [];
  let toolEvents: SessionEvent[] = [];
  let reasoning: (SessionEvent & { type: 'reasoning-delta' })[] = [];
  const toolCallIds = new Set<string>();
  for (const ev of events) {
    if (ev.type === 'tool') {
      toolCallIds.add(ev.toolCallId);
    }
  }

  const flushTools = () => {
    if (toolEvents.length === 0) {
      return;
    }
    const pairs = attachAsksToPairs(groupToolPairs(toolEvents), events);
    if (pairs.length > 0) {
      chunks.push({ type: 'tools', pairs });
    }
    toolEvents = [];
  };

  const flushReasoning = () => {
    if (reasoning.length === 0) {
      return;
    }
    chunks.push({ type: 'reasoning', events: reasoning });
    reasoning = [];
  };

  for (const ev of events) {
    if (ev.type === 'text-delta') {
      flushTools();
      flushReasoning();
      chunks.push({ type: 'text', event: ev });
      continue;
    }
    if (ev.type === 'reasoning-delta') {
      flushTools();
      reasoning.push(ev as SessionEvent & { type: 'reasoning-delta' });
      continue;
    }
    if (ev.type === 'reasoning-start' || ev.type === 'reasoning-end') {
      continue;
    }
    if (ev.type === 'ask') {
      const callId = askToolCallId(ev);
      if (callId && toolCallIds.has(callId)) {
        flushReasoning();
        continue;
      }
      flushTools();
      flushReasoning();
      chunks.push({ type: 'ask', event: ev });
      continue;
    }
    if (ev.type === 'source') {
      flushTools();
      flushReasoning();
      chunks.push({ type: 'source', event: ev as SessionEvent & { type: 'source' } });
      continue;
    }
    if (ev.type === 'file') {
      flushTools();
      flushReasoning();
      chunks.push({ type: 'file', event: ev as SessionEvent & { type: 'file' } });
      continue;
    }
    if (ev.type === 'tool') {
      flushReasoning();
      toolEvents.push(ev);
    }
  }
  flushTools();
  flushReasoning();
  return chunks;
}

/** Группа активности: подряд идущие reasoning/tools-чанки, сворачивается целиком. */
export type GroupActivityChunk = Extract<ActivityChunk, { type: 'reasoning' | 'tools' }>;

export type ActivityGroup = {
  type: 'group';
  chunks: GroupActivityChunk[];
};

export type ActivityItem = { type: 'chunk'; chunk: StandaloneActivityChunk } | ActivityGroup;

/** Чанки вне групп: группируются только reasoning и tools. */
export type StandaloneActivityChunk = Extract<
  ActivityChunk,
  { type: 'text' | 'ask' | 'source' | 'file' }
>;

export function groupActivityChunks(chunks: ActivityChunk[]): ActivityItem[] {
  const items: ActivityItem[] = [];
  let group: GroupActivityChunk[] = [];

  const flushGroup = () => {
    if (group.length > 0) {
      items.push({ type: 'group', chunks: group });
      group = [];
    }
  };

  for (const chunk of chunks) {
    if (chunk.type === 'reasoning' || chunk.type === 'tools') {
      group.push(chunk);
      continue;
    }
    flushGroup();
    items.push({ type: 'chunk', chunk });
  }
  flushGroup();
  return items;
}

export function groupPairs(chunks: GroupActivityChunk[]): ToolEventPair[] {
  const pairs: ToolEventPair[] = [];
  for (const chunk of chunks) {
    if (chunk.type === 'tools') {
      pairs.push(...chunk.pairs);
    }
  }
  return pairs;
}
