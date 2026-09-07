import { useAgentStore } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import { cn } from '@/shared/lib/utils';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';

/** Origin + current speakers; current is ring-highlighted. Updates when thread.agentId changes. */
export function ThreadHeader({ threadId }: { threadId: string }) {
  const thread = useThreadStore((state) => state.byId(threadId));
  const origin = useAgentStore((state) =>
    thread ? state.items.find((item) => item.id === thread.originAgentId) : undefined,
  );
  const current = useAgentStore((state) =>
    thread ? state.items.find((item) => item.id === thread.agentId) : undefined,
  );

  if (!thread) {
    return null;
  }

  const same = thread.originAgentId === thread.agentId;
  const currentName = current?.name ?? 'Agent';

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
    </div>
  );
}
