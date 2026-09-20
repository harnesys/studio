import type { GroupFeedChunk, SpawnInfo, ToolEventPair } from '@/entities/session';
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

export type ActivitySummary = {
  label: string;
  parts: string[];
  failed: number;
};
export function summarizeActivity(chunks: GroupFeedChunk[], spawns: SpawnInfo[]): ActivitySummary {
  const pairs: ToolEventPair[] = [];
  const spawnChunks: { spawnId: string }[] = [];
  for (const chunk of chunks) {
    if (chunk.type === 'tools') {
      pairs.push(...chunk.pairs);
    } else if (chunk.type === 'spawn') {
      spawnChunks.push(chunk.event);
    }
  }
  const spawnStatus = new Map(spawns.map((spawn) => [spawn.spawnId, spawn.status]));
  const agentsFailed = spawnChunks.filter(
    (chunk) => spawnStatus.get(chunk.spawnId) === 'failed',
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
