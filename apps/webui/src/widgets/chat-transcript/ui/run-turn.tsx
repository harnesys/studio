import type { FeedRun } from '@/entities/session';
import { AssistantMessageView, FailedMessageView } from './agent-turn';
import type { BranchChild } from './branch-point-badge';

export function RunTurn({
  run,
  runId,
  streaming = false,
  threadId,
  onOpenSpawn,
  onRetry,
  readOnly = false,
  inherited = false,
  branchChildren,
}: {
  run: FeedRun;
  runId: string;
  streaming?: boolean;
  threadId?: string;
  onOpenSpawn?: (spawnId: string) => void;
  onRetry?: () => void;
  readOnly?: boolean;
  inherited?: boolean;
  branchChildren?: BranchChild[];
}) {
  return (
    <div className="group/turn flex flex-col gap-3">
      <AssistantMessageView
        run={run}
        runId={runId}
        streaming={streaming}
        threadId={threadId}
        onOpenSpawn={onOpenSpawn}
        readOnly={readOnly}
        inherited={inherited}
        branchChildren={branchChildren}
      />
      {run.error ? <FailedMessageView text={run.error} onRetry={onRetry} /> : null}
    </div>
  );
}
