import type { ThreadKind } from '@studio/shared';
import {
  CalendarClockIcon,
  EarthIcon,
  GitBranchIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PinIcon,
} from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { useSessionStore } from '@/entities/session';
import { type Thread, useThreadStore } from '@/entities/thread';
import { useThreadWaiting } from '@/features/desk';
import { formatDayTime } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useSidebar } from '@/shared/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';

export function AgentThreadRow({
  thread,
  selected,
  onSelect,
  onOpenParent,
  onOpenChild,
  onPinToggle,
  onDelete,
}: {
  thread: Thread;
  selected: boolean;
  onSelect: () => void;
  onOpenParent?: (parentId: string) => void;
  onOpenChild?: (childId: string) => void;
  onPinToggle?: () => void;
  onDelete?: () => void;
}) {
  const { state, isMobile } = useSidebar();
  const iconMode = state === 'collapsed' && !isMobile;
  const running = useSessionStore((s) => Boolean(s.activeRuns[thread.id]));
  const waiting = useThreadWaiting(thread.id);
  const parentId = thread.parentThreadId ?? null;
  const parent = useThreadStore((s) => (parentId ? s.byId(parentId) : undefined));
  const items = useThreadStore((s) => s.items);
  const children = useMemo(
    () => items.filter((item) => item.parentThreadId === thread.id),
    [items, thread.id],
  );
  const childCount = children.length;
  let runState: 'running' | 'waiting' | null = null;
  if (running) {
    runState = 'running';
  } else if (waiting) {
    runState = 'waiting';
  }
  const parts: string[] = [];
  if (runState) {
    parts.push(runState);
  }
  if (thread.unread) {
    parts.push('unread');
  }
  const statusTone = runState === 'waiting' ? 'text-live/70' : 'text-live';
  const isBranch = Boolean(thread.parentThreadId);
  const hasMenu = Boolean(
    onPinToggle || onDelete || (isBranch && onOpenParent) || (childCount > 0 && onOpenChild),
  );

  return (
    <div
      className={cn(
        'group/thread relative flex items-start rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent text-sidebar-accent-foreground',
        'group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center',
      )}
      data-testid={`agent-thread-${thread.id}`}
      data-selected={selected ? 'true' : 'false'}
      data-branch={isBranch ? 'true' : 'false'}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-left group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
              onClick={onSelect}
            />
          }
        >
          <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground group-data-[collapsible=icon]:mt-0">
            {isBranch ? <GitBranchIcon className="size-3.5" /> : threadIcon(thread.kind)}
          </span>
          <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="flex min-w-0 items-center gap-1">
              {thread.pinned ? (
                <PinIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              ) : null}
              <span className="block truncate text-sm leading-4">{thread.title}</span>
              {isBranch ? (
                <span
                  className="shrink-0 rounded bg-muted px-1 py-px font-mono text-[9px] text-muted-foreground uppercase tracking-wide"
                  data-testid={`thread-branch-badge-${thread.id}`}
                >
                  branch
                </span>
              ) : null}
              {childCount > 0 ? (
                <span
                  className="shrink-0 rounded bg-muted px-1 py-px font-mono text-[9px] text-muted-foreground"
                  data-testid={`thread-children-badge-${thread.id}`}
                >
                  {childCount}×
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground leading-4">
                {formatDayTime(thread.updatedAt)}
                {parent ? ` · ← ${parent.title}` : ''}
              </span>
              {parts.length > 0 ? (
                <span className={cn('shrink-0 font-mono text-[8px]', statusTone)}>
                  {parts.join(' · ')}
                </span>
              ) : null}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" hidden={!iconMode}>
          {thread.title}
        </TooltipContent>
      </Tooltip>
      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute top-1 right-0.5 opacity-0 group-hover/thread:opacity-100 group-data-[collapsible=icon]:hidden"
              />
            }
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontalIcon />
            <span className="sr-only">Thread actions</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenuGroup>
              {isBranch && parentId && onOpenParent ? (
                <DropdownMenuItem onClick={() => onOpenParent(parentId)}>
                  Open parent
                </DropdownMenuItem>
              ) : null}
              {onOpenChild
                ? children.map((child) => (
                    <DropdownMenuItem key={child.id} onClick={() => onOpenChild(child.id)}>
                      Open branch: {child.title}
                    </DropdownMenuItem>
                  ))
                : null}
              {onPinToggle ? (
                <DropdownMenuItem onClick={onPinToggle}>
                  {thread.pinned ? 'Unpin' : 'Pin'}
                </DropdownMenuItem>
              ) : null}
              {onDelete ? (
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function threadIcon(kind: ThreadKind): ReactNode {
  if (kind === 'schedule') {
    return <CalendarClockIcon className="size-3.5" />;
  }
  if (kind === 'webhook') {
    return <EarthIcon className="size-3.5" />;
  }
  return <MessageSquareIcon className="size-3.5" />;
}
