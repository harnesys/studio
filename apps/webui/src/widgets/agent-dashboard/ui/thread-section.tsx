import { CalendarClockIcon, MessageSquareIcon, MoreHorizontalIcon, PinIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useSessionStore } from '@/entities/session';
import type { Thread } from '@/entities/thread';
import { useThreadWaiting } from '@/features/desk';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Button } from '@/shared/ui/button';
import { CategoryLandingList, CategoryLandingSectionLabel } from '@/shared/ui/category-landing';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

const THREAD_PREVIEW_LIMIT = 4;
export function ThreadSection({
  label,
  emptyLabel,
  threads,
  onOpen,
  onPinToggle,
  onDelete,
}: {
  label: string;
  emptyLabel: string;
  threads: Thread[];
  onOpen: (thread: Thread) => void;
  onPinToggle: (thread: Thread) => void;
  onDelete: (thread: Thread) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? threads : threads.slice(0, THREAD_PREVIEW_LIMIT);
  const hidden = threads.length - shown.length;
  return (
    <div className="min-w-0">
      <CategoryLandingSectionLabel>{`${label} · ${threads.length}`}</CategoryLandingSectionLabel>
      {threads.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyLabel}</p>
      ) : (
        <>
          <CategoryLandingList>
            {shown.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                onOpen={() => onOpen(thread)}
                onPinToggle={() => onPinToggle(thread)}
                onDelete={() => onDelete(thread)}
              />
            ))}
          </CategoryLandingList>
          <ExpandToggle
            hidden={hidden}
            expanded={expanded}
            collapsible={threads.length > THREAD_PREVIEW_LIMIT}
            label={label}
            onExpand={() => setExpanded(true)}
            onCollapse={() => setExpanded(false)}
          />
        </>
      )}
    </div>
  );
}
function ExpandToggle({
  hidden,
  expanded,
  collapsible,
  label,
  onExpand,
  onCollapse,
}: {
  hidden: number;
  expanded: boolean;
  collapsible: boolean;
  label: string;
  onExpand: () => void;
  onCollapse: () => void;
}) {
  if (!expanded && hidden > 0) {
    return <ToggleRow onClick={onExpand}>{`+${hidden} more ${label.toLowerCase()}`}</ToggleRow>;
  }
  if (expanded && collapsible) {
    return <ToggleRow onClick={onCollapse}>Show less</ToggleRow>;
  }
  return null;
}
function ToggleRow({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 pl-2 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </button>
  );
}
function ThreadRow({
  thread,
  onOpen,
  onPinToggle,
  onDelete,
}: {
  thread: Thread;
  onOpen: () => void;
  onPinToggle: () => void;
  onDelete: () => void;
}) {
  const running = useSessionStore((state) => Boolean(state.activeRuns[thread.id]));
  const waiting = useThreadWaiting(thread.id);
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
  let status: ReactNode = null;
  if (parts.length > 0) {
    const tone = runState === 'waiting' ? 'text-live/70' : 'text-live';
    status = <span className={tone}>{parts.join(' · ')}</span>;
  }
  return (
    <li className="group/row relative">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 rounded-lg border border-transparent py-2 pr-9 pl-2 text-left transition-colors hover:border-border/70 hover:bg-background/60 focus-visible:border-live/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/15"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground [&_svg]:size-3.5">
          {thread.kind === 'schedule' ? <CalendarClockIcon /> : <MessageSquareIcon />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1">
            {thread.pinned ? (
              <PinIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
            <span className="block truncate text-sm leading-4">{thread.title}</span>
          </span>
          <span className="block truncate font-mono text-[11px] text-muted-foreground leading-4">
            {formatDayTime(thread.updatedAt)}
          </span>
        </span>
        {status ? (
          <span className="shrink-0 font-mono text-[10px] leading-none">{status}</span>
        ) : null}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-1 right-1 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 data-open:opacity-100"
            />
          }
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontalIcon />
          <span className="sr-only">Thread actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onPinToggle}>
              {thread.pinned ? 'Unpin' : 'Pin'}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
