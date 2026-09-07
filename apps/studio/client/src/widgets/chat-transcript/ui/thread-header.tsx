import { GitBranchIcon } from 'lucide-react';
import { useMemo } from 'react';

import { useAgentStore } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { cn } from '@/shared/lib/utils';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';

/** Origin + current speakers; current is ring-highlighted. Updates when thread.agentId changes. */
export function ThreadHeader({ threadId }: { threadId: string }) {
  const thread = useThreadStore((state) => state.byId(threadId));
  const parent = useThreadStore((state) =>
    thread?.parentThreadId ? state.byId(thread.parentThreadId) : undefined,
  );
  const items = useThreadStore((state) => state.items);
  const children = useMemo(
    () => items.filter((item) => item.parentThreadId === threadId),
    [items, threadId],
  );
  const origin = useAgentStore((state) =>
    thread ? state.items.find((item) => item.id === thread.originAgentId) : undefined,
  );
  const current = useAgentStore((state) =>
    thread ? state.items.find((item) => item.id === thread.agentId) : undefined,
  );
  const { workspaceId } = useStudioLocation();
  const { openThread } = useStudioNavigation();

  if (!thread) {
    return null;
  }

  const same = thread.originAgentId === thread.agentId;
  const currentName = current?.name ?? 'Agent';

  const goTo = (targetId: string, agentId: string) => {
    if (!workspaceId) {
      return;
    }
    useIdeStore.getState().openThread(workspaceId, agentId, targetId);
    useDeskStore.getState().setFocusedThreadId(targetId);
    openThread(targetId, { kind: 'agent', id: agentId }, workspaceId);
  };

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-2 border-border/60 border-b px-3"
      data-testid="thread-header"
    >
      <div className="flex shrink-0 -space-x-1.5">
        {!same && origin ? (
          <Avatar
            size="sm"
            className="size-5 ring-2 ring-background after:hidden"
            title={`${origin.name} (opened)`}
            data-testid="thread-avatar-origin"
          >
            <AvatarFallback className="bg-muted text-[9px] text-muted-foreground">
              {origin.initials.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
        ) : null}
        <Avatar
          size="sm"
          className={cn(
            'size-5 ring-2 after:hidden',
            'ring-[color-mix(in_oklab,var(--live)_55%,var(--background))]',
          )}
          title={`${currentName} (current)`}
          data-testid="thread-avatar-current"
        >
          <AvatarFallback className="bg-[color-mix(in_oklab,var(--live)_12%,transparent)] text-[9px] text-foreground">
            {(current?.initials ?? '?').slice(0, 2)}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="min-w-0 truncate text-[12px] text-foreground leading-none">{currentName}</div>
      {!same && origin ? (
        <div className="min-w-0 truncate text-[11px] text-muted-foreground leading-none">
          opened by {origin.name}
        </div>
      ) : null}
      {parent ? (
        <button
          type="button"
          className="inline-flex max-w-[40%] items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          data-testid="thread-parent-link"
          title={`Parent: ${parent.title}`}
          onClick={() => goTo(parent.id, parent.agentId)}
        >
          <GitBranchIcon className="size-3 shrink-0" />
          <span className="truncate">{parent.title}</span>
        </button>
      ) : null}
      {children.length > 0 ? (
        <div
          className="ml-auto flex min-w-0 max-w-[45%] items-center gap-1 overflow-hidden"
          data-testid="thread-child-links"
        >
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              className="inline-flex max-w-[9rem] items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              data-testid={`thread-child-link-${child.id}`}
              title={child.title}
              onClick={() => goTo(child.id, child.agentId)}
            >
              <GitBranchIcon className="size-3 shrink-0" />
              <span className="truncate">{child.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
