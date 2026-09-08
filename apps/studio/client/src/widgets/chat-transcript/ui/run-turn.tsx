import type { SessionEvent } from '@studio/shared';
import { memo } from 'react';

import type { SpawnInfo } from '../model/spawn-groups';
import { AssistantMessageView, FailedMessageView } from './agent-turn';

function sameEventList(a: SessionEvent[], b: SessionEvent[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  if (a.length === 0) {
    return true;
  }
  // Completed runs keep the same event object refs at both ends while the
  // parent only appends; identity check skips Markdown/tool re-renders.
  return a[0] === b[0] && a[a.length - 1] === b[b.length - 1];
}

/** extractSpawns пересобирает массив на каждое событие — сравниваем по полям. */
function sameSpawns(a: SpawnInfo[] | undefined, b: SpawnInfo[] | undefined): boolean {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined || a.length !== b.length) {
    return false;
  }
  return a.every((item, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      item.spawnId === other.spawnId &&
      item.agentId === other.agentId &&
      item.status === other.status &&
      item.lastActivity === other.lastActivity
    );
  });
}

export const RunTurn = memo(
  function RunTurn({
    events,
    runId,
    streaming,
    error,
    onRetry,
    threadId,
    spawns,
    onOpenSpawn,
    readOnly,
  }: {
    events: SessionEvent[];
    runId: string;
    streaming: boolean;
    error: string | null;
    onRetry?: () => void;
    threadId?: string;
    spawns?: SpawnInfo[];
    onOpenSpawn?: (spawnId: string) => void;
    readOnly?: boolean;
  }) {
    return (
      <div className="group/turn flex flex-col gap-3">
        <AssistantMessageView
          events={events}
          runId={runId}
          streaming={streaming}
          threadId={threadId}
          spawns={spawns}
          onOpenSpawn={onOpenSpawn}
          readOnly={readOnly}
        />
        {error ? <FailedMessageView text={error} onRetry={onRetry} /> : null}
      </div>
    );
  },
  (prev, next) => {
    if (prev.streaming || next.streaming) {
      return (
        prev.streaming === next.streaming &&
        prev.runId === next.runId &&
        prev.error === next.error &&
        prev.onRetry === next.onRetry &&
        prev.threadId === next.threadId &&
        prev.onOpenSpawn === next.onOpenSpawn &&
        prev.readOnly === next.readOnly &&
        sameSpawns(prev.spawns, next.spawns) &&
        sameEventList(prev.events, next.events)
      );
    }
    return (
      prev.runId === next.runId &&
      prev.error === next.error &&
      prev.onRetry === next.onRetry &&
      prev.threadId === next.threadId &&
      prev.onOpenSpawn === next.onOpenSpawn &&
      prev.readOnly === next.readOnly &&
      sameSpawns(prev.spawns, next.spawns) &&
      sameEventList(prev.events, next.events)
    );
  },
);
