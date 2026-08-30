import type { TranscriptActivity } from '@studio/shared';

import { toolCaption } from './tool-caption';

export type ToolRunSummary = {
  total: number;
  failed: number;
  parts: string[];
};

export function summarizeToolRun(
  items: Array<Extract<TranscriptActivity, { type: 'tool' }>>,
): ToolRunSummary {
  const counts = new Map<string, number>();
  let failed = 0;

  for (const item of items) {
    const title = toolCaption(item).title;
    counts.set(title, (counts.get(title) ?? 0) + 1);
    if (item.call.status === 'failed' || item.result?.status === 'failed') {
      failed += 1;
    }
  }

  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([title, count]) => (count > 1 ? `${title}×${count}` : title));

  return { total: items.length, failed, parts };
}

export type ActivityChunk =
  | { type: 'reasoning'; item: Extract<TranscriptActivity, { type: 'reasoning' }> }
  | { type: 'ask'; item: Extract<TranscriptActivity, { type: 'ask' }> }
  | { type: 'tools'; items: Array<Extract<TranscriptActivity, { type: 'tool' }>> };

export function chunkActivity(items: TranscriptActivity[]): ActivityChunk[] {
  const chunks: ActivityChunk[] = [];
  let tools: Array<Extract<TranscriptActivity, { type: 'tool' }>> = [];

  const flushTools = () => {
    if (tools.length === 0) {
      return;
    }
    chunks.push({ type: 'tools', items: tools });
    tools = [];
  };

  for (const item of items) {
    if (item.type === 'reasoning') {
      flushTools();
      chunks.push({ type: 'reasoning', item });
      continue;
    }
    if (item.type === 'ask') {
      flushTools();
      chunks.push({ type: 'ask', item });
      continue;
    }
    tools.push(item);
  }
  flushTools();
  return chunks;
}
