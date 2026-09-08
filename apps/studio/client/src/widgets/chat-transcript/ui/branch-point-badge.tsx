import { GitBranchIcon } from 'lucide-react';

import { useOpenThreadTab } from '@/features/ide';
import { useStudioLocation } from '@/shared/config/location';

export type BranchChild = {
  id: string;
  agentId: string;
  title: string;
};

/** «⎇ N» on the run a thread forked from. Click opens the first child branch. */
export function BranchPointBadge({ runId, branches }: { runId: string; branches: BranchChild[] }) {
  const { workspaceId } = useStudioLocation();
  const openThreadTab = useOpenThreadTab();
  const first = branches[0];
  if (!first) {
    return null;
  }
  const titles = branches.map((branch) => branch.title).join('\n');
  return (
    <button
      type="button"
      data-testid={`branch-point-${runId}`}
      title={titles}
      aria-label={`Open branch: ${first.title}`}
      className="pointer-events-auto inline-flex items-center gap-1 rounded-md text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => {
        if (!workspaceId) {
          return;
        }
        openThreadTab(workspaceId, first.agentId, first.id);
      }}
    >
      <GitBranchIcon className="size-3 shrink-0" />
      <span>{branches.length}</span>
    </button>
  );
}
