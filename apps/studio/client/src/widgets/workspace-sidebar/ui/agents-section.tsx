import { Fragment, useEffect } from 'react';
import type { Agent } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import { useWorkspaces, type Workspace } from '@/entities/workspace';
import { useAgentsDisplayStore, useAgentsSlideStore } from '@/features/desk';
import {
  confirmDeleteAgent,
  deleteAgent,
  openAgentConfigDialog,
  updateAgent,
  updateAgentCapabilities,
} from '@/features/manage-agent';
import { toast } from '@/shared/ui/toast';
import { AgentCard } from '@/widgets/agent-card';
import { useAccordionStore } from '../model/accordion.store';
import { useThreadActions } from '../model/thread-actions';
import { AgentInlineThreads } from './agent-inline-threads';
import { AgentThreadsPanel } from './agent-threads-panel';
import { WorkspaceGroupLabel } from './workspace-group';

export { AgentsSectionActions } from './agents-section-menu';

export function AgentsSection({
  workspaceIds,
  agents,
  activeAgentId,
  activeThreadId,
  onSelectDone,
}: {
  workspaceIds: string[];
  agents: Agent[];
  activeAgentId: string | null;
  activeThreadId: string | null;
  onSelectDone: () => void;
}) {
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];
  const slideAgentId = useAgentsSlideStore((state) => state.agentId);
  const openSlide = useAgentsSlideStore((state) => state.open);
  const resetSlide = useAgentsSlideStore((state) => state.reset);
  const mode = useAgentsDisplayStore((state) => state.mode);
  const expanded = useAgentsDisplayStore((state) => state.expanded);
  const toggleExpanded = useAgentsDisplayStore((state) => state.toggle);
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

  if (!inline && slideAgent) {
    return (
      <AgentThreadsPanel
        agent={slideAgent}
        workspaceId={slideAgent.workspaceId}
        activeThreadId={activeThreadId}
        onDone={onSelectDone}
      />
    );
  }

  const groups: { workspace: Workspace; agents: Agent[] }[] = [];
  for (const id of workspaceIds) {
    const workspace = workspaces.find((item) => item.id === id);
    if (!workspace) {
      continue;
    }
    const groupAgents = roots.filter((item) => item.workspaceId === id);
    if (groupAgents.length === 0) {
      continue;
    }
    groups.push({ workspace, agents: groupAgents });
  }

  if (groups.length === 0) {
    return (
      <p className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
        No agents in selected workspaces.
      </p>
    );
  }

  const openSettings = (item: Agent) => {
    void openAgentConfigDialog(item, item.workspaceId).then(async (result) => {
      if (!result) {
        return;
      }
      try {
        await updateAgent(item.workspaceId, item.id, result.fields);
        await updateAgentCapabilities(item.workspaceId, item.id, result.capabilities);
      } catch (error) {
        toast.add({
          title: error instanceof Error ? error.message : 'Could not save agent',
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
      {groups.map((group) => (
        <div key={group.workspace.id}>
          <WorkspaceGroupLabel name={group.workspace.name} count={group.agents.length} />
          {group.agents.map((item) => (
            <AgentGroupRow
              key={item.id}
              agent={item}
              inline={inline}
              expanded={Boolean(expanded[item.id])}
              selected={activeAgentId === item.id || slideAgentId === item.id}
              activeThreadId={activeThreadId}
              onSelectDone={onSelectDone}
              onToggleExpanded={() => toggleExpanded(item.id)}
              onOpenSlide={() => {
                openSlide(item.id);
                if (useAccordionStore.getState().collapsed.agents) {
                  useAccordionStore.getState().toggle('agents');
                }
              }}
              onSettings={() => openSettings(item)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function AgentGroupRow({
  agent,
  inline,
  expanded,
  selected,
  activeThreadId,
  onSelectDone,
  onToggleExpanded,
  onOpenSlide,
  onSettings,
}: {
  agent: Agent;
  inline: boolean;
  expanded: boolean;
  selected: boolean;
  activeThreadId: string | null;
  onSelectDone: () => void;
  onToggleExpanded: () => void;
  onOpenSlide: () => void;
  onSettings: () => void;
}) {
  const actions = useThreadActions(agent.workspaceId);
  const resetSlide = useAgentsSlideStore((state) => state.reset);

  return (
    <Fragment>
      <AgentCard
        agent={agent}
        selected={selected}
        onSelect={() => {
          if (inline) {
            onToggleExpanded();
            return;
          }
          onOpenSlide();
        }}
        onSettings={onSettings}
        onNewThread={inline ? () => actions.createThread(agent.id) : undefined}
        onDelete={() => {
          void confirmDeleteAgent(agent).then(async (confirmed) => {
            if (!confirmed) {
              return;
            }
            await deleteAgent(agent.workspaceId, agent.id);
            useAgentsDisplayStore.getState().forget(agent.id);
            if (useAgentsSlideStore.getState().agentId === agent.id) {
              resetSlide();
            }
          });
        }}
      />
      {inline && expanded ? (
        <AgentInlineThreads
          agent={agent}
          workspaceId={agent.workspaceId}
          activeThreadId={activeThreadId}
          onDone={onSelectDone}
        />
      ) : null}
    </Fragment>
  );
}
