import { useQuery } from '@tanstack/react-query';
import { PlusIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import { useAgentStore } from '@/entities/agent';
import { listAgentPresets } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { toast } from '@/shared/ui/toast';

import { createAgentFromPreset } from '../model/create-agent-from-preset';
import { deleteAgent } from '../model/delete-agent';

type AgentSubagentsPaneProps = {
  workspaceId: string;
  parentId: string;
  onConfigure: (agent: Agent) => void;
  onConfirmDelete: (agent: Agent) => Promise<boolean>;
};

export function AgentSubagentsPane({
  workspaceId,
  parentId,
  onConfigure,
  onConfirmDelete,
}: AgentSubagentsPaneProps) {
  const delegates = useAgentStore(
    useShallow((state) => state.items.filter((item) => item.parentId === parentId)),
  );
  const presetsQuery = useQuery({
    queryKey: ['agent-presets'],
    queryFn: listAgentPresets,
    staleTime: 60_000,
  });
  const presets = presetsQuery.data ?? [];

  const addFromPreset = (presetId: string) => {
    void createAgentFromPreset(workspaceId, presetId, { parentId })
      .then(() => {
        toast.add({ title: 'Subagent added' });
      })
      .catch((err: unknown) => {
        toast.add({
          title: 'Could not add subagent',
          description: err instanceof Error ? err.message : String(err),
        });
      });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Spawn targets for this agent. They stay out of the top-level Agents list. Model defaults to
        the parent; open a card to change it.
      </p>
      <div className="flex flex-col gap-2">
        {delegates.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-sm">
            No subagents yet.
          </p>
        ) : (
          delegates.map((delegate) => (
            <SubagentCard
              key={delegate.id}
              agent={delegate}
              onOpen={() => onConfigure(delegate)}
              onRemove={() => {
                void onConfirmDelete(delegate).then(async (confirmed) => {
                  if (!confirmed) {
                    return;
                  }
                  await deleteAgent(workspaceId, delegate.id);
                });
              }}
            />
          ))
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="outline" size="sm" className="w-fit gap-1.5" />}
        >
          <PlusIcon className="size-3.5" />
          Add from preset
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          {presets.length === 0 ? (
            <DropdownMenuItem disabled>
              {presetsQuery.isLoading ? 'Loading…' : 'No presets found'}
            </DropdownMenuItem>
          ) : (
            presets.map((preset) => (
              <DropdownMenuItem key={preset.id} onClick={() => addFromPreset(preset.id)}>
                <SparklesIcon className="size-3" />
                {preset.name}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SubagentCard({
  agent,
  onOpen,
  onRemove,
}: {
  agent: Agent;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        'group/subagent relative flex items-start gap-3 rounded-lg border bg-card/40 px-3 py-2.5',
        'transition-colors hover:border-border hover:bg-muted/40',
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
        onClick={onOpen}
      >
        <Avatar size="sm" className="mt-0.5 size-8 shrink-0 after:hidden">
          <AvatarFallback className="bg-[color-mix(in_oklab,var(--live)_12%,transparent)] text-[11px]">
            {agent.initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-medium text-sm leading-5">{agent.name}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
              {agent.role}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs leading-4">
            {agent.instructions.trim() || 'No instructions yet.'}
          </p>
        </div>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/subagent:opacity-100"
        title="Remove subagent"
        onClick={onRemove}
      >
        <Trash2Icon className="size-3.5" />
      </Button>
    </div>
  );
}
