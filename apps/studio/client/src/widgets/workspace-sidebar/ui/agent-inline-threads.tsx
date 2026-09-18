import { GitBranchIcon, MessageCircle, MoreHorizontalIcon, PinIcon } from 'lucide-react';
import { Fragment, type ReactNode, useState } from 'react';
import type { Agent } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import type { Thread } from '@/entities/thread';
import { useAgentThreads, useThreadWaiting } from '@/features/desk';
import { formatClock } from '@/shared/lib/format-clock';
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
import { useThreadActions } from '../model/thread-actions';
import {
  buildThreadTree,
  countSubtree,
  subtreeHas,
  type ThreadTreeNode,
} from '../model/thread-tree';

const VISIBLE_ROOT_LIMIT = 6;

export function AgentInlineThreads({
  agent,
  workspaceId,
  activeThreadId,
  onDone,
}: {
  agent: Agent;
  workspaceId: string;
  activeThreadId: string | null;
  onDone: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const threads = useAgentThreads(agent.id).filter((thread) => thread.kind === 'chat');
  const actions = useThreadActions(workspaceId);
  const roots = buildThreadTree(threads);
  const total = roots.reduce((sum, node) => sum + countSubtree(node), 0);

  const activeRoot = activeThreadId
    ? (roots.find((node) => subtreeHas(node, activeThreadId)) ?? null)
    : null;
  const visible: ThreadTreeNode[] = [];
  let used = 0;
  for (const node of roots) {
    if (!showAll && used >= VISIBLE_ROOT_LIMIT && node !== activeRoot) {
      continue;
    }
    visible.push(node);
    used += countSubtree(node);
  }
  const hiddenCount = Math.max(0, total - used);

  const renderRow = (thread: Thread) => (
    <InlineThreadRow
      thread={thread}
      selected={activeThreadId === thread.id}
      onSelect={() => {
        actions.openThread(thread);
        onDone();
      }}
      onPinToggle={thread.kind === 'chat' ? () => actions.togglePin(thread) : undefined}
      onDelete={thread.kind === 'chat' ? () => actions.removeThread(thread) : undefined}
    />
  );

  return (
    <div
      className={cn(
        'mt-px ml-4 flex flex-col gap-px border-border/50 border-l pb-1 pl-1',
        'group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:border-l-0 group-data-[collapsible=icon]:pl-0',
      )}
      data-testid={`agent-threads-inline-${agent.id}`}
    >
      {roots.length === 0 ? (
        <p className="px-1.5 py-1 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          No threads yet.
        </p>
      ) : (
        <>
          <InlineNodes nodes={visible} renderRow={renderRow} />
          {hiddenCount > 0 ? (
            <button
              type="button"
              className="rounded-md px-1.5 py-0.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground group-data-[collapsible=icon]:hidden"
              onClick={() => setShowAll(true)}
            >
              Show {hiddenCount} more
            </button>
          ) : null}
          {showAll && roots.length > VISIBLE_ROOT_LIMIT ? (
            <button
              type="button"
              className="rounded-md px-1.5 py-0.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground group-data-[collapsible=icon]:hidden"
              onClick={() => setShowAll(false)}
            >
              Show less
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function InlineNodes({
  nodes,
  renderRow,
}: {
  nodes: ThreadTreeNode[];
  renderRow: (thread: Thread) => ReactNode;
}) {
  return (
    <>
      {nodes.map((node) => (
        <Fragment key={node.thread.id}>
          {renderRow(node.thread)}
          {node.children.length > 0 ? (
            <div className="ml-3 border-border/50 border-l pl-1.5">
              <InlineNodes nodes={node.children} renderRow={renderRow} />
            </div>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}

function InlineThreadRow({
  thread,
  selected,
  onSelect,
  onPinToggle,
  onDelete,
}: {
  thread: Thread;
  selected: boolean;
  onSelect: () => void;
  onPinToggle?: () => void;
  onDelete?: () => void;
}) {
  const { state, isMobile } = useSidebar();
  const iconMode = state === 'collapsed' && !isMobile;
  const running = useSessionStore((s) => Boolean(s.activeRuns[thread.id]));
  const waiting = useThreadWaiting(thread.id);
  const status = runStatus(running, waiting);
  const hasMenu = Boolean(onPinToggle || onDelete);
  const statusHint = [status, thread.unread ? 'unread' : null].filter(Boolean).join(' · ');
  const [menuOpen, setMenuOpen] = useState(false);
  const right = rowRight(status, thread, iconMode, menuOpen);

  return (
    <div
      className={cn(
        'group/ithread relative flex items-center rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
        'group-data-[collapsible=icon]:justify-center',
      )}
      data-testid={`agent-thread-${thread.id}`}
      data-selected={selected ? 'true' : 'false'}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md pr-2 pl-2 text-left group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:pr-0"
              onClick={onSelect}
            />
          }
        >
          <span className="inline-flex size-3 shrink-0 items-center justify-center text-muted-foreground">
            <MessageCircle className="size-3" />
          </span>
          {thread.pinned ? (
            <PinIcon className="size-2.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : null}
          {thread.parentThreadId ? (
            <GitBranchIcon className="size-2.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : null}
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-xs leading-none group-data-[collapsible=icon]:hidden',
              thread.unread && 'font-medium',
            )}
          >
            {thread.title}
          </span>
          {right}
        </TooltipTrigger>
        <TooltipContent side="right" hidden={!iconMode}>
          {thread.title}
          {statusHint ? ` · ${statusHint}` : ''}
        </TooltipContent>
      </Tooltip>
      {hasMenu ? (
        <DropdownMenu onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute top-0.5 right-1 z-10 size-5 opacity-0 group-hover/ithread:opacity-100 data-popup-open:opacity-100 group-data-[collapsible=icon]:hidden"
              />
            }
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontalIcon className="size-3 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
            <span className="sr-only">Thread actions</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenuGroup>
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

function runStatus(running: boolean, waiting: boolean): 'running' | 'waiting' | null {
  if (running) {
    return 'running';
  }
  if (waiting) {
    return 'waiting';
  }
  return null;
}

type RunStatus = ReturnType<typeof runStatus>;

function rowRight(
  status: RunStatus,
  thread: Thread,
  iconMode: boolean,
  menuOpen: boolean,
): ReactNode {
  if (status) {
    return (
      <span
        title={status}
        className={cn(
          'relative inline-flex size-1.5 shrink-0 rounded-full',
          status === 'running' && 'animate-pulse',
          status === 'running' ? 'bg-live' : 'bg-live/60',
        )}
      >
        <span className="sr-only">{status}</span>
      </span>
    );
  }
  if (thread.unread) {
    return (
      <span title="unread" className="relative inline-flex size-1.5 shrink-0 rounded-full bg-live">
        <span className="sr-only">unread</span>
      </span>
    );
  }
  if (iconMode) {
    return null;
  }
  return (
    <span
      className={cn(
        'shrink-0 font-mono text-[10px] text-muted-foreground/70 leading-none transition-opacity group-hover/ithread:opacity-0',
        menuOpen && 'opacity-0',
      )}
    >
      {threadTime(thread.updatedAt)}
    </span>
  );
}

function threadTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return formatClock(iso);
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
