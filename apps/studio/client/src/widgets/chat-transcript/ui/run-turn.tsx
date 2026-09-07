import type { SessionEvent } from '@studio/shared';
import { memo } from 'react';

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

export const RunTurn = memo(
  function RunTurn({
    events,
    runId,
    streaming,
    error,
    onRetry,
  }: {
    events: SessionEvent[];
    runId: string;
    streaming: boolean;
    error: string | null;
    onRetry?: () => void;
  }) {
    return (
      <div className="group/turn flex flex-col gap-3">
        <AssistantMessageView events={events} runId={runId} streaming={streaming} />
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
        sameEventList(prev.events, next.events)
      );
    }
    return (
      prev.runId === next.runId &&
      prev.error === next.error &&
      prev.onRetry === next.onRetry &&
      sameEventList(prev.events, next.events)
    );
  },
);
