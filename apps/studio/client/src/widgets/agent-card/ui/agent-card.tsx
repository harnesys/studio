import { MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import type { Agent, AgentStatus } from '@/entities/agent';
import { agentColorTintClass, statusLabel } from '@/entities/agent';
import { useAgentHasUnread, useAgentLiveStatus } from '@/features/desk';
import { cn } from '@/shared/lib/utils';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
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
        'group/agent relative flex items-start rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent text-sidebar-accent-foreground',
        'group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center',
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
              className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-left group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
              onClick={onSelect}
            />
          }
        >
          <div className="relative mr-0.5 inline-flex size-5 shrink-0">
            <Avatar size="sm" className="size-5 after:hidden">
              <AvatarFallback className={agentColorTintClass(agent.color)}>
                {agent.initials}
              </AvatarFallback>
            </Avatar>
            {hasUnread ? (
              <span
                title="Unread messages"
                className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-live ring-2 ring-sidebar"
              >
                <span className="sr-only">Unread messages</span>
              </span>
            ) : null}
          </div>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div
              className={cn(
                'flex min-w-0 items-center gap-1.5 text-sm leading-4',
                status === 'offline' && 'text-muted-foreground',
                hasUnread && 'font-medium',
              )}
            >
              <span className="truncate">{agent.name}</span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-2">
              <div className="min-w-0 truncate text-[11px] text-muted-foreground leading-3">
                {agent.instructions}
              </div>
              <div className={cn('shrink-0 font-mono text-[8px]', statusInk(status))}>
                {statusLabel(status)}
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" hidden={!iconMode}>
          {agent.name}
          {hasUnread ? ' · unread' : ''}
        </TooltipContent>
      </Tooltip>
      {onNewThread ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="New thread"
          className="absolute top-1 right-[30px] opacity-0 group-hover/agent:opacity-100 group-data-[collapsible=icon]:hidden"
          data-testid={`agent-new-thread-${agent.id}`}
          onClick={(event) => {
            event.stopPropagation();
            onNewThread();
          }}
        >
          <PlusIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
          <span className="sr-only">New thread</span>
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-1 right-1 opacity-0 group-hover/agent:opacity-100 data-open:opacity-100 group-data-[collapsible=icon]:hidden"
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
