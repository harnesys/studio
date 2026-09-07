import { BotIcon, SparklesIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import type { Agent } from '@/entities/agent';
import { useAgentsSlideStore } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import {
  confirmDeleteAgent,
  createAgent,
  deleteAgent,
  openAgentConfigDialog,
  updateAgent,
  updateAgentCapabilities,
} from '@/features/manage-agent';
import { studioPath } from '@/shared/config/routes';
import { DropdownMenuGroup, DropdownMenuItem } from '@/shared/ui/dropdown-menu';
import { toast } from '@/shared/ui/toast';
import { AgentCard } from '@/widgets/agent-card';
import { useAccordionStore } from '../model/accordion.store';
import { AgentThreadsPanel } from './agent-threads-panel';
import { SectionMenu } from './section-menu';

export function AgentsSectionActions({ workspaceId }: { workspaceId: string | null }) {
  const navigate = useNavigate();
  const slideAgentId = useAgentsSlideStore((state) => state.agentId);
  if (slideAgentId) {
    return null;
  }

  const createAgentFlow = () => {
    void openAgentConfigDialog(null, workspaceId ?? '').then(async (result) => {
      if (!result || !workspaceId) {
        return;
      }
      const created = await createAgent(workspaceId, result.fields);
      if (created) {
        await updateAgentCapabilities(workspaceId, created.agent.id, result.capabilities);
        useIdeStore.getState().openThread(workspaceId, created.agent.id, created.thread.id);
        useAgentsSlideStore.getState().open(created.agent.id);
        await navigate(
          studioPath.thread(workspaceId, created.thread.id, {
            kind: 'agent',
            id: created.agent.id,
          }),
        );
      }
    });
  };

  return (
    <SectionMenu label="Agent actions">
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={createAgentFlow}>
          <BotIcon />
          Create Agent
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toast.add({ title: 'Presets are coming soon' })}>
          <SparklesIcon />
          From Preset
        </DropdownMenuItem>
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
  const slideAgent = agents.find((item) => item.id === slideAgentId) ?? null;

  useEffect(() => {
    resetSlide();
  }, [workspaceId, resetSlide]);

  useEffect(() => {
    if (slideAgentId && !agents.some((item) => item.id === slideAgentId)) {
      resetSlide();
    }
  }, [agents, slideAgentId, resetSlide]);

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

  if (agents.length === 0) {
    return (
      <p className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
        No agents in this workspace yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
      {agents.map((item) => (
        <AgentCard
          key={item.id}
          agent={item}
          selected={activeAgentId === item.id || slideAgentId === item.id}
          onSelect={() => {
            openSlide(item.id);
            if (useAccordionStore.getState().collapsed.agents) {
              useAccordionStore.getState().toggle('agents');
            }
            onSelectDone();
          }}
          onSettings={() => {
            if (!workspaceId) {
              return;
            }
            void openAgentConfigDialog(item, workspaceId).then(async (result) => {
              if (!result) {
                return;
              }
              await updateAgent(workspaceId, item.id, result.fields);
              await updateAgentCapabilities(workspaceId, item.id, result.capabilities);
            });
          }}
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
      ))}
    </div>
  );
}
