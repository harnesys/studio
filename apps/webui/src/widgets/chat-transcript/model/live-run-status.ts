import { useEffect, useState } from 'react';
import type { FeedRun } from '@/entities/session';
import { type ToolCaption, toolCaption } from './tool-caption';

export type LiveRunStatus = {
  tool: ToolCaption | null;
  toolCount: number;
};
export function liveRunStatusOf(run: FeedRun): LiveRunStatus {
  const settled = new Set<string>();
  const calls = new Set<string>();
  for (const ev of run.events) {
    if (ev.type !== 'tool') {
      continue;
    }
    calls.add(ev.toolCallId);
    if (ev.phase === 'completed' || ev.phase === 'failed' || ev.phase === 'skipped') {
      settled.add(ev.toolCallId);
    }
  }
  let tool: ToolCaption | null = null;
  for (let index = run.events.length - 1; index >= 0; index -= 1) {
    const ev = run.events[index];
    if (ev.type !== 'tool' || settled.has(ev.toolCallId)) {
      continue;
    }
    if (ev.phase === 'requested' || ev.phase === 'streaming') {
      tool = toolCaption(ev);
      break;
    }
  }
  return { tool, toolCount: calls.size };
}
export function useRunStartedAt(streaming: boolean): number | null {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  useEffect(() => {
    if (streaming) {
      setStartedAt((prev) => prev ?? Date.now());
      return;
    }
    setStartedAt(null);
  }, [streaming]);
  return startedAt;
}
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
