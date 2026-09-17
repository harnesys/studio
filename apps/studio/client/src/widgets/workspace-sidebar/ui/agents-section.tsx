import { Fragment, type ReactNode, useEffect } from 'react';
import type { Agent } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import { useWorkspaces, type Workspace } from '@/entities/workspace';
import { useAgentsDisplayStore } from '@/features/desk';
import {
  confirmDeleteAgent,
  deleteAgent,
  openAgentConfigDialog,
  updateAgent,
  updateAgentCapabilities,
} from '@/features/manage-agent';
import { toast } from '@/shared/ui/toast';
import { AgentCard } from '@/widgets/agent-card';
import { useThreadActions } from '../model/thread-actions';
import { AgentInlineThreads } from './agent-inline-threads';
import { WorkspaceGroupLabel } from './workspace-group';

export { AgentsSectionActions } from './agents-section-menu';

export function AgentsSection({
  workspaceIds,
  agents,
  activeAgentId,
  activeThreadId,
  onSelectDone,
  groupActions,
}: {
  workspaceIds: string[];
  agents: Agent[];
  activeAgentId: string | null;
  activeThreadId: string | null;
  onSelectDone: () => void;
  groupActions?: (workspaceId: string) => ReactNode;
}) {
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];
  const expanded = useAgentsDisplayStore((state) => state.expanded);
  const toggleExpanded = useAgentsDisplayStore((state) => state.toggle);
  const roots = agents.filter((item) => !item.parentId);

  useEffect(() => {
    if (!activeThreadId) {
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
  }, [activeThreadId, roots]);

  const multi = workspaceIds.length > 1;
  const groups: { workspace: Workspace; agents: Agent[] }[] = [];
  for (const id of workspaceIds) {
    const workspace = workspaces.find((item) => item.id === id);
    if (!workspace) {
      continue;
    }
    const groupAgents = roots.filter((item) => item.workspaceId === id);
    if (groupAgents.length === 0 && !multi) {
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
          <WorkspaceGroupLabel
            name={group.workspace.name}
            count={group.agents.length}
            visible={multi}
            actions={multi ? groupActions?.(group.workspace.id) : undefined}
          />
          {group.agents.map((item) => (
            <AgentGroupRow
              key={item.id}
              agent={item}
              expanded={Boolean(expanded[item.id])}
              selected={activeAgentId === item.id}
              activeThreadId={activeThreadId}
              onSelectDone={onSelectDone}
              onToggleExpanded={() => toggleExpanded(item.id)}
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
  expanded,
  selected,
  activeThreadId,
  onSelectDone,
  onToggleExpanded,
  onSettings,
}: {
  agent: Agent;
  expanded: boolean;
  selected: boolean;
  activeThreadId: string | null;
  onSelectDone: () => void;
  onToggleExpanded: () => void;
  onSettings: () => void;
}) {
  const actions = useThreadActions(agent.workspaceId);

  return (
    <Fragment>
      <AgentCard
        agent={agent}
        selected={selected}
        onSelect={onToggleExpanded}
        onSettings={onSettings}
        onNewThread={() => actions.createThread(agent.id)}
        onDelete={() => {
          void confirmDeleteAgent(agent).then(async (confirmed) => {
            if (!confirmed) {
              return;
            }
            await deleteAgent(agent.workspaceId, agent.id);
            useAgentsDisplayStore.getState().forget(agent.id);
          });
        }}
      />
      {expanded ? (
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
