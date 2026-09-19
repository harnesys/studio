import type { SessionEvent } from '@harnesys/studio-shared';

import {
  askToolCallId,
  attachAsksToPairs,
  groupToolPairs,
  type ToolEventPair,
} from './session-event-groups';
import type { SpawnInfo } from './spawn-groups';
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
  | { type: 'file'; event: SessionEvent & { type: 'file' } }
  | { type: 'spawn'; event: SessionEvent & { type: 'agent.spawned' } };

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
    if (ev.type === 'agent.spawned') {
      flushTools();
      flushReasoning();
      chunks.push({ type: 'spawn', event: ev as SessionEvent & { type: 'agent.spawned' } });
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

/** Группа активности: подряд идущие reasoning/tools/spawn-чанки, сворачивается целиком. */
export type GroupActivityChunk = Extract<ActivityChunk, { type: 'reasoning' | 'tools' | 'spawn' }>;

export type ActivityGroup = {
  type: 'group';
  chunks: GroupActivityChunk[];
};

export type ActivityItem = { type: 'chunk'; chunk: StandaloneActivityChunk } | ActivityGroup;

/** Чанки вне групп: группируются только reasoning, tools и spawn. */
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
    if (chunk.type === 'reasoning' || chunk.type === 'tools' || chunk.type === 'spawn') {
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

export type ActivitySummary = { label: string; parts: string[]; failed: number };

export function summarizeActivity(
  chunks: GroupActivityChunk[],
  spawnsById: Map<string, SpawnInfo>,
): ActivitySummary {
  const pairs = groupPairs(chunks);
  const spawnChunks = chunks.filter((chunk) => chunk.type === 'spawn');
  const agentsFailed = spawnChunks.filter(
    (chunk) => spawnsById.get(chunk.event.spawnId)?.status === 'failed',
  ).length;
  const summary = summarizeToolRun(pairs);
  const labels: string[] = [];
  if (summary.total > 0) {
    labels.push(`${summary.total} ${summary.total === 1 ? 'tool' : 'tools'}`);
  }
  if (spawnChunks.length > 0) {
    labels.push(`${spawnChunks.length} ${spawnChunks.length === 1 ? 'agent' : 'agents'}`);
  }
  if (labels.length === 0) {
    labels.push('activity');
  }
  return {
    label: labels.join(' · '),
    parts: summary.parts,
    failed: summary.failed + agentsFailed,
  };
}
