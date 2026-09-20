import { useQuery } from '@tanstack/react-query';
import { BotIcon, PlusIcon, PuzzleIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import { agentColorClass, useAgentStore } from '@/entities/agent';
import { listAgentPresets, pluginsQuery } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { Button } from '@/shared/ui/button';
import { Pane, Row, RowChip, RowList, RowSection } from '@/shared/ui/capability-rows';
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
  enabledPlugins: Record<string, boolean>;
  onConfigure: (agent: Agent) => void;
};
export function AgentSubagentsPane({
  workspaceId,
  parentId,
  enabledPlugins,
  onConfigure,
}: AgentSubagentsPaneProps) {
  const delegates = useAgentStore(
    useShallow((state) => state.items.filter((item) => item.parentId === parentId)),
  );
  const pluginsListQuery = useQuery({
    ...pluginsQuery(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const pluginSections = (pluginsListQuery.data ?? [])
    .filter((item) => enabledPlugins[item.plugin.name] === true)
    .map((item) => ({
      plugin: item.plugin.name,
      agents: item.plugin.components.filter(
        (component) => component.kind === 'agent' && component.status === 'native',
      ),
    }))
    .filter((section) => section.agents.length > 0)
    .sort((a, b) => a.plugin.localeCompare(b.plugin));
  const presetsQuery = useQuery({
    queryKey: ['agent-presets'],
    queryFn: listAgentPresets,
    staleTime: 60000,
  });
  const presets = (presetsQuery.data ?? []).filter((preset) => !preset.capabilities?.agents);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Agent | null>(null);
  const deleteResolver = useRef<((confirmed: boolean) => void) | null>(null);
  const confirmDelete = (delegate: Agent): Promise<boolean> =>
    new Promise((resolve) => {
      deleteResolver.current = resolve;
      setPendingDelete(delegate);
    });
  const settleDelete = (confirmed: boolean): void => {
    deleteResolver.current?.(confirmed);
    deleteResolver.current = null;
    setPendingDelete(null);
  };
  const addFromPreset = async (presetId: string) => {
    setCreating(true);
    try {
      const result = await createAgentFromPreset(workspaceId, presetId, { parentId });
      if (result) {
        toast.add({ title: 'Subagent added' });
      }
    } catch (error) {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not add subagent',
      });
    } finally {
      setCreating(false);
    }
  };
  return (
    <>
      <Pane
        testId="agent-subagents-pane"
        label="Subagents"
        count={delegates.length + pluginSections.reduce((n, s) => n + s.agents.length, 0)}
        description="Spawn targets for this agent."
        extra={
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={creating}
              render={<Button type="button" variant="ghost" size="sm" />}
            >
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
        {delegates.length === 0 && pluginSections.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-sm">
            No subagents yet.
          </p>
        ) : null}
        {delegates.length > 0 ? (
          <RowSection label="Direct" count={delegates.length}>
            <RowList>
              {delegates.map((delegate) => (
                <SubagentRow
                  key={delegate.id}
                  agent={delegate}
                  onOpen={() => onConfigure(delegate)}
                  onRemove={() => {
                    void confirmDelete(delegate).then(async (confirmed) => {
                      if (!confirmed) {
                        return;
                      }
                      await deleteAgent(workspaceId, delegate.id);
                    });
                  }}
                />
              ))}
            </RowList>
          </RowSection>
        ) : null}
        {pluginSections.map((section) => (
          <RowSection key={section.plugin} label={section.plugin} count={section.agents.length}>
            <RowList>
              {section.agents.map((agent) => (
                <PluginAgentRow key={agent.source.file} name={agentFileName(agent.source.file)} />
              ))}
            </RowList>
          </RowSection>
        ))}
      </Pane>
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            settleDelete(false);
          }
        }}
      >
        <AlertDialogContent size="sm" data-testid="delete-subagent-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This subagent is removed from the parent. Spawn history on threads is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settleDelete(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => settleDelete(true)}>
              Delete subagent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
function agentFileName(file: string): string {
  const base = file.slice(file.lastIndexOf('/') + 1);
  return base.replace(/\.md$/, '') || file;
}
function PluginAgentRow({ name }: { name: string }) {
  return (
    <Row
      testId={`draft-plugin-agent-${name}`}
      icon={<PuzzleIcon />}
      title={name}
      mono={false}
      chips={<RowChip>plugin</RowChip>}
      summary="Provided by the plugin; configured in the plugin itself."
    />
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
      icon={<BotIcon />}
      title={agent.name}
      mono={false}
      meta={agent.role}
      summary={agent.instructions.trim() || 'No instructions yet.'}
      chips={
        <span
          aria-hidden
          className={cn('size-2 shrink-0 self-center rounded-full', agentColorClass(agent.color))}
        />
      }
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
