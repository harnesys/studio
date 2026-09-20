import { SquareIcon } from 'lucide-react';
import type { FeedRun } from '@/entities/session';
import { useSessionStore } from '@/entities/session';
import { cancelRun } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { useMessageScrollerScrollable } from '@/shared/ui/message-scroller';
import { formatElapsed, liveRunStatusOf, useRunStartedAt } from '../model/live-run-status';
import { useNow } from '../model/use-now';

export function LiveStatusBar({
  threadId,
  run,
  streaming,
}: {
  threadId: string;
  run: FeedRun;
  streaming: boolean;
}) {
  const { end } = useMessageScrollerScrollable();
  const startedAt = useRunStartedAt(streaming);
  const now = useNow(streaming ? 1000 : 0);
  if (!streaming || !end || startedAt === null) {
    return null;
  }
  const status = liveRunStatusOf(run);
  return (
    <div
      data-testid="live-status-bar"
      className="absolute inset-s-1/2 bottom-14 z-10 flex max-w-[min(90%,32rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-live/30 bg-background/90 py-1.5 pr-1.5 pl-3 shadow-lg backdrop-blur-sm"
    >
      <span className="live-dot size-1.5 shrink-0 rounded-full bg-live" />
      <span className="shrink-0 font-medium text-[12px] leading-none">
        {status.tool?.title ?? 'Working'}
      </span>
      {status.tool?.hint ? (
        <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground leading-none">
          {status.tool.hint}
        </span>
      ) : null}
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums leading-none">
        {status.toolCount > 0 ? `${status.toolCount} tools · ` : ''}
        {formatElapsed(now - startedAt)}
      </span>
      <Button
        type="button"
        size="icon-xs"
        variant="destructive"
        className="ml-1 shrink-0 rounded-full"
        onClick={() => {
          useSessionStore.getState().abortRun(threadId);
          if (run.runId) {
            void cancelRun(run.runId).catch(() => {});
          }
        }}
        title="Stop generation"
      >
        <SquareIcon className="size-3 fill-current" />
        <span className="sr-only">Stop</span>
      </Button>
    </div>
  );
}
