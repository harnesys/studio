import { useQuery } from '@tanstack/react-query';
import { BotIcon, SparklesIcon } from 'lucide-react';
import { Fragment, useEffect } from 'react';
import { useNavigate } from 'react-router';
import type { Agent } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import {
  AGENTS_THREAD_MODE_HINTS,
  AGENTS_THREAD_MODE_LABELS,
  AGENTS_THREAD_MODES,
  isAgentsThreadMode,
  useAgentsDisplayStore,
  useAgentsSlideStore,
} from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import {
  agentDraftFromPreset,
  confirmDeleteAgent,
  createAgent,
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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/shared/ui/dropdown-menu';
import { toast } from '@/shared/ui/toast';
import { AgentCard } from '@/widgets/agent-card';
import { useAccordionStore } from '../model/accordion.store';
import { useThreadActions } from '../model/thread-actions';
import { AgentInlineThreads } from './agent-inline-threads';
import { AgentThreadsPanel } from './agent-threads-panel';
import { SectionMenu } from './section-menu';

export function AgentsSectionActions({ workspaceId }: { workspaceId: string | null }) {
  const navigate = useNavigate();
  const slideAgentId = useAgentsSlideStore((state) => state.agentId);
  const mode = useAgentsDisplayStore((state) => state.mode);
  const setMode = useAgentsDisplayStore((state) => state.setMode);
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
    if (mode === 'inline') {
      useAgentsDisplayStore.getState().expand(created.agent.id);
    } else {
      useAgentsSlideStore.getState().open(created.agent.id);
    }
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
    const preset = presets.find((item) => item.id === presetId);
    if (!workspaceId || !preset) {
      return;
    }
    void openAgentConfigDialog(agentDraftFromPreset(preset), workspaceId).then(async (result) => {
      if (!result || !workspaceId) {
        return;
      }
      try {
        const created = await createAgent(workspaceId, result.fields);
        if (created) {
          await updateAgentCapabilities(workspaceId, created.agent.id, result.capabilities);
        }
      } catch (error) {
        toast.add({
          title: error instanceof Error ? error.message : 'Could not create agent',
        });
      }
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
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Threads</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => {
            if (isAgentsThreadMode(value)) {
              setMode(value);
            }
          }}
        >
          {AGENTS_THREAD_MODES.map((item) => (
            <DropdownMenuRadioItem key={item} value={item} className="flex-col items-start gap-0">
              <span>{AGENTS_THREAD_MODE_LABELS[item]}</span>
              <span className="text-muted-foreground text-xs leading-4">
                {AGENTS_THREAD_MODE_HINTS[item]}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
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
  const mode = useAgentsDisplayStore((state) => state.mode);
  const expanded = useAgentsDisplayStore((state) => state.expanded);
  const toggleExpanded = useAgentsDisplayStore((state) => state.toggle);
  const actions = useThreadActions(workspaceId ?? '');
  const inline = mode === 'inline';
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

  useEffect(() => {
    if (!inline || !activeThreadId) {
      return;
    }
    const thread = useThreadStore.getState().byId(activeThreadId);
    if (!thread) {
      return;
    }
    const owner = roots.find(
      (item) => item.id === thread.agentId || item.id === thread.originAgentId,
    );
    if (owner) {
      useAgentsDisplayStore.getState().expand(owner.id);
    }
  }, [inline, activeThreadId, roots]);

  if (!inline && slideAgent && workspaceId) {
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
      {roots.map((item) => (
        <Fragment key={item.id}>
          <AgentCard
            agent={item}
            selected={activeAgentId === item.id || slideAgentId === item.id}
            onSelect={() => {
              if (inline) {
                toggleExpanded(item.id);
                return;
              }
              openSlide(item.id);
              if (useAccordionStore.getState().collapsed.agents) {
                useAccordionStore.getState().toggle('agents');
              }
            }}
            onSettings={() => openSettings(item)}
            onNewThread={inline && workspaceId ? () => actions.createThread(item.id) : undefined}
            onDelete={() => {
              void confirmDeleteAgent(item).then(async (confirmed) => {
                if (!confirmed || !workspaceId) {
                  return;
                }
                await deleteAgent(workspaceId, item.id);
                useAgentsDisplayStore.getState().forget(item.id);
                if (useAgentsSlideStore.getState().agentId === item.id) {
                  resetSlide();
                }
              });
            }}
          />
          {inline && workspaceId && expanded[item.id] ? (
            <AgentInlineThreads
              agent={item}
              workspaceId={workspaceId}
              activeThreadId={activeThreadId}
              onDone={onSelectDone}
            />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}
