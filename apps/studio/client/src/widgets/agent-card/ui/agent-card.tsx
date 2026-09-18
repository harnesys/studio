import { MessageCirclePlusIcon, MoreHorizontalIcon } from 'lucide-react';
import type { Agent, AgentStatus } from '@/entities/agent';
import { agentColorTintClass, statusLabel } from '@/entities/agent';
import { useAgentHasUnread, useAgentLiveStatus } from '@/features/desk';
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

type AgentCardProps = {
  agent: Agent;
  selected?: boolean;
  onSelect: () => void;
  onSettings: () => void;
  onDelete: () => void;
  onNewThread?: () => void;
};

export function AgentCard({
  agent,
  selected,
  onSelect,
  onSettings,
  onDelete,
  onNewThread,
}: AgentCardProps) {
  const { state, isMobile } = useSidebar();
  const iconMode = state === 'collapsed' && !isMobile;
  const status = useAgentLiveStatus(agent.id);
  const hasUnread = useAgentHasUnread(agent.id);

  return (
    <div
      className={cn(
        'group/agent relative flex items-center rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent text-sidebar-accent-foreground',
        'group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center',
      )}
      data-testid={`agent-card-${agent.id}`}
      data-selected={selected ? 'true' : 'false'}
      data-unread={hasUnread ? 'true' : 'false'}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
              onClick={onSelect}
            />
          }
        >
          <div className="relative inline-flex size-4 shrink-0">
            <span
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-full font-medium text-[8px] leading-none',
                agentColorTintClass(agent.color),
              )}
            >
              {agent.initials.slice(0, 2)}
            </span>
            {hasUnread ? (
              <span
                title="Unread messages"
                className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-live ring-2 ring-sidebar"
              >
                <span className="sr-only">Unread messages</span>
              </span>
            ) : null}
          </div>
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm leading-4 group-data-[collapsible=icon]:hidden',
              status === 'offline' && 'text-muted-foreground',
              hasUnread && 'font-medium',
            )}
          >
            {agent.name}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" hidden={!iconMode}>
          {agent.name}
          {hasUnread ? ' · unread' : ''}
        </TooltipContent>
      </Tooltip>
      <div
        className={cn(
          'shrink-0 pr-2 font-mono text-[8px] transition-opacity group-hover/agent:opacity-0 group-data-[collapsible=icon]:hidden',
          statusInk(status),
        )}
      >
        {statusLabel(status)}
      </div>
      {onNewThread ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="New thread"
          className="absolute top-1/2 right-[28px] -translate-y-1/2 opacity-0 group-hover/agent:opacity-100 group-data-[collapsible=icon]:hidden"
          data-testid={`agent-new-thread-${agent.id}`}
          onClick={(event) => {
            event.stopPropagation();
            onNewThread();
          }}
        >
          <MessageCirclePlusIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
          <span className="sr-only">New thread</span>
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover/agent:opacity-100 data-open:opacity-100 group-data-[collapsible=icon]:hidden"
            />
          }
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontalIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
          <span className="sr-only">Agent actions</span>
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
    </div>
  );
}

function statusInk(status: AgentStatus): string {
  switch (status) {
    case 'running':
      return 'text-live';
    case 'waiting':
      return 'text-live/70';
    case 'error':
      return 'text-destructive';
    case 'offline':
      return 'text-muted-foreground/70';
    case 'idle':
      return 'text-muted-foreground';
  }
}
