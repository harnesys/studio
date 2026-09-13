import { useQuery } from '@tanstack/react-query';
import { PlusIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import { useAgentStore } from '@/entities/agent';
import { listAgentPresets } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Pane, Row, RowList } from '@/shared/ui/capability-rows';
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

  const addFromPreset = async (presetId: string) => {
    try {
      const result = await createAgentFromPreset(workspaceId, presetId, { parentId });
      if (result) {
        toast.add({ title: 'Subagent added' });
      }
    } catch (error) {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not add subagent',
      });
    }
  };

  return (
    <Pane
      testId="agent-subagents-pane"
      label="Subagents"
      count={delegates.length}
      description="Spawn targets for this agent."
      extra={
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
            <PlusIcon />
            Add from preset
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            {presets.length === 0 ? (
              <DropdownMenuItem disabled>
                {presetsQuery.isLoading ? 'Loading…' : 'No presets found'}
              </DropdownMenuItem>
            ) : (
              presets.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onClick={() => {
                    void addFromPreset(preset.id);
                  }}
                >
                  <SparklesIcon className="size-3" />
                  {preset.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {delegates.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">No subagents yet.</p>
      ) : (
        <RowList>
          {delegates.map((delegate) => (
            <SubagentRow
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
          ))}
        </RowList>
      )}
    </Pane>
  );
}

function SubagentRow({
  agent,
  onOpen,
  onRemove,
}: {
  agent: Agent;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <Row
      testId={`draft-subagent-${agent.id}`}
      title={agent.name}
      mono={false}
      meta={agent.role}
      summary={agent.instructions.trim() || 'No instructions yet.'}
      chevron="open"
      onToggle={onOpen}
      actions={
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Remove subagent"
          onClick={onRemove}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      }
    />
  );
}
