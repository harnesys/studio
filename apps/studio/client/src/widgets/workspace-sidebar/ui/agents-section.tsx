import { useQuery } from '@tanstack/react-query';
import { BotIcon, SparklesIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import type { Agent } from '@/entities/agent';
import { useAgentsSlideStore } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import {
  confirmDeleteAgent,
  createAgent,
  createAgentFromPreset,
  deleteAgent,
  openAgentConfigDialog,
  updateAgent,
  updateAgentCapabilities,
} from '@/features/manage-agent';
import { listAgentPresets } from '@/shared/api';
import { studioPath } from '@/shared/config/routes';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/shared/ui/dropdown-menu';
import { toast } from '@/shared/ui/toast';
import { AgentCard } from '@/widgets/agent-card';
import { useAccordionStore } from '../model/accordion.store';
import { AgentThreadsPanel } from './agent-threads-panel';
import { DelegateRow } from './delegate-row';
import { SectionMenu } from './section-menu';

export function AgentsSectionActions({ workspaceId }: { workspaceId: string | null }) {
  const navigate = useNavigate();
  const slideAgentId = useAgentsSlideStore((state) => state.agentId);
  const presetsQuery = useQuery({
    queryKey: ['agent-presets'],
    queryFn: listAgentPresets,
    staleTime: 60_000,
  });
  if (slideAgentId) {
    return null;
  }

  const openCreated = async (created: { agent: Agent; thread: { id: string } | null }) => {
    if (!workspaceId || !created.thread) {
      return;
    }
    useIdeStore.getState().openThread(workspaceId, created.agent.id, created.thread.id);
    useAgentsSlideStore.getState().open(created.agent.id);
    await navigate(
      studioPath.thread(workspaceId, created.thread.id, {
        kind: 'agent',
        id: created.agent.id,
      }),
    );
  };

  const createAgentFlow = () => {
    void openAgentConfigDialog(null, workspaceId ?? '').then(async (result) => {
      if (!result || !workspaceId) {
        return;
      }
      try {
        const created = await createAgent(workspaceId, result.fields);
        if (created) {
          await updateAgentCapabilities(workspaceId, created.agent.id, result.capabilities);
          await openCreated(created);
        }
      } catch (error) {
        toast.add({
          title: error instanceof Error ? error.message : 'Could not create agent',
        });
      }
    });
  };

  const createFromPreset = (presetId: string) => {
    if (!workspaceId) {
      return;
    }
    void createAgentFromPreset(workspaceId, presetId)
      .then(async (created) => {
        if (created) {
          await openCreated(created);
        }
      })
      .catch((err: unknown) => {
        toast.add({
          title: 'Could not create from preset',
          description: err instanceof Error ? err.message : String(err),
        });
      });
  };

  const presets = presetsQuery.data ?? [];

  return (
    <SectionMenu label="Agent actions" contentClassName="w-full">
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={createAgentFlow}>
          <BotIcon className="size-3" />
          Create Agent
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SparklesIcon className="size-3" />
            From Preset
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-44">
            {presets.length === 0 ? (
              <DropdownMenuItem disabled>
                {presetsQuery.isLoading ? 'Loading…' : 'No presets found'}
              </DropdownMenuItem>
            ) : (
              presets.map((preset) => (
                <DropdownMenuItem key={preset.id} onClick={() => createFromPreset(preset.id)}>
                  <SparklesIcon className="size-3" />
                  {preset.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
    </SectionMenu>
  );
}

export function AgentsSection({
  workspaceId,
  agents,
  activeAgentId,
  activeThreadId,
  onSelectDone,
}: {
  workspaceId: string | null;
  agents: Agent[];
  activeAgentId: string | null;
  activeThreadId: string | null;
  onSelectDone: () => void;
}) {
  const slideAgentId = useAgentsSlideStore((state) => state.agentId);
  const openSlide = useAgentsSlideStore((state) => state.open);
  const resetSlide = useAgentsSlideStore((state) => state.reset);
  const roots = agents.filter((item) => !item.parentId);
  const slideAgent = agents.find((item) => item.id === slideAgentId && !item.parentId) ?? null;

  useEffect(() => {
    resetSlide();
  }, [resetSlide]);

  useEffect(() => {
    if (slideAgentId && !roots.some((item) => item.id === slideAgentId)) {
      resetSlide();
    }
  }, [roots, slideAgentId, resetSlide]);

  useEffect(() => {
    if (slideAgentId && useAccordionStore.getState().collapsed.agents) {
      useAccordionStore.getState().toggle('agents');
    }
  }, [slideAgentId]);

  if (slideAgent && workspaceId) {
    return (
      <AgentThreadsPanel
        agent={slideAgent}
        workspaceId={workspaceId}
        activeThreadId={activeThreadId}
        onDone={onSelectDone}
      />
    );
  }

  if (roots.length === 0) {
    return (
      <p className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
        No agents in this workspace yet.
      </p>
    );
  }

  const openSettings = (item: Agent) => {
    if (!workspaceId) {
      return;
    }
    void openAgentConfigDialog(item, workspaceId).then(async (result) => {
      if (!result) {
        return;
      }
      try {
        await updateAgent(workspaceId, item.id, result.fields);
        await updateAgentCapabilities(workspaceId, item.id, result.capabilities);
      } catch (error) {
        toast.add({
          title: error instanceof Error ? error.message : 'Could not save agent',
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
      {roots.map((item) => {
        const delegates = agents.filter((child) => child.parentId === item.id);
        return (
          <div key={item.id} className="flex flex-col gap-0">
            <AgentCard
              agent={item}
              selected={activeAgentId === item.id || slideAgentId === item.id}
              onSelect={() => {
                openSlide(item.id);
                if (useAccordionStore.getState().collapsed.agents) {
                  useAccordionStore.getState().toggle('agents');
                }
              }}
              onSettings={() => openSettings(item)}
              onDelete={() => {
                void confirmDeleteAgent(item).then(async (confirmed) => {
                  if (!confirmed || !workspaceId) {
                    return;
                  }
                  await deleteAgent(workspaceId, item.id);
                  if (useAgentsSlideStore.getState().agentId === item.id) {
                    resetSlide();
                  }
                });
              }}
            />
            {delegates.length > 0 ? (
              <div className="ml-4 flex flex-col border-sidebar-border border-l pl-1.5 group-data-[collapsible=icon]:hidden">
                {delegates.map((delegate) => (
                  <DelegateRow
                    key={delegate.id}
                    agent={delegate}
                    onSettings={() => openSettings(delegate)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
