import { GitBranchIcon } from 'lucide-react';

import { useOpenThreadTab } from '@/features/ide';
import { useStudioLocation } from '@/shared/config/location';

export function ForkSeparator({
  parentThreadId,
  parentAgentId,
}: {
  parentThreadId: string;
  parentAgentId: string;
}) {
  const { workspaceId } = useStudioLocation();
  const openThreadTab = useOpenThreadTab();

  return (
    <div
      data-testid="fork-separator"
      className="flex items-center gap-2 text-[11px] text-muted-foreground leading-none"
    >
      <span className="h-px flex-1 bg-border" />
      <GitBranchIcon className="size-3.5 shrink-0" />
      <span>Ветвление отсюда</span>
      <button
        type="button"
        data-testid="fork-open-parent"
        className="rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => {
          if (!workspaceId) {
            return;
          }
          openThreadTab(workspaceId, parentAgentId, parentThreadId);
        }}
      >
        Открыть родителя
      </button>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
