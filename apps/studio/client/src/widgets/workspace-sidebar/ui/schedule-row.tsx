import { CalendarClockIcon, MoreHorizontalIcon } from 'lucide-react';
import { type Schedule, scheduleInk, scheduleStatusLabel } from '@/entities/schedule';
import { useThreadWaiting } from '@/features/desk';
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

export function ScheduleRow({
  schedule,
  selected,
  onSelect,
  onSettings,
  onDelete,
}: {
  schedule: Schedule;
  selected: boolean;
  onSelect: (waiting: boolean) => void;
  onSettings: () => void;
  onDelete: () => void;
}) {
  const { state, isMobile } = useSidebar();
  const iconMode = state === 'collapsed' && !isMobile;
  const waiting = useThreadWaiting(schedule.threadId);

  return (
    <div
      className={cn(
        'group/auto relative flex items-start rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
        'group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center',
      )}
      data-testid={`schedule-${schedule.id}`}
      data-selected={selected ? 'true' : 'false'}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-left group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
              onClick={() => onSelect(waiting)}
            />
          }
        >
          <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center group-data-[collapsible=icon]:mt-0">
            <CalendarClockIcon className="size-3.5 text-muted-foreground" />
          </span>
          <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm leading-4">{schedule.name}</span>
            <span className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground leading-4">
                {schedule.cron}
              </span>
              <span
                className={cn(
                  'shrink-0 font-mono text-[8px]',
                  waiting ? 'text-live/70' : scheduleInk(schedule.status),
                )}
              >
                {waiting ? 'Waiting' : scheduleStatusLabel(schedule.status)}
              </span>
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" hidden={!iconMode}>
          {schedule.name}
        </TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-1 right-1 opacity-0 group-hover/auto:opacity-100 data-open:opacity-100 group-data-[collapsible=icon]:hidden"
            />
          }
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontalIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
          <span className="sr-only">Schedule actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onSettings}>Settings</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-0.5 bottom-0.5 hidden size-1 rounded-full bg-current group-data-[collapsible=icon]:block',
          waiting ? 'text-live/70' : scheduleInk(schedule.status),
        )}
      />
    </div>
  );
}
